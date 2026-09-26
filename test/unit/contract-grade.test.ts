// Grading: a bar per answer (never averaged), a gate per category by its need, the goal, and the sweep roll-up.
import { describe, expect, it } from 'vitest';
import { combine, gateOf, goalGate, gradeItems, gradeSubject, markOf, passingProbability, sweepGate, worstFirst, type Mark } from '../../src/contract/grade.ts';
import { expand } from '../../src/contract/layers.ts';
import type { Answer, Category } from '../../src/contract/types.ts';

const yes = (p: number): Answer => ({ kind: 'yesno', p });
const cat = (name: string, pass: Category['pass'], nums: number[], need: Category['need'] = 'all'): Category => ({
  name,
  pass,
  need,
  tags: [],
  questions: nums.map((n) => ({ n, kind: 'yesno' as const, text: `Is ${n} so?` })),
});

describe('the bar', () => {
  it('pass: yes clears at ≥ 0.70; pass: no clears at ≤ 0.30; the mirror image is a clear miss', () => {
    const y = cat('y', 'yes', [1]);
    const n = cat('n', 'no', [1]);
    expect([0.7, 0.69, 0.31, 0.3].map((p) => markOf(passingProbability(y, yes(p))))).toEqual(['pass', 'mid', 'mid', 'miss']);
    expect([0.3, 0.31, 0.69, 0.7].map((p) => markOf(passingProbability(n, yes(p))))).toEqual(['pass', 'mid', 'mid', 'miss']);
  });

  it('scale and choice: the total probability of the passing levels or options', () => {
    const sev: Category = { name: 'sev', pass: ['none', 'low'], need: 'all', tags: [], questions: [{ n: 11, kind: 'scale', text: 'How bad?', levels: ['none', 'low', 'high'] }] };
    expect(passingProbability(sev, { kind: 'scale', dist: { none: 0.4, low: 0.35, high: 0.25 } })).toBeCloseTo(0.75, 12);
    expect(markOf(passingProbability(sev, { kind: 'scale', dist: { none: 0.3, low: 0.3, high: 0.4 } }))).toBe('mid');
    expect(markOf(passingProbability(sev, { kind: 'scale', dist: { none: 0.05, low: 0.05, high: 0.9 } }))).toBe('miss');
  });
});

describe('gates', () => {
  const g = (need: Category['need'], marks: Mark[]) => gateOf(need, marks);
  it('all: every answer clears; any clear miss fails; otherwise unsure', () => {
    expect([g('all', ['pass', 'pass']), g('all', ['pass', 'mid']), g('all', ['pass', 'miss'])]).toEqual(['pass', 'unsure', 'fail']);
  });
  it('most: ≥ ⅔ clear and none a clear miss', () => {
    expect([g('most', ['pass', 'pass', 'mid']), g('most', ['pass', 'mid', 'mid']), g('most', ['pass', 'pass', 'miss'])]).toEqual(['pass', 'unsure', 'fail']);
  });
  it('any: one clearing is enough; all clear misses fail; otherwise unsure', () => {
    expect([g('any', ['miss', 'pass']), g('any', ['miss', 'miss']), g('any', ['miss', 'mid'])]).toEqual(['pass', 'fail', 'unsure']);
  });
  it('combine: fail > unsure > pass; the goal passes at ≥ 0.70', () => {
    expect([combine(['pass', 'unsure']), combine(['unsure', 'fail']), combine([]), combine(['pass'])]).toEqual(['unsure', 'fail', 'pass', 'pass']);
    expect([goalGate(0.74), goalGate(0.5), goalGate(0.08)]).toEqual(['pass', 'unsure', 'fail']);
  });
});

describe('gradeSubject (the contract class example)', () => {
  it('gives the example\'s gates', () => {
    const cats = [cat('injection', 'no', [1, 2, 10]), cat('guards', 'yes', [3, 6, 9]), cat('access', 'no', [4, 5]), cat('leaks', 'no', [7, 8])];
    const P: Record<string, number> = { goal: 0.08, 1: 0.94, 2: 0.91, 10: 0.9, 3: 0.88, 6: 0.81, 9: 0.75, 4: 0.86, 5: 0.84, 7: 0.55, 8: 0.2 };
    const g = gradeSubject(cats, Object.fromEntries(Object.entries(P).map(([k, p]) => [k, yes(p)])));
    expect(g.goal).toEqual({ gate: 'fail', p: 0.08 });
    expect(g.categories.map((c) => [c.name, c.gate])).toEqual([['injection', 'fail'], ['guards', 'pass'], ['access', 'fail'], ['leaks', 'unsure']]);
    expect(g.gate).toBe('fail');
    expect([...g.categories[3]!.values]).toEqual([[7, 0.55], [8, 0.2]]);
  });

  it('with a prefix, and without a goal (change\'s "before")', () => {
    const g = gradeSubject([cat('a', 'yes', [1])], { 'before:1': yes(0.9) }, 'before:');
    expect(g).toMatchObject({ gate: 'pass', categories: [{ name: 'a', gate: 'pass' }] });
    expect(g.goal).toBeUndefined();
  });
});

describe('gradeItems (the contract loop example)', () => {
  const { items } = expand({
    part: [{ name: 'gateway', story: ['guest checkout', 'saved cards'] }, { name: 'payments', story: ['refunds', 'retries', 'partial capture'] }, 'ledger'],
  });
  const layers: Record<string, Category[]> = { part: [cat('boundaries', 'yes', [1, 2])], story: [cat('done', 'yes', [3]), cat('risk', 'no', [4])] };
  const answers: Record<string, Answer> = {};
  for (const it of items) for (const n of it.layer === 'part' ? [1, 2] : [3, 4]) answers[`${it.id}#${n}`] = yes(n === 4 ? 0.1 : 0.9);
  Object.assign(answers, { 'payments#2': yes(0.18), 'payments/refunds#3': yes(0.22), 'payments/refunds#4': yes(0.91), 'payments/partial capture#4': yes(0.48) });

  it('an item fails if it or a child fails; the run gate rolls up from the top items and the goal', () => {
    const grades = gradeItems(items, (l) => layers[l] ?? [], () => 'asked', answers);
    expect(grades.get('payments')).toMatchObject({ ownGate: 'fail', gate: 'fail' });
    expect(grades.get('gateway')).toMatchObject({ ownGate: 'pass', gate: 'pass' });
    expect(grades.get('payments/partial capture')).toMatchObject({ ownGate: 'unsure' });
    expect(sweepGate('pass', grades)).toBe('fail');
    expect(worstFirst(grades.values()).map((g) => g.id)).toEqual(['payments/refunds', 'payments', 'payments/partial capture']);
  });

  it('a skipped item (over the cap) is unsure, never pass; an item in an unasked layer passes vacuously', () => {
    const grades = gradeItems(items, (l) => (l === 'part' ? [] : layers[l]!), (id) => (id === 'ledger' ? 'skipped' : id.includes('/') ? 'asked' : 'none'), answers);
    expect(grades.get('ledger')).toMatchObject({ status: 'skipped', ownGate: 'unsure', gate: 'unsure' });
    expect(grades.get('gateway')).toMatchObject({ status: 'none', ownGate: 'pass', gate: 'pass' });
    expect(worstFirst(grades.values()).map((g) => g.id)).not.toContain('ledger');
  });
});
