/**
 * class: "does the evidence support this one goal?" One pass through the contract:
 *   request → evidence → (dry run: stop here) → preflight → reuse what the ledger already answered for the
 *   same questions on the same evidence → one call for the rest → grade → consensus → the spend and the run
 *   in one lock section → the compact side: response. A run fully answered from the ledger makes no call and
 *   is free (BRIEF §5: sweeps and one-subject runs reuse alike).
 */
import { providerIdentity } from '../classifier/select.ts';
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
import { commonNotes, dryRunText, outcomeNext, respondText, subjectSide, wiseRecorded } from './respond.ts';
import type { VerbContext, VerbResult } from './types.ts';

export async function runClass(text: string, ctx: VerbContext): Promise<VerbResult> {
  const loaded = loadRequest(text, 'class');
  if (!loaded.ok) return loaded.result;
  const { request } = loaded;

  // Evidence is read before touching budget or ledger at all: a bad path is a request problem, not a paid one.
  const evidence = readCodeEvidence(ctx.paths.root, request.side.where);
  if (!evidence.ok) return { exit: 2, text: stopText(evidence.errors) };

  const identity = providerIdentity(ctx.env);

  if (ctx.dryRun) {
    const questions = 1 + request.side.categories.flatMap((c) => c.questions).length;
    return { exit: 0, text: dryRunText({ calls: 1, questions, route: identity.route, baseURL: identity.baseURL }) };
  }

  const pre = preflight(ctx);
  if (!pre.ok) return pre.result;

  const who = { adapter: ctx.provider.adapter, model: ctx.provider.model };
  const evidenceStr = subjectEvidence(evidence.evidence.files);
  const questions = [goalQuestion(request.side.goal), ...subjectQuestions(request.side.categories)];
  const keyed = questions.map((q) => [q, answerKey(evidenceStr, q)] as const);
  const reused = lookupAnswers(ctx.paths, who, keyed.map(([, k]) => k));

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

  let costUsd: number | undefined;
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

  const response = (id: string, budget: string): string =>
    respondText(
      subjectSide(id, subject.gate, subject, [
        ['consensus', consensus],
        ['escalate', escalate],
      ]),
      wiseRecorded(request.wise),
      outcomeNext(id, subject.gate, subject.categories, request.side.categories, 'act on it'),
      commonNotes([...loaded.notes, ...evidence.evidence.notes, ...(pre.value.created ? [createdNote(pre.value.state)] : [])], budget, ctx.provider.adapter),
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
