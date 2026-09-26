// respond.ts: pure formatting shared by every verb. Pins the exact strings later batches (16–21) depend on.
import { describe, expect, it } from 'vitest';
import type { Value } from '../../src/contract/emit.ts';
import { gradeCategory, gradeSubject } from '../../src/contract/grade.ts';
import type { Category } from '../../src/contract/types.ts';
import { categoryEntry, commonNotes, drillNext, dryRunText, outcomeNext, respondText, shownValue, subjectSide, wiseRecorded } from '../../src/verbs/respond.ts';

const cat = (name: string, pass: Category['pass'], nums: number[]): Category => ({ name, pass, need: 'all', tags: [], questions: nums.map((n) => ({ n, kind: 'yesno' as const, text: `Is ${n}?` })) });

describe('respondText / subjectSide / categoryEntry (the contract class golden, minus consensus/escalate wiring)', () => {
  it("matches Task 10's golden shape", () => {
    const cats = [cat('injection', 'no', [1]), cat('guards', 'yes', [3])];
    const answers = { goal: { kind: 'yesno' as const, p: 0.08 }, 1: { kind: 'yesno' as const, p: 0.94 }, 3: { kind: 'yesno' as const, p: 0.88 } };
    const subject = gradeSubject(cats, answers);
    const side = subjectSide('SW-0042', subject.gate, subject, [['consensus', 'SPLIT'], ['escalate', true]]);
    const text = respondText(side, wiseRecorded({ why: 'validate', area: 'data' }), drillNext('SW-0042', 'injection'), commonNotes([], 'budget 1% used ($0.02 of $5.00 · 3 of 500 runs)'));
    expect(text).toBe(
      [
        'side:',
        '  id: SW-0042',
        '  gate: fail',
        '  goal: {gate: fail, p: 0.08}',
        '  injection: {gate: fail, 1: 0.94}',
        '  guards: {gate: pass, 3: 0.88}',
        '  consensus: SPLIT',
        '  escalate: true',
        'wise: {recorded: [why, area]}',
        'next: sidewise template drill --parent SW-0042 --from injection',
        'notes: [budget 1% used ($0.02 of $5.00 · 3 of 500 runs)]',
      ].join('\n') + '\n',
    );
  });
});

describe('wiseRecorded', () => {
  it('only the fields actually set; extras always append; nothing at all is "none"', () => {
    expect(wiseRecorded({ why: 'validate' })).toEqual(['why']);
    expect(wiseRecorded({ area: 'api' })).toEqual(['area']);
    expect(wiseRecorded(null)).toBe('none');
    expect(wiseRecorded({ why: 'validate', area: 'api' }, ['parent'])).toEqual(['why', 'area', 'parent']);
    expect(wiseRecorded(null, ['parent'])).toEqual(['parent']);
  });
});

describe('outcomeNext', () => {
  const cats: Category[] = [cat('injection', 'no', [1]), cat('access', 'no', [2])];
  const graded = [gradeCategory(cats[0]!, () => ({ kind: 'yesno', p: 0.9 })), gradeCategory(cats[1]!, () => ({ kind: 'yesno', p: 0.1 }))];
  it("pass uses the caller's own text; fail/unsure drill the first matching category, in written order", () => {
    expect(outcomeNext('SW-1', 'pass', graded, cats, 'act on it')).toBe('act on it');
    expect(outcomeNext('SW-1', 'fail', graded, cats, 'act on it')).toBe('sidewise template drill --parent SW-1 --from injection');
  });
});

describe('dryRunText', () => {
  it('a one-subject plan (no items/reused)', () => {
    expect(dryRunText({ calls: 1, questions: 11 })).toBe('plan:\n  calls: 1\n  questions: 11\nnotes: ["dry run: no call, no spend"]\n');
  });
  it('a sweep plan', () => {
    expect(dryRunText({ calls: 2, questions: 16, items: 8, reused: 0 })).toBe('plan:\n  calls: 2\n  questions: 16\n  items: 8\n  reused: 0\nnotes: ["dry run: no call, no spend"]\n');
  });
});

describe('shownValue / categoryEntry', () => {
  it('a bare number for yes/no; {top, p} for scale/choice', () => {
    expect(shownValue(0.9)).toBe(0.9);
    expect(shownValue({ top: 'high', p: 0.81 })).toEqual(new Map<string, Value>([['top', 'high'], ['p', 0.81]]));
  });

  it('the category name, its gate, then each question by number', () => {
    const g = gradeCategory(cat('injection', 'no', [1, 2]), (n) => ({ kind: 'yesno' as const, p: n === 1 ? 0.9 : 0.2 }));
    expect(categoryEntry(g)).toEqual(['injection', new Map<string, Value>([['gate', 'fail'], ['1', 0.9], ['2', 0.2]])]);
  });
});
