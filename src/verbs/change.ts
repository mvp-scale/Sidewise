/**
 * change: "did the fix work?" Replays a one-subject parent's questions on two states (before/after a ref, or
 * the worktree) — never a sweep parent's, which has its own items to re-sweep. Two calls at most (one per
 * state), reusing per question exactly like class.ts; goal is asked once, on the "after" state only. Grading
 * pairs before/after per category (fixed/still) and across all of them (regressed), which alone can fail the
 * gate even when every "after" category passes.
 */
import { providerIdentity } from '../classifier/select.ts';
import { combine, gradeSubject, goalGate, type Mark } from '../contract/grade.ts';
import { answerKey, goalQuestion, subjectEvidence, subjectQuestions, type AskedQuestion } from '../contract/translate.ts';
import type { Answer } from '../contract/types.ts';
import { readGitEvidence, WHOLE_FILE_NOTE } from '../evidence/git.ts';
import { findRun, isContractRun, type NewContractRun } from '../ledger/log.ts';
import { redact } from '../ledger/redact.ts';
import { lookupAnswers, type Reusable } from '../ledger/reuse.ts';
import { m, type Value } from '../contract/emit.ts';
import { actorOf, askAll, createdNote, preflight, record, recordFree, type PlannedCall } from './pay.ts';
import { loadRequest, stopText } from './request.ts';
import { commonNotes, dryRunText, outcomeNext, regressionNext, respondText, wiseRecorded } from './respond.ts';
import type { VerbContext, VerbResult } from './types.ts';

/** Every unreused question goes in one call; the reused ones are answered (and credited) for free. null when nothing to ask. */
function planCall(
  keyed: readonly (readonly [AskedQuestion, string])[],
  reused: ReadonlyMap<string, Reusable>,
  state: Record<string, unknown>,
  answers: Record<string, Answer>,
  reusedFrom: Record<string, string>,
): PlannedCall | null {
  const toAsk: AskedQuestion[] = [];
  for (const [q, k] of keyed) {
    const hit = reused.get(k);
    if (hit) {
      answers[q.id] = hit.answer;
      reusedFrom[q.id] = hit.id;
    } else {
      toAsk.push(q);
    }
  }
  return toAsk.length ? { state, questions: toAsk } : null;
}

export async function runChange(text: string, ctx: VerbContext): Promise<VerbResult> {
  const loaded = loadRequest(text, 'change');
  if (!loaded.ok) return loaded.result;
  const { request } = loaded;

  const parent = findRun(ctx.paths, request.side.parent!);
  if (!parent) return { exit: 2, text: `✖ side.parent: ${request.side.parent} is not in the ledger → check the id` };
  if (!isContractRun(parent)) return { exit: 2, text: `✖ side.parent: ${parent.id} predates the YAML contract → run class again on this code` };
  if (parent.items !== null) return { exit: 2, text: `✖ side.parent: ${parent.id} was a sweep → run the sweep again (unchanged items are reused for free)` };

  const categories = parent.ask.categories;
  // Two ranges on one file (parent.where can hold both) must read and charge it once, not once per range.
  const paths = [...new Set(parent.where.map((w) => w.split(':')[0]!))];

  const identity = providerIdentity(ctx.env);

  if (ctx.dryRun) {
    const n = categories.flatMap((c) => c.questions).length;
    return { exit: 0, text: dryRunText({ calls: 2, questions: n * 2 + 1, route: identity.route, baseURL: identity.baseURL }) };
  }

  const compare = request.side.compare!;
  const before = readGitEvidence(ctx.paths.root, compare.before, 'before', paths);
  const after = readGitEvidence(ctx.paths.root, compare.after, 'after', paths);
  if (!before.ok || !after.ok) {
    const errors = [...(before.ok ? [] : before.errors), ...(after.ok ? [] : after.errors)];
    return { exit: 2, text: stopText(errors) };
  }

  const pre = preflight(ctx);
  if (!pre.ok) return pre.result;

  const who = { adapter: ctx.provider.adapter, model: ctx.provider.model };
  const beforeEvidenceStr = subjectEvidence(before.files);
  const afterEvidenceStr = subjectEvidence(after.files);
  const beforeQuestions = subjectQuestions(categories, 'before:');
  const afterQuestions = [goalQuestion(request.side.goal), ...subjectQuestions(categories, 'after:')];
  const beforeKeyed = beforeQuestions.map((q) => [q, answerKey(beforeEvidenceStr, q)] as const);
  const afterKeyed = afterQuestions.map((q) => [q, answerKey(afterEvidenceStr, q)] as const);
  const beforeReused = lookupAnswers(ctx.paths, who, beforeKeyed.map(([, k]) => k));
  const afterReused = lookupAnswers(ctx.paths, who, afterKeyed.map(([, k]) => k));

  const answers: Record<string, Answer> = {};
  const reusedFrom: Record<string, string> = {};
  const beforeCall = planCall(beforeKeyed, beforeReused, { code: before.files }, answers, reusedFrom);
  const afterCall = planCall(afterKeyed, afterReused, { goal: redact(request.side.goal), code: after.files }, answers, reusedFrom);
  const calls: PlannedCall[] = [...(beforeCall ? [beforeCall] : []), ...(afterCall ? [afterCall] : [])];

  let costUsd: number | undefined = 0;
  if (calls.length > 0) {
    const asked = await askAll(ctx, 'change', calls);
    if (!asked.ok) return asked.result;
    Object.assign(answers, asked.value.answers);
    costUsd = asked.value.costUsd;
  }

  const keys: Record<string, string> = {};
  for (const [q, k] of [...beforeKeyed, ...afterKeyed]) keys[q.id] = k;

  const beforeGrade = gradeSubject(categories, answers, 'before:');
  const afterCatsGrade = gradeSubject(categories, answers, 'after:');
  const g = answers['goal'] as { kind: 'yesno'; p: number };
  const goal = { gate: goalGate(g.p), p: g.p };

  const beforeMarks = new Map<number, Mark>();
  for (const c of beforeGrade.categories) for (const [n, mk] of c.marks) beforeMarks.set(n, mk);
  const afterMarks = new Map<number, Mark>();
  for (const c of afterCatsGrade.categories) for (const [n, mk] of c.marks) afterMarks.set(n, mk);

  const catEntries: Array<[string, Value]> = categories.map((c, i) => {
    const beforeCat = beforeGrade.categories[i]!;
    const afterCat = afterCatsGrade.categories[i]!;
    const fixed = [...beforeCat.marks].filter(([n, mk]) => mk !== 'pass' && afterCat.marks.get(n) === 'pass').map(([n]) => n);
    const still = [...beforeCat.marks].filter(([n, mk]) => mk !== 'pass' && afterCat.marks.get(n) !== 'pass').map(([n]) => n);
    return [
      c.name,
      m(
        ['before', beforeCat.gate],
        ['after', afterCat.gate],
        ...(fixed.length ? [['fixed', fixed] as [string, Value]] : []),
        ...(still.length ? [['still', still] as [string, Value]] : []),
      ),
    ];
  });

  const regressed = categories
    .flatMap((c) => c.questions)
    .map((q) => q.n)
    .filter((n) => beforeMarks.get(n) === 'pass' && afterMarks.get(n) !== 'pass')
    .sort((a, b) => a - b);

  const gate = regressed.length > 0 ? 'fail' : combine([goal.gate, ...afterCatsGrade.categories.map((c) => c.gate)]);

  // Both states can add WHOLE_FILE_NOTE (once per call, per git.ts); shown once here, since it's one fact about the run.
  let sawWholeFileNote = false;
  const evidenceNotes = [...before.notes, ...after.notes].filter((n) => {
    if (n !== WHOLE_FILE_NOTE) return true;
    if (sawWholeFileNote) return false;
    sawWholeFileNote = true;
    return true;
  });

  const response = (id: string, budget: string): string =>
    respondText(
      m(['id', id], ['gate', gate], ['goal', m(['gate', goal.gate], ['p', goal.p])], ...catEntries, ['regressed', regressed]),
      wiseRecorded(request.wise, ['parent']),
      // A regression alone can fail the gate even when every "after" category passes on its own (C-064) —
      // outcomeNext's gate-matching search would then find nothing and wrongly blame the goal (GOAL_ONLY_NEXT).
      // regressed takes priority: name it, per C-065 (revert or drill into it). [C-091]
      regressed.length
        ? regressionNext(id, regressed, categories)
        : outcomeNext(id, gate, afterCatsGrade.categories, categories, `sidewise outcome ${request.side.parent} held --by <you>`),
      commonNotes([...loaded.notes, ...evidenceNotes, ...(pre.value.created ? [createdNote(pre.value.state)] : [])], `2 states · ${budget}`, ctx.provider.adapter),
    );

  const run: NewContractRun = {
    verb: 'change',
    actor: actorOf(ctx),
    task: ctx.env.SIDEWISE_TASK?.trim() || null,
    goal: request.side.goal,
    depth: null,
    where: parent.where,
    parent: request.side.parent!,
    from: null,
    compare,
    wise: request.wise,
    ask: { categories, layers: [] },
    over: null,
    items: null,
    answers,
    keys,
    reusedFrom,
    categories: Object.fromEntries(afterCatsGrade.categories.map((c) => [c.name, c.gate])),
    gate,
    goalGate: goal.gate,
    goalP: goal.p,
    consensus: null,
    response,
    notes: [],
    adapter: ctx.provider.adapter,
    model: ctx.provider.model,
    costUsd: costUsd ?? null,
    calls: calls.length,
    route: identity.route,
    baseURL: identity.baseURL,
  };

  const rec = calls.length === 0 ? recordFree(ctx, run) : record(ctx, costUsd, run);
  if (!rec.ok) return rec.result;
  return { exit: 0, text: rec.value.run.response, run: rec.value.run };
}
