/**
 * replay: "did the fix work?" Replays a one-subject parent's questions on two states (before/after a ref, or
 * the worktree) — never a sweep parent's, which has its own items to re-sweep. Two calls at most (one per
 * state), reusing per question exactly like class.ts; goal is asked once, on the "after" state only. Grading
 * pairs before/after per category (fixed/still) and across all of them (regressed), which alone can fail the
 * gate even when every "after" category passes.
 */
import { providerIdentity } from '../classifier/select.ts';
import { resolveConfig } from '../config/load.ts';
import { combine, gradeSubject, goalGate, type Mark } from '../contract/grade.ts';
import { answerKey, goalQuestion, subjectEvidence, subjectQuestions, type AskedQuestion } from '../contract/translate.ts';
import type { Answer, Category, Gate } from '../contract/types.ts';
import { effectiveWiseFields } from '../contract/wise-fields.ts';
import { readGitEvidence, resolveRefSha, WHOLE_FILE_NOTE } from '../evidence/git.ts';
import { findRun, isContractRun, type NewContractRun, type TelemetryEntry } from '../ledger/log.ts';
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

export interface ReplayCategoryGrade {
  name: string;
  before: Gate;
  after: Gate;
  /** Question numbers that missed/mid before and pass now. */
  fixed: number[];
  /** Question numbers that missed/mid before and still don't pass. */
  still: number[];
}

export interface ReplayGrade {
  categories: ReplayCategoryGrade[];
  goal: { gate: Gate; p: number };
  /** Passing before, not any more — sorted ascending. Non-empty alone fails the gate. */
  regressed: number[];
  gate: Gate;
}

/** The before/after grade a replay run reports and stores: read straight from a replay run's own `ask.categories`
 *  and `answers` (keyed `before:<n>`/`after:<n>`/`goal` by `contract/translate.ts`'s `subjectQuestions`) — no new
 *  ledger write, and reusable read-side by anything (e.g. `report.ts`) that needs the run's own regression call
 *  instead of a stale comparison against another run. */
export function gradeReplay(categories: readonly Category[], answers: Record<string, Answer>): ReplayGrade {
  const beforeGrade = gradeSubject(categories, answers, 'before:');
  const afterCatsGrade = gradeSubject(categories, answers, 'after:');
  const g = answers['goal'] as { kind: 'yesno'; p: number };
  const goal = { gate: goalGate(g.p), p: g.p };

  const beforeMarks = new Map<number, Mark>();
  for (const c of beforeGrade.categories) for (const [n, mk] of c.marks) beforeMarks.set(n, mk);
  const afterMarks = new Map<number, Mark>();
  for (const c of afterCatsGrade.categories) for (const [n, mk] of c.marks) afterMarks.set(n, mk);

  const categoryGrades: ReplayCategoryGrade[] = categories.map((c, i) => {
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

export async function runReplay(text: string, ctx: VerbContext): Promise<VerbResult> {
  // plan 2c B1: a project's own .sidewise/config.yaml wise: overrides apply to every wise: block it validates.
  const wiseFields = effectiveWiseFields(resolveConfig(ctx.paths, ctx.env).config.wise);
  const loaded = loadRequest(text, 'replay', wiseFields);
  if (!loaded.ok) return loaded.result;
  const { request } = loaded;

  const parent = findRun(ctx.paths, request.side.parent!);
  // Each of these three ran as a bare string, missing the "→ see: sidewise agent replay" pointer every other
  // stop carries (stopText's own job) — round 2/3 smoke testing hit all three with no pointer to follow
  // (round3-findings.md, STOPS.md #1). Routed through stopText so they match every other verb's stop shape.
  if (!parent) return { exit: 2, text: stopText([`✖ side.parent: ${request.side.parent} is not in the ledger → check the id`], 'replay') };
  if (!isContractRun(parent)) return { exit: 2, text: stopText([`✖ side.parent: ${parent.id} predates the YAML contract → run class again on this code`], 'replay') };
  if (parent.items !== null) return { exit: 2, text: stopText([`✖ side.parent: ${parent.id} was a sweep → run the sweep again (unchanged items are reused for free)`], 'replay') };

  const categories = parent.ask.categories;
  // expect: names which of the parent's concerns this replay should turn to pass (plan 2b), or the literal
  // "none" to predict no flips at all (plan 2c N4) — every named entry must be a real concern of the parent;
  // decisions categories don't count (they're never "fixed").
  const concernNames = categories.filter((c) => c.section === 'concerns').map((c) => c.name);
  const expect = request.side.expect!;
  const expectList = expect === 'none' ? [] : expect;
  const badExpect = expectList.find((name) => !concernNames.includes(name));
  if (badExpect !== undefined) {
    return { exit: 2, text: stopText([`✖ side.expect: "${badExpect}" is not a concern of ${parent.id} → use one of ${concernNames.join(', ')}`], 'replay') };
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
    return { exit: 2, text: stopText(errors, 'replay') };
  }

  const who = { adapter: ctx.provider.adapter, model: ctx.provider.model };
  const beforeEvidenceStr = subjectEvidence(before.files);
  const afterEvidenceStr = subjectEvidence(after.files);
  const beforeQuestions = subjectQuestions(categories, 'before:');
  const afterQuestions = [goalQuestion(request.side.goal), ...subjectQuestions(categories, 'after:')];
  const beforeKeyed = beforeQuestions.map((q) => [q, answerKey(beforeEvidenceStr, q)] as const);
  const afterKeyed = afterQuestions.map((q) => [q, answerKey(afterEvidenceStr, q)] as const);
  // Reuse is resolved before preflight/dry-run, same as class.ts: a fully-reused replay's free run is never
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
  let telemetry: TelemetryEntry[] = [];
  if (calls.length > 0) {
    const asked = await askAll(ctx, 'replay', calls);
    if (!asked.ok) return asked.result;
    Object.assign(answers, asked.value.answers);
    costUsd = asked.value.costUsd;
    costEstimated = asked.value.costEstimated;
    telemetry = asked.value.telemetry;
  }

  const keys: Record<string, string> = {};
  for (const [q, k] of [...beforeKeyed, ...afterKeyed]) keys[q.id] = k;

  const replayGrade = gradeReplay(categories, answers);
  const { goal, regressed, gate } = replayGrade;
  const afterCatsGrade = gradeSubject(categories, answers, 'after:');

  // B3: each category line names how many of its own probes fixed (question numbers that missed/were mid
  // before and clear now) out of the count of questions that were NOT passing before (fixed.length +
  // still.length) — e.g. `probes: 2/3 fixed`. A category every one of whose questions already passed before
  // has nothing to probe, so the field is omitted entirely rather than printed as `probes: 0/N fixed`.
  const catEntries: Array<[string, Value]> = replayGrade.categories.map((c) => {
    const probeCount = c.fixed.length + c.still.length;
    return [
      c.name,
      m(
        ['before', c.before],
        ['after', c.after],
        ...(c.fixed.length ? [['fixed', c.fixed] as [string, Value]] : []),
        ...(c.still.length ? [['still', c.still] as [string, Value]] : []),
        ...(probeCount > 0 ? [['probes', `${c.fixed.length}/${probeCount} fixed`] as [string, Value]] : []),
      ),
    ];
  });

  // The agent's own prediction, graded against what actually happened: a concern named in expect: is "fixed"
  // when it missed/was mid before and clears now, "still" when it missed/was mid before and still doesn't
  // clear. A concern that already passed before predicts nothing meaningful either way, so it's left out of
  // both lists (plan 2b: "grading the prediction against the expected concerns"). N4: expect: none predicts no
  // flips at all — either way, any CONCERN category that flips (before != after) without being named in expect
  // (an empty list, for "none") is reported separately as unexpected:, replacing the old forced workaround of
  // having to name every affected concern up front.
  const gradeByName = new Map(replayGrade.categories.map((c) => [c.name, c]));
  const expectedFixed: string[] = [];
  const expectedStill: string[] = [];
  for (const name of expectList) {
    const g = gradeByName.get(name);
    if (!g || g.before === 'pass') continue;
    (g.after === 'pass' ? expectedFixed : expectedStill).push(name);
  }
  const expectSet = new Set(expectList);
  const unexpected = concernNames.filter((name) => {
    const g = gradeByName.get(name);
    return g !== undefined && g.before !== g.after && !expectSet.has(name);
  });

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
        ...(unexpected.length ? [['unexpected', unexpected] as [string, Value]] : []),
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

  // plan 2c B1: commit is the AFTER ref's own resolved sha (in the repo that actually contains the parent's
  // where files), plus commits: {before, after} for both refs resolved the same way — replacing the old
  // "always null" (replay has no single worktree-HEAD commit the way class/scan/drill/loop do, but its two
  // compared refs each resolve to a real sha).
  const beforeSha = resolveRefSha(ctx.paths.root, compare.before, parent.where);
  const afterSha = resolveRefSha(ctx.paths.root, compare.after, parent.where);

  const run: NewContractRun = {
    verb: 'replay',
    actor: actorOf(ctx),
    task: ctx.env.SIDEWISE_TASK?.trim() || null,
    goal: request.side.goal,
    depth: null,
    where: parent.where,
    parent: request.side.parent!,
    from: null,
    compare,
    expect,
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
    commit: afterSha,
    commits: { before: beforeSha, after: afterSha },
    telemetry,
  };

  const rec = calls.length === 0 ? recordFree(ctx, run) : record(ctx, costUsd, run);
  if (!rec.ok) return rec.result;
  return { exit: 0, text: rec.value.run.response, run: rec.value.run };
}
