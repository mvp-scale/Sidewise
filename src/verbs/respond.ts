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

/** pass → the verb's own text. fail/unsure → drill the first matching category, in written order. */
export function outcomeNext(id: string, gate: Gate, graded: readonly CategoryGrade[], categories: readonly Category[], onPass: string): string {
  if (gate === 'pass') return onPass;
  const gateOf = new Map(graded.map((g) => [g.name, g.gate]));
  const target = categories.find((c) => gateOf.get(c.name) === gate)?.name ?? categories[0]!.name;
  return drillNext(id, target);
}

export function drillNext(id: string, target: string): string {
  return `sidewise template drill --parent ${id} --from ${target}`;
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
