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
import type { Answer, Category, Gate } from '../contract/types.ts';
import { readGitEvidence, WHOLE_FILE_NOTE } from '../evidence/git.ts';
import { findRun, isContractRun, type NewContractRun } from '../ledger/log.ts';
import { redact } from '../ledger/redact.ts';
import { lookupAnswers, type Reusable } from '../ledger/reuse.ts';
import { m, type Value } from '../contract/emit.ts';
import { actorOf, askAll, createdNote, preflight, record, recordFree, splitReuse, type PlannedCall } from './pay.ts';
import { loadRequest, stopText } from './request.ts';
import { commonNotes, COST_ESTIMATED_NOTE, dryRunText, outcomeNext, regressionNext, respondText, reusedIds, wiseRecorded } from './respond.ts';
import type { VerbContext, VerbResult } from './types.ts';

/** Every unreused question goes in one call; the reused ones are answered (and credited) for free. null when nothing to ask. */
function planCall(
  keyed: readonly (readonly [AskedQuestion, string])[],
  reused: ReadonlyMap<string, Reusable>,
  state: Record<string, unknown>,
  answers: Record<string, Answer>,
  reusedFrom: Record<string, string>,
): PlannedCall | null {
  const toAsk = splitReuse(keyed, reused, answers, reusedFrom).map(([q]) => q);
  return toAsk.length ? { state, questions: toAsk } : null;
}

export interface ChangeCategoryGrade {
  name: string;
  before: Gate;
  after: Gate;
  /** Question numbers that missed/mid before and pass now. */
  fixed: number[];
  /** Question numbers that missed/mid before and still don't pass. */
  still: number[];
}

export interface ChangeGrade {
  categories: ChangeCategoryGrade[];
  goal: { gate: Gate; p: number };
  /** Passing before, not any more — sorted ascending. Non-empty alone fails the gate. */
  regressed: number[];
  gate: Gate;
}

/** The before/after grade a change run reports and stores: read straight from a change run's own `ask.categories`
 *  and `answers` (keyed `before:<n>`/`after:<n>`/`goal` by `contract/translate.ts`'s `subjectQuestions`) — no new
 *  ledger write, and reusable read-side by anything (e.g. `report.ts`) that needs the run's own regression call
 *  instead of a stale comparison against another run. */
export function gradeChange(categories: readonly Category[], answers: Record<string, Answer>): ChangeGrade {
  const beforeGrade = gradeSubject(categories, answers, 'before:');
  const afterCatsGrade = gradeSubject(categories, answers, 'after:');
  const g = answers['goal'] as { kind: 'yesno'; p: number };
  const goal = { gate: goalGate(g.p), p: g.p };

  const beforeMarks = new Map<number, Mark>();
  for (const c of beforeGrade.categories) for (const [n, mk] of c.marks) beforeMarks.set(n, mk);
  const afterMarks = new Map<number, Mark>();
  for (const c of afterCatsGrade.categories) for (const [n, mk] of c.marks) afterMarks.set(n, mk);

  const categoryGrades: ChangeCategoryGrade[] = categories.map((c, i) => {
    const beforeCat = beforeGrade.categories[i]!;
    const afterCat = afterCatsGrade.categories[i]!;
    const fixed = [...beforeCat.marks].filter(([n, mk]) => mk !== 'pass' && afterCat.marks.get(n) === 'pass').map(([n]) => n);
    const still = [...beforeCat.marks].filter(([n, mk]) => mk !== 'pass' && afterCat.marks.get(n) !== 'pass').map(([n]) => n);
    return { name: c.name, before: beforeCat.gate, after: afterCat.gate, fixed, still };
  });

  const regressed = categories
    .flatMap((c) => c.questions)
    .map((q) => q.n)
    .filter((n) => beforeMarks.get(n) === 'pass' && afterMarks.get(n) !== 'pass')
    .sort((a, b) => a - b);

  const gate = regressed.length > 0 ? 'fail' : combine([goal.gate, ...afterCatsGrade.categories.map((c) => c.gate)]);

  return { categories: categoryGrades, goal, regressed, gate };
}

export async function runChange(text: string, ctx: VerbContext): Promise<VerbResult> {
  const loaded = loadRequest(text, 'change');
  if (!loaded.ok) return loaded.result;
  const { request } = loaded;

  const parent = findRun(ctx.paths, request.side.parent!);
  // Each of these three ran as a bare string, missing the "→ see: sidewise agent change" pointer every other
  // stop carries (stopText's own job) — round 2/3 smoke testing hit all three with no pointer to follow
  // (round3-findings.md, STOPS.md #1). Routed through stopText so they match every other verb's stop shape.
  if (!parent) return { exit: 2, text: stopText([`✖ side.parent: ${request.side.parent} is not in the ledger → check the id`], 'change') };
  if (!isContractRun(parent)) return { exit: 2, text: stopText([`✖ side.parent: ${parent.id} predates the YAML contract → run class again on this code`], 'change') };
  if (parent.items !== null) return { exit: 2, text: stopText([`✖ side.parent: ${parent.id} was a sweep → run the sweep again (unchanged items are reused for free)`], 'change') };

  const categories = parent.ask.categories;
  // expect: names which of the parent's concerns this change should turn to pass (plan 2b) — every entry must
  // be a real concern of the parent; decisions categories don't count (they're never "fixed").
  const concernNames = categories.filter((c) => c.section === 'concerns').map((c) => c.name);
  const badExpect = request.side.expect!.find((name) => !concernNames.includes(name));
  if (badExpect !== undefined) {
    return { exit: 2, text: stopText([`✖ side.expect: "${badExpect}" is not a concern of ${parent.id} → use one of ${concernNames.join(', ')}`], 'change') };
  }
  // Two ranges on one file (parent.where can hold both) must read and charge it once, not once per range.
  const paths = [...new Set(parent.where.map((w) => w.split(':')[0]!))];

  const identity = providerIdentity(ctx.env, { resolveStored: ctx.resolveStored });

  // Evidence (both refs) is read before the dry-run branch, same as class/scan/drill/loop, so a dry run still
  // catches a missing ref instead of skipping the check.
  const compare = request.side.compare!;
  const before = readGitEvidence(ctx.paths.root, compare.before, 'before', paths);
  const after = readGitEvidence(ctx.paths.root, compare.after, 'after', paths);
  if (!before.ok || !after.ok) {
    const errors = [...(before.ok ? [] : before.errors), ...(after.ok ? [] : after.errors)];
    return { exit: 2, text: stopText(errors, 'change') };
  }

  const who = { adapter: ctx.provider.adapter, model: ctx.provider.model };
  const beforeEvidenceStr = subjectEvidence(before.files);
  const afterEvidenceStr = subjectEvidence(after.files);
  const beforeQuestions = subjectQuestions(categories, 'before:');
  const afterQuestions = [goalQuestion(request.side.goal), ...subjectQuestions(categories, 'after:')];
  const beforeKeyed = beforeQuestions.map((q) => [q, answerKey(beforeEvidenceStr, q)] as const);
  const afterKeyed = afterQuestions.map((q) => [q, answerKey(afterEvidenceStr, q)] as const);
  // Reuse is resolved before preflight/dry-run, same as class.ts: a fully-reused change's free run is never
  // blocked by an already-reached budget cap, and a dry run can predict how much reuses.
  const beforeReused = lookupAnswers(ctx.paths, who, beforeKeyed.map(([, k]) => k), { readOnly: ctx.dryRun ?? false });
  const afterReused = lookupAnswers(ctx.paths, who, afterKeyed.map(([, k]) => k), { readOnly: ctx.dryRun ?? false });

  const answers: Record<string, Answer> = {};
  const reusedFrom: Record<string, string> = {};
  const beforeCall = planCall(beforeKeyed, beforeReused, { code: before.files }, answers, reusedFrom);
  const afterCall = planCall(afterKeyed, afterReused, { goal: redact(request.side.goal), code: after.files }, answers, reusedFrom);
  const calls: PlannedCall[] = [...(beforeCall ? [beforeCall] : []), ...(afterCall ? [afterCall] : [])];

  if (ctx.dryRun) {
    const total = beforeKeyed.length + afterKeyed.length;
    const askedQuestions = calls.reduce((n, c) => n + c.questions.length, 0);
    return { exit: 0, text: dryRunText({ calls: calls.length, questions: askedQuestions, reused: total - askedQuestions, route: identity.route, baseURL: identity.baseURL }) };
  }

  const pre = preflight(ctx, { needsBudget: calls.length > 0 });
  if (!pre.ok) return pre.result;

  let costUsd: number | undefined = 0;
  let costEstimated = false;
  if (calls.length > 0) {
    const asked = await askAll(ctx, 'change', calls);
    if (!asked.ok) return asked.result;
    Object.assign(answers, asked.value.answers);
    costUsd = asked.value.costUsd;
    costEstimated = asked.value.costEstimated;
  }

  const keys: Record<string, string> = {};
  for (const [q, k] of [...beforeKeyed, ...afterKeyed]) keys[q.id] = k;

  const changeGrade = gradeChange(categories, answers);
  const { goal, regressed, gate } = changeGrade;
  const afterCatsGrade = gradeSubject(categories, answers, 'after:');

  const catEntries: Array<[string, Value]> = changeGrade.categories.map((c) => [
    c.name,
    m(
      ['before', c.before],
      ['after', c.after],
      ...(c.fixed.length ? [['fixed', c.fixed] as [string, Value]] : []),
      ...(c.still.length ? [['still', c.still] as [string, Value]] : []),
    ),
  ]);

  // The agent's own prediction, graded against what actually happened: a concern named in expect: is "fixed"
  // when it missed/was mid before and clears now, "still" when it missed/was mid before and still doesn't
  // clear. A concern that already passed before predicts nothing meaningful either way, so it's left out of
  // both lists (plan 2b: "grading the prediction against the expected concerns").
  const gradeByName = new Map(changeGrade.categories.map((c) => [c.name, c]));
  const expectedFixed: string[] = [];
  const expectedStill: string[] = [];
  for (const name of request.side.expect!) {
    const g = gradeByName.get(name);
    if (!g || g.before === 'pass') continue;
    (g.after === 'pass' ? expectedFixed : expectedStill).push(name);
  }

  // Both states can add WHOLE_FILE_NOTE (once per call, per git.ts); shown once here, since it's one fact about the run.
  let sawWholeFileNote = false;
  const evidenceNotes = [...before.notes, ...after.notes].filter((n) => {
    if (n !== WHOLE_FILE_NOTE) return true;
    if (sawWholeFileNote) return false;
    sawWholeFileNote = true;
    return true;
  });

  // Which prior runs this run's answers came from, when any were reused.
  const reusedRunIds = reusedIds(reusedFrom);
  const response = (id: string, budget: string): string =>
    respondText(
      m(
        ['id', id],
        ['gate', gate],
        ['goal', m(['gate', goal.gate], ['p', goal.p])],
        ...catEntries,
        ['expected', m(['fixed', expectedFixed], ['still', expectedStill])],
        ['regressed', regressed],
        ...(reusedRunIds.length ? [['reused', reusedRunIds] as [string, Value]] : []),
      ),
      wiseRecorded(request.wise, ['parent']),
      // A regression alone can fail the gate even when every "after" category passes on its own (C-064) —
      // outcomeNext's gate-matching search would then find nothing and wrongly blame the goal (GOAL_ONLY_NEXT).
      // regressed takes priority: name it, per C-065 (revert or drill into it). [C-091]
      regressed.length
        ? regressionNext(id, regressed, categories)
        : outcomeNext(id, gate, afterCatsGrade.categories, categories, `sidewise outcome ${request.side.parent} held --by <you>`),
      commonNotes(
        [...loaded.notes, ...evidenceNotes, ...(pre.value.created ? [createdNote(pre.value.state)] : []), ...(costEstimated ? [COST_ESTIMATED_NOTE] : [])],
        `2 states · ${budget}`,
        ctx.provider.adapter,
      ),
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
    // change replays the parent's own questions rather than reading the worktree at HEAD, so there's no single
    // commit this run itself is "at" the way class/scan/loop/drill are — left null on purpose.
    commit: null,
  };

  const rec = calls.length === 0 ? recordFree(ctx, run) : record(ctx, costUsd, run);
  if (!rec.ok) return rec.result;
  return { exit: 0, text: rec.value.run.response, run: rec.value.run };
}
