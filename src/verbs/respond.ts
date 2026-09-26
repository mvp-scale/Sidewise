/**
 * The compact YAML response, shared by every verb (contract "Every response"). Pure formatting, no I/O: builds
 * the `side:`/`plan:` Value tree and hands it to emit.ts. Pins the exact shapes later verbs (change, loop, scan,
 * drill) depend on — a change here is a change to what every verb prints.
 */
import { emit, m, type Value } from '../contract/emit.ts';
import type { CategoryGrade, ItemGrade, Shown, SubjectGrade } from '../contract/grade.ts';
import type { Category, Gate, Wise } from '../contract/types.ts';

/** A bare number for yes/no; {top, p} for scale/choice. */
export function shownValue(s: Shown): Value {
  return typeof s === 'number' ? s : m(['top', s.top], ['p', s.p]);
}

export function categoryEntry(g: CategoryGrade): [string, Value] {
  return [g.name, m(['gate', g.gate], ...[...g.values].map(([n, v]): [string, Value] => [String(n), shownValue(v)]))];
}

/** One subject's `side:` block: id, gate, the goal (when asked), every category, then whatever the verb adds. */
export function subjectSide(id: string, gate: Gate, subject: SubjectGrade, extra?: Array<[string, Value]>): Map<string, Value> {
  return m(
    ['id', id],
    ['gate', gate],
    ...(subject.goal ? [['goal', m(['gate', subject.goal.gate], ['p', subject.goal.p])] as [string, Value]] : []),
    ...subject.categories.map(categoryEntry),
    ...(extra ?? []),
  );
}

/** `wise: {recorded: [...]}` fields, or the string "none" when nothing was recorded. */
export function wiseRecorded(wise: Wise | null, extra?: readonly string[]): Value {
  const fields = [...(wise?.why ? ['why'] : []), ...(wise?.area ? ['area'] : []), ...(extra ?? [])];
  return fields.length ? fields : 'none';
}

/** `wise` is always shown as {recorded: ...} (contract: "wise: {recorded: [why, area]}", or "{recorded: none}"). */
export function respondText(side: Map<string, Value>, wise: Value, next: string, notes: readonly string[]): string {
  return emit(m(['side', side], ['wise', m(['recorded', wise])], ['next', next], ['notes', [...notes]]));
}

/** Validation and evidence notes first; the budget note is always last. */
export function commonNotes(notes: readonly string[], budgetNote: string): string[] {
  return [...notes, budgetNote];
}

/**
 * The two fixed strings a non-pass gate can print with nothing concrete to drill into (no ": " in either, so
 * scalar() leaves them plain — see emit.ts). Both name what's actually true instead of pointing at a
 * passing item/category, which "why did this fail?" would make of a bare drillNext target.
 */
const GOAL_ONLY_NEXT = 'the goal missed though every part passed · fix what is missing, then run it again';
const ALL_SKIPPED_NEXT = 'every item was skipped · raise depth or narrow over, then run it again';

/**
 * pass → the verb's own text. Otherwise drill the first category whose own gate matches the subject's overall
 * gate, in written order. When no category is to blame — every one of them is 'pass', so the overall gate is
 * non-pass only because the goal itself missed — say so instead of drilling a category that's actually fine.
 */
export function outcomeNext(id: string, gate: Gate, graded: readonly CategoryGrade[], categories: readonly Category[], onPass: string): string {
  if (gate === 'pass') return onPass;
  const gateOf = new Map(graded.map((g) => [g.name, g.gate]));
  const target = categories.find((c) => gateOf.get(c.name) === gate)?.name;
  if (target) return drillNext(id, target);
  return categories.every((c) => gateOf.get(c.name) === 'pass') ? GOAL_ONLY_NEXT : drillNext(id, categories[0]!.name);
}

export function drillNext(id: string, target: string): string {
  return `sidewise template drill --parent ${id} --from ${target}`;
}

/**
 * Anything in `regressed` can alone fail change's gate even when every "after" category grades pass on its
 * own (a `need: any` category clearing on a question that never regressed, say) — outcomeNext's own "which
 * category matches the overall gate?" search then finds nothing and falls back to GOAL_ONLY_NEXT, which is
 * wrong here: the goal can pass too. C-065: anything regressed should be reverted or drilled into; next:
 * points at the category the first regressed question belongs to (regressed is sorted, so this is stable).
 */
export function regressionNext(id: string, regressed: readonly number[], categories: readonly Category[]): string {
  const first = regressed[0]!;
  const target = categories.find((c) => c.questions.some((q) => q.n === first))?.name ?? categories[0]!.name;
  return drillNext(id, target);
}

/**
 * pass → onPass. Otherwise drill the worst item (worstFirst's own order). Two ways a sweep can be non-pass
 * with nothing to drill into: every item's own categories clear the bar and only the goal misses (`worst` is
 * empty, `graded` isn't — the goal-only case, same shape as outcomeNext's own categories-all-pass check), or
 * nothing was graded at all because every item was skipped past the depth cap (both empty). Either way,
 * pointing drillNext at a passing item ("why did this fail?" on something that didn't) would be worse than
 * just saying which of the two happened.
 */
export function sweepNext(id: string, gate: Gate, worst: readonly ItemGrade[], graded: readonly ItemGrade[], onPass: string): string {
  if (gate === 'pass') return onPass;
  if (worst.length) return drillNext(id, worst[0]!.id);
  return graded.length ? GOAL_ONLY_NEXT : ALL_SKIPPED_NEXT;
}

export function dryRunText(plan: { calls: number; questions: number; items?: number; reused?: number }): string {
  return emit(
    m(
      [
        'plan',
        m(
          ['calls', plan.calls],
          ['questions', plan.questions],
          ...(plan.items !== undefined ? [['items', plan.items] as [string, Value]] : []),
          ...(plan.reused !== undefined ? [['reused', plan.reused] as [string, Value]] : []),
        ),
      ],
      ['notes', ['dry run: no call, no spend']],
    ),
  );
}

/** A sweep item that isn't all-pass: its own failing/unsure categories, then its failing/unsure questions, merged and sorted. */
export function sweepEntry(g: ItemGrade): [string, Value] {
  const catEntries: Array<[string, Value]> = [];
  const qEntries: Array<[number, Value]> = [];
  for (const c of g.own) if (c.gate !== 'pass') catEntries.push([c.name, c.gate]);
  for (const c of g.own) for (const [n, mark] of c.marks) if (mark !== 'pass') qEntries.push([n, shownValue(c.values.get(n)!)]);
  qEntries.sort((a, b) => a[0] - b[0]);
  return [g.id, m(...catEntries, ...qEntries.map(([n, v]): [string, Value] => [String(n), v]))];
}
