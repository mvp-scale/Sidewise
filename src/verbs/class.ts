/**
 * class: "does the evidence support this one goal?" One pass through the contract:
 *   request → evidence → reuse what the ledger already answered for the same questions on the same evidence →
 *   (dry run: stop here) → preflight → one call for the rest → grade → consensus → the spend and the run in
 *   one lock section → the compact side: response. A run fully answered from the ledger makes no call and is
 *   free (BRIEF §5: sweeps and one-subject runs reuse alike). fix #5a/#5b: reuse is resolved BEFORE preflight
 *   (not after), so a fully-reused run's free call is never blocked by an already-reached budget cap, and a
 *   dry run can predict how much of it would be reused.
 */
import { providerIdentity } from '../classifier/select.ts';
import { checkBudget, loadBudget } from '../budget/budget.ts';
import type { Value } from '../contract/emit.ts';
import { gradeSubject } from '../contract/grade.ts';
import { answerKey, goalQuestion, subjectEvidence, subjectQuestions } from '../contract/translate.ts';
import type { Answer } from '../contract/types.ts';
import { IRREVERSIBLE_NOTE } from '../contract/validate.ts';
import { readCodeEvidence } from '../evidence/code.ts';
import type { NewContractRun } from '../ledger/log.ts';
import { redact } from '../ledger/redact.ts';
import { lookupAnswers } from '../ledger/reuse.ts';
import { computeConsensus, type SlotAnswer } from '../lens/consensus.ts';
import { actorOf, askAll, createdNote, preflight, record, recordFree, type PlannedCall } from './pay.ts';
import { loadRequest, stopText } from './request.ts';
import { commonNotes, COST_ESTIMATED_NOTE, dryRunText, outcomeNext, respondText, reusedIds, subjectSide, wiseRecorded } from './respond.ts';
import type { VerbContext, VerbResult } from './types.ts';

const CAP_NOTE = 'would be blocked: the budget cap is already reached';

export async function runClass(text: string, ctx: VerbContext): Promise<VerbResult> {
  const loaded = loadRequest(text, 'class');
  if (!loaded.ok) return loaded.result;
  const { request } = loaded;

  // Evidence is read before touching budget or ledger at all: a bad path is a request problem, not a paid one.
  const evidence = readCodeEvidence(ctx.paths.root, request.side.where);
  if (!evidence.ok) return { exit: 2, text: stopText(evidence.errors, 'class') };

  const identity = providerIdentity(ctx.env);
  const who = { adapter: ctx.provider.adapter, model: ctx.provider.model };
  const evidenceStr = subjectEvidence(evidence.evidence.files);
  const questions = [goalQuestion(request.side.goal), ...subjectQuestions(request.side.categories)];
  const keyed = questions.map((q) => [q, answerKey(evidenceStr, q)] as const);
  // readOnly on a dry run (design binding "dry runs and free reads write nothing"): never persists a catch-up
  // or rebuild of index.db just to predict what a real run would do.
  const reused = lookupAnswers(ctx.paths, who, keyed.map(([, k]) => k), { readOnly: ctx.dryRun ?? false });

  const answers: Record<string, Answer> = {};
  const reusedFrom: Record<string, string> = {};
  const toAsk: (typeof keyed)[number][] = [];
  for (const [q, k] of keyed) {
    const hit = reused.get(k);
    if (hit) {
      answers[q.id] = hit.answer;
      reusedFrom[q.id] = hit.id;
    } else {
      toAsk.push([q, k]);
    }
  }

  if (ctx.dryRun) {
    // fix #5b: a dry run predicts reuse, and checks (without spending) whether a real run's one call would
    // itself be blocked by an already-reached cap — never a hard stop, just a heads-up.
    let capNote: string[] = [];
    if (toAsk.length > 0) {
      try {
        if (!checkBudget(loadBudget(ctx.paths).state).ok) capNote = [CAP_NOTE];
      } catch {
        // a corrupt/unwritable budget file is the real run's problem to report properly; a dry run stays silent.
      }
    }
    return {
      exit: 0,
      text: dryRunText({ calls: toAsk.length ? 1 : 0, questions: toAsk.length, reused: keyed.length - toAsk.length, route: identity.route, baseURL: identity.baseURL }, capNote),
    };
  }

  const pre = preflight(ctx, { needsBudget: toAsk.length > 0 });
  if (!pre.ok) return pre.result;

  let costUsd: number | undefined;
  let costEstimated = false;
  let calls: number;
  if (toAsk.length === 0) {
    costUsd = 0;
    calls = 0;
  } else {
    const call: PlannedCall = { state: { goal: redact(request.side.goal), code: evidence.evidence.files }, questions: toAsk.map(([q]) => q) };
    const asked = await askAll(ctx, 'class', [call]);
    if (!asked.ok) return asked.result;
    Object.assign(answers, asked.value.answers);
    costUsd = asked.value.costUsd;
    costEstimated = asked.value.costEstimated;
    calls = 1;
  }

  // Every question's key, reused or freshly asked, so a later run can reuse from this one too.
  const keys: Record<string, string> = {};
  for (const [q, k] of keyed) keys[q.id] = k;

  // Consensus: only the request's yes/no category questions (never the goal, never scale/choice).
  const slots: SlotAnswer[] = request.side.categories
    .filter((c) => c.questions[0]?.kind === 'yesno')
    .flatMap((c) => c.questions.map((q) => ({ pos: q.n, reverse: c.pass === 'yes', p: (answers[String(q.n)] as { kind: 'yesno'; p: number }).p })));
  const consensus = computeConsensus(slots).consensus;

  const subject = gradeSubject(request.side.categories, answers);
  const escalate = consensus !== 'STRONG' || request.side.depth === 'thorough' || loaded.notes.some((n) => n.startsWith(IRREVERSIBLE_NOTE));

  // fix #6: which prior runs this run's answers came from, when any were reused — not just that reuse happened.
  const reusedRunIds = reusedIds(reusedFrom);
  const response = (id: string, budget: string): string =>
    respondText(
      subjectSide(id, subject.gate, subject, [
        ['consensus', consensus],
        ['escalate', escalate],
        ...(reusedRunIds.length ? [['reused', reusedRunIds] as [string, Value]] : []),
      ]),
      wiseRecorded(request.wise),
      outcomeNext(id, subject.gate, subject.categories, request.side.categories, 'act on it'),
      commonNotes(
        [...loaded.notes, ...evidence.evidence.notes, ...(pre.value.created ? [createdNote(pre.value.state)] : []), ...(costEstimated ? [COST_ESTIMATED_NOTE] : [])],
        budget,
        ctx.provider.adapter,
      ),
    );

  const run: NewContractRun = {
    verb: 'class',
    actor: actorOf(ctx),
    task: ctx.env.SIDEWISE_TASK?.trim() || null,
    goal: request.side.goal,
    depth: request.side.depth ?? null,
    where: request.side.where,
    parent: null,
    from: null,
    compare: null,
    wise: request.wise,
    ask: { categories: request.side.categories, layers: [] },
    over: null,
    items: null,
    answers,
    keys,
    reusedFrom,
    categories: Object.fromEntries(subject.categories.map((c) => [c.name, c.gate])),
    gate: subject.gate,
    goalGate: subject.goal?.gate ?? null,
    goalP: subject.goal?.p ?? null,
    consensus,
    response,
    notes: [],
    adapter: ctx.provider.adapter,
    model: ctx.provider.model,
    costUsd: costUsd ?? null,
    calls,
    route: identity.route,
    baseURL: identity.baseURL,
  };

  const rec = calls === 0 ? recordFree(ctx, run) : record(ctx, costUsd, run);
  if (!rec.ok) return rec.result;
  return { exit: 0, text: rec.value.run.response, run: rec.value.run };
}
