/**
 * Grading (contract "Grading: a simple bar, checked per question"). Nothing is averaged.
 *   pass: yes → an answer clears the bar at P(yes) ≥ 0.70 · pass: no → at P(yes) ≤ 0.30.
 *   scale / choice → the total probability of the passing levels or options clears at ≥ 0.70.
 *   The mirror image (≤ 0.30 of the passing side) is a clear miss; anything between is "mid".
 * A category's gate follows its need (all · most · any). The goal passes at ≥ 0.70. Gates combine as
 * fail > unsure > pass. In a sweep an item passes only when its own categories and all its children pass.
 * worstFirst ranks a sweep's failing items by severity (a scale question's level × p) first, when any item
 * carries one — a plain count of fail/unsure categories is still the tiebreak, and the whole ordering when
 * no item has a scale question at all.
 */
import type { Item } from './layers.ts';
import type { Answer, Category, Gate, Need } from './types.ts';

export const BAR = 0.7;
const EPS = 1e-9; // 1 - 0.7 is 0.30000000000000004 in floating point
export type Mark = 'pass' | 'miss' | 'mid';
export type Shown = number | { top: string; p: number };

/** The probability that this answer is the passing one. */
export function passingProbability(cat: Category, a: Answer): number {
  if (a.kind === 'yesno') return cat.pass === 'no' ? 1 - a.p : a.p;
  const passing = Array.isArray(cat.pass) ? cat.pass : [];
  return passing.reduce((sum, o) => sum + (a.dist[o] ?? 0), 0);
}

export function markOf(pp: number): Mark {
  if (pp >= BAR - EPS) return 'pass';
  if (pp <= 1 - BAR + EPS) return 'miss';
  return 'mid';
}

export function gateOf(need: Need, marks: readonly Mark[]): Gate {
  const n = marks.length;
  const pass = marks.filter((x) => x === 'pass').length;
  const miss = marks.filter((x) => x === 'miss').length;
  if (n === 0) return 'unsure';
  if (need === 'any') return pass > 0 ? 'pass' : miss === n ? 'fail' : 'unsure';
  if (miss > 0) return 'fail';
  if (need === 'most') return pass * 3 >= 2 * n ? 'pass' : 'unsure';
  return pass === n ? 'pass' : 'unsure';
}

export function combine(gates: readonly Gate[]): Gate {
  if (gates.includes('fail')) return 'fail';
  return gates.every((g) => g === 'pass') ? 'pass' : 'unsure';
}

export function goalGate(p: number): Gate {
  const mark = markOf(p);
  return mark === 'pass' ? 'pass' : mark === 'miss' ? 'fail' : 'unsure';
}

/** What the response shows for one answer: P(yes), or the top level/option and its probability. */
export function shown(a: Answer): Shown {
  if (a.kind === 'yesno') return a.p;
  const [top, p] = Object.entries(a.dist).reduce((best, e) => (e[1] > best[1] ? e : best));
  return { top, p };
}

export interface CategoryGrade {
  name: string;
  gate: Gate;
  /** By question number, ascending. */
  marks: Map<number, Mark>;
  values: Map<number, Shown>;
  /** The worst (level index × p) among this category's own scale questions, else 0 (yes/no and
   *  choice questions carry no ordered severity — worstFirst falls back to fail/unsure counts for those). */
  severity: number;
}

/** A scale answer's severity — how far up its own ordered levels the top one sits, weighted by how sure
 *  the answer is of it. A yes/no or choice answer has no level order to weigh, so it's 0. */
function severityOf(q: Category['questions'][number], a: Answer): number {
  if (q.kind !== 'scale' || a.kind !== 'scale') return 0;
  const [top, p] = Object.entries(a.dist).reduce((best, e) => (e[1] > best[1] ? e : best));
  const level = q.levels.indexOf(top);
  return level < 0 ? 0 : level * p;
}

export function gradeCategory(cat: Category, answerOf: (n: number) => Answer | undefined): CategoryGrade {
  const marks = new Map<number, Mark>();
  const values = new Map<number, Shown>();
  let severity = 0;
  for (const q of cat.questions) {
    const a = answerOf(q.n);
    if (!a) continue;
    marks.set(q.n, markOf(passingProbability(cat, a)));
    values.set(q.n, shown(a));
    severity = Math.max(severity, severityOf(q, a));
  }
  return { name: cat.name, gate: gateOf(cat.need, [...marks.values()]), marks, values, severity };
}

export interface SubjectGrade {
  gate: Gate;
  /** Absent when the goal was not asked (replay's "before" state). */
  goal?: { gate: Gate; p: number };
  categories: CategoryGrade[];
}

/** One subject: answers keyed `${prefix}${n}`, the goal under `${prefix}goal`. */
export function gradeSubject(categories: readonly Category[], answers: Record<string, Answer>, prefix = ''): SubjectGrade {
  const grades = categories.map((c) => gradeCategory(c, (n) => answers[`${prefix}${n}`]));
  const g = answers[`${prefix}goal`];
  const goal = g && g.kind === 'yesno' ? { gate: goalGate(g.p), p: g.p } : undefined;
  return { gate: combine([...(goal ? [goal.gate] : []), ...grades.map((c) => c.gate)]), ...(goal ? { goal } : {}), categories: grades };
}

/** asked or reused: graded · skipped: over the depth cap, not asked · none: its layer has no questions. */
export type ItemStatus = 'asked' | 'reused' | 'skipped' | 'none';

export interface ItemGrade {
  id: string;
  layer: string;
  parent: string | null;
  status: ItemStatus;
  own: CategoryGrade[];
  /** Its own categories only (skipped: unsure; none: pass). */
  ownGate: Gate;
  /** Rolled up: its own categories and every child. */
  gate: Gate;
  /** The worst of its own categories' severity — worstFirst's primary sort key when non-zero. Optional
   *  (rather than required like CategoryGrade's own) so a hand-built ItemGrade fixture elsewhere that
   *  predates this field keeps compiling; gradeItems itself always sets it. */
  severity?: number;
}

export function gradeItems(
  items: readonly Item[],
  categoriesOf: (layer: string) => readonly Category[],
  statusOf: (id: string) => ItemStatus,
  answers: Record<string, Answer>,
): Map<string, ItemGrade> {
  const kids = new Map<string, string[]>();
  for (const it of items) if (it.parent !== null) kids.set(it.parent, [...(kids.get(it.parent) ?? []), it.id]);
  const out = new Map<string, ItemGrade>();
  for (const it of [...items].reverse()) {
    const status = statusOf(it.id);
    const graded = status === 'asked' || status === 'reused';
    const own = graded ? categoriesOf(it.layer).map((c) => gradeCategory(c, (n) => answers[`${it.id}#${n}`])) : [];
    const ownGate: Gate = status === 'skipped' ? 'unsure' : combine(own.map((c) => c.gate));
    const severity = own.reduce((worst, c) => Math.max(worst, c.severity), 0);
    const children = (kids.get(it.id) ?? []).map((k) => out.get(k)!.gate);
    out.set(it.id, { id: it.id, layer: it.layer, parent: it.parent, status, own, ownGate, gate: combine([ownGate, ...children]), severity });
  }
  return new Map([...out].reverse());
}

/** The run's gate: the goal and every top item (an item whose parent is not in this run). */
export function sweepGate(goal: Gate, grades: ReadonlyMap<string, ItemGrade>): Gate {
  const tops = [...grades.values()].filter((g) => g.parent === null || !grades.has(g.parent));
  return combine([goal, ...tops.map((g) => g.gate)]);
}

/** Graded items whose own categories did not all pass, worst first: highest severity (a scale question's
 *  level × p) first when any item carries one, then most fails, then most unsures, then order. A sweep with
 *  no scale question has every item at severity 0, so this is exactly the old ordering. */
export function worstFirst(grades: Iterable<ItemGrade>): ItemGrade[] {
  const count = (g: ItemGrade, gate: Gate): number => g.own.filter((c) => c.gate === gate).length;
  return [...grades]
    .filter((g) => (g.status === 'asked' || g.status === 'reused') && g.ownGate !== 'pass')
    .map((g, i) => ({ g, i }))
    .sort((a, b) => (b.g.severity ?? 0) - (a.g.severity ?? 0) || count(b.g, 'fail') - count(a.g, 'fail') || count(b.g, 'unsure') - count(a.g, 'unsure') || a.i - b.i)
    .map(({ g }) => g);
}
