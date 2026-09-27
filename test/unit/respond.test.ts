// respond.ts: pure formatting shared by every verb. Pins the exact strings later batches (16–21) depend on.
import { describe, expect, it } from 'vitest';
import type { Value } from '../../src/contract/emit.ts';
import { gradeCategory, gradeSubject, type ItemGrade } from '../../src/contract/grade.ts';
import type { Category, Gate } from '../../src/contract/types.ts';
import { categoryEntry, commonNotes, drillNext, dryRunText, outcomeNext, regressionNext, respondText, reusedIds, shownValue, subjectSide, sweepNext, wiseRecorded } from '../../src/verbs/respond.ts';

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
  it('only the fields actually set; extras always append; nothing at all is "none" [C-044]', () => {
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
  it("pass uses the caller's own text; fail/unsure drill the first matching category, in written order [C-045] [C-058]", () => {
    expect(outcomeNext('SW-1', 'pass', graded, cats, 'act on it')).toBe('act on it');
    expect(outcomeNext('SW-1', 'fail', graded, cats, 'act on it')).toBe('sidewise template drill --parent SW-1 --from injection');
  });

  it('every category passes but the gate is not pass (only the goal missed): says so, not categories[0] [C-046]', () => {
    const allPass = [gradeCategory(cats[0]!, () => ({ kind: 'yesno', p: 0.1 })), gradeCategory(cats[1]!, () => ({ kind: 'yesno', p: 0.1 }))];
    expect(outcomeNext('SW-1', 'fail', allPass, cats, 'act on it')).toBe('the goal missed though every part passed · fix what is missing, then run it again');
  });
});

describe('sweepNext', () => {
  const item = (id: string, ownGate: Gate = 'pass'): ItemGrade => ({ id, layer: 'part', parent: null, status: 'asked', own: [], ownGate, gate: ownGate });

  it("pass uses the caller's own text", () => {
    expect(sweepNext('SW-1', 'pass', [], [], 'act on it')).toBe('act on it');
  });

  it('a failing item present: drills worst[0], worstFirst order', () => {
    const worst = [item('payments/refunds', 'fail'), item('payments', 'fail')];
    const graded = [item('gateway'), ...worst];
    expect(sweepNext('SW-1', 'fail', worst, graded, 'act on it')).toBe('sidewise template drill --parent SW-1 --from payments/refunds');
  });

  it('no failing item, but something was graded (only the goal missed): says so, not a passing item', () => {
    const graded = [item('gateway'), item('payments')];
    expect(sweepNext('SW-1', 'fail', [], graded, 'act on it')).toBe('the goal missed though every part passed · fix what is missing, then run it again');
  });

  it('nothing graded at all (every item skipped past the depth cap): says so [C-046]', () => {
    expect(sweepNext('SW-1', 'unsure', [], [], 'act on it')).toBe('every item was skipped · raise depth or narrow over, then run it again');
  });
});

describe('commonNotes', () => {
  it('no adapter given, or a real one (typesafe, stub): no label', () => {
    expect(commonNotes([], 'budget 0% used')).toEqual(['budget 0% used']);
    expect(commonNotes([], 'budget 0% used', 'typesafe')).toEqual(['budget 0% used']);
    expect(commonNotes([], 'budget 0% used', 'stub')).toEqual(['budget 0% used']);
  });

  it('a rehearsal adapter (fake, chaos) is labeled "not evidence", after other notes, before budget [C-092]', () => {
    expect(commonNotes(['a validation note'], 'budget 0% used', 'fake')).toEqual(['a validation note', 'adapter fake · not evidence', 'budget 0% used']);
    expect(commonNotes([], 'budget 0% used', 'chaos')).toEqual(['adapter chaos · not evidence', 'budget 0% used']);
  });
});

describe('regressionNext', () => {
  const cats: Category[] = [cat('injection', 'no', [1, 2]), cat('access', 'no', [3])];
  it('points at the category the first regressed question belongs to [C-091]', () => {
    expect(regressionNext('SW-1', [2], cats)).toBe('sidewise template drill --parent SW-1 --from injection');
    expect(regressionNext('SW-1', [3], cats)).toBe('sidewise template drill --parent SW-1 --from access');
  });
});

describe('dryRunText', () => {
  it('a one-subject plan (no items/reused) [C-088]', () => {
    expect(dryRunText({ calls: 1, questions: 11, route: 'fake' })).toBe('plan:\n  calls: 1\n  questions: 11\n  route: fake\nnotes: ["dry run: no call, no spend"]\n');
  });
  it('a sweep plan [C-088]', () => {
    expect(dryRunText({ calls: 2, questions: 16, items: 8, reused: 0, route: 'fake' })).toBe('plan:\n  calls: 2\n  questions: 16\n  items: 8\n  reused: 0\n  route: fake\nnotes: ["dry run: no call, no spend"]\n');
  });
  it('shows the base URL when the route has one (P2)', () => {
    expect(dryRunText({ calls: 1, questions: 3, route: 'direct', baseURL: 'https://api.typesafe.ai' })).toBe(
      'plan:\n  calls: 1\n  questions: 3\n  route: direct\n  baseURL: https://api.typesafe.ai\nnotes: ["dry run: no call, no spend"]\n',
    );
  });
});

describe('reusedIds', () => {
  it('every distinct run id an answer was reused from, sorted; empty when nothing was reused [C-131]', () => {
    expect(reusedIds({})).toEqual([]);
    expect(reusedIds({ '1': 'SW-0002', '2': 'SW-0001', goal: 'SW-0002' })).toEqual(['SW-0001', 'SW-0002']);
  });
});

describe('dryRunText extraNotes (fix #5b)', () => {
  it('appends extra notes after the fixed "dry run" note, keeping the default empty', () => {
    expect(dryRunText({ calls: 1, questions: 3, route: 'fake' })).toBe('plan:\n  calls: 1\n  questions: 3\n  route: fake\nnotes: ["dry run: no call, no spend"]\n');
    expect(dryRunText({ calls: 0, questions: 0, reused: 3, route: 'fake' }, ['would be blocked: budget cap already reached'])).toBe(
      'plan:\n  calls: 0\n  questions: 0\n  reused: 3\n  route: fake\nnotes: ["dry run: no call, no spend", "would be blocked: budget cap already reached"]\n',
    );
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
