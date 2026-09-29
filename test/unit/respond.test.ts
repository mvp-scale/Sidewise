// respond.ts: pure formatting shared by every verb. Pins the exact strings later batches (16–21) depend on.
import { describe, expect, it } from 'vitest';
import type { Value } from '../../src/contract/emit.ts';
import { gradeCategory, gradeSubject, type ItemGrade } from '../../src/contract/grade.ts';
import type { Category, Gate, Mak } from '../../src/contract/types.ts';
import {
  categoryEntry,
  commonNotes,
  drillNext,
  dryRunText,
  outcomeNext,
  probeWarnings,
  regressionNext,
  respondText,
  reusedIds,
  shownValue,
  subjectMak,
  sweepNext,
  mdlRecorded,
} from '../../src/verbs/respond.ts';

const cat = (name: string, pass: Category['pass'], nums: number[]): Category => ({ name, section: 'concerns', pass, need: 'all', tags: [], questions: nums.map((n) => ({ n, kind: 'yesno' as const, text: `Is ${n}?` })) });

/** A minimal one-subject Mak: only `categories`/`where` vary per test; every other field is a fixed filler. */
const mak = (categories: Category[], where: string[] = []): Mak => ({ goal: 'x', where, categories, layers: [] });
/** One category, one yes/no question with the given text — everything probeWarnings' own tests vary. */
const oneQuestion = (text: string): Category => ({ name: 'a', section: 'concerns', pass: 'yes', need: 'all', tags: [], questions: [{ n: 1, kind: 'yesno', text }] });

describe('respondText / subjectMak / categoryEntry (the contract class golden, minus consensus/escalate wiring)', () => {
  it("matches Task 10's golden shape", () => {
    const cats = [cat('injection', 'no', [1]), cat('guards', 'yes', [3])];
    const answers = { goal: { kind: 'yesno' as const, p: 0.08 }, 1: { kind: 'yesno' as const, p: 0.94 }, 3: { kind: 'yesno' as const, p: 0.88 } };
    const subject = gradeSubject(cats, answers);
    const mak = subjectMak('MM3-0042', subject.gate, subject, [['consensus', 'SPLIT'], ['escalate', true]]);
    const text = respondText(mak, mdlRecorded({ why: 'validate', area: 'data' }), drillNext('MM3-0042', 'injection'), commonNotes([], 'budget 1% used ($0.02 of $5.00 · 3 of 500 runs)'));
    expect(text).toBe(
      [
        'mak:',
        '  id: MM3-0042',
        '  gate: fail',
        '  goal: {gate: fail, p: 0.08}',
        '  injection: {gate: fail, 1: 0.94}',
        '  guards: {gate: pass, 3: 0.88}',
        '  consensus: SPLIT',
        '  escalate: true',
        'mdl: {recorded: [why, area]}',
        'next: mm3 template drill --parent MM3-0042 --from injection',
        'notes: [budget 1% used ($0.02 of $5.00 · 3 of 500 runs)]',
      ].join('\n') + '\n',
    );
  });
});

describe('mdlRecorded', () => {
  it('only the fields actually set; extras always append; nothing at all is "none" [C-044]', () => {
    expect(mdlRecorded({ why: 'validate' })).toEqual(['why']);
    expect(mdlRecorded({ area: 'api' })).toEqual(['area']);
    expect(mdlRecorded(null)).toBe('none');
    expect(mdlRecorded({ why: 'validate', area: 'api' }, ['parent'])).toEqual(['why', 'area', 'parent']);
    expect(mdlRecorded(null, ['parent'])).toEqual(['parent']);
  });

  it('also names stage/change/risk when set, in Mdl\'s own field order, extras still last [C-044]', () => {
    expect(mdlRecorded({ stage: 'review' })).toEqual(['stage']);
    expect(mdlRecorded({ change: 'fix' })).toEqual(['change']);
    expect(mdlRecorded({ risk: 'high' })).toEqual(['risk']);
    expect(mdlRecorded({ why: 'validate', area: 'api', stage: 'review', change: 'fix', risk: 'high' }, ['parent'])).toEqual([
      'why',
      'area',
      'stage',
      'change',
      'risk',
      'parent',
    ]);
  });

  it("plan 2c's knowledge fields (problem/uses/touches/blast) append last, in that order, extras after them", () => {
    expect(mdlRecorded({ problem: 'fixing the injection in findUser' })).toEqual(['problem']);
    expect(mdlRecorded({ uses: ['container:api -> component:dao'] })).toEqual(['uses']);
    expect(mdlRecorded({ uses: [] })).toBe('none'); // an empty list is not "set"
    expect(mdlRecorded({ touches: ['userId'] })).toEqual(['touches']);
    expect(mdlRecorded({ touches: [] })).toBe('none'); // an empty list is not "set"
    expect(mdlRecorded({ blast: 'component' })).toEqual(['blast']);
    expect(
      mdlRecorded(
        { why: 'validate', risk: 'high', problem: 'x', uses: ['code:a'], touches: ['y'], blast: 'system' },
        ['parent'],
      ),
    ).toEqual(['why', 'risk', 'problem', 'uses', 'touches', 'blast', 'parent']);
  });

  it('a custom (non-catalog) mdl key is recorded too, sorted, after the catalog fields', () => {
    expect(mdlRecorded({ why: 'validate', extras: { 'ticket-id': 'MM3-1', component: 'orders' } })).toEqual(['why', 'component', 'ticket-id']);
  });
});

describe('outcomeNext', () => {
  const cats: Category[] = [cat('injection', 'no', [1]), cat('access', 'no', [2])];
  const graded = [gradeCategory(cats[0]!, () => ({ kind: 'yesno', p: 0.9 })), gradeCategory(cats[1]!, () => ({ kind: 'yesno', p: 0.1 }))];
  it("pass uses the caller's own text; fail/unsure drill the first matching category, in written order [C-045] [C-058]", () => {
    expect(outcomeNext('MM3-1', 'pass', graded, cats, 'act on it')).toBe('act on it');
    expect(outcomeNext('MM3-1', 'fail', graded, cats, 'act on it')).toBe('mm3 template drill --parent MM3-1 --from injection');
  });

  it('every category passes but the gate is not pass (only the goal missed): says so, not categories[0] [C-046]', () => {
    const allPass = [gradeCategory(cats[0]!, () => ({ kind: 'yesno', p: 0.1 })), gradeCategory(cats[1]!, () => ({ kind: 'yesno', p: 0.1 }))];
    expect(outcomeNext('MM3-1', 'fail', allPass, cats, 'act on it')).toBe('the goal missed though every part passed · fix what is missing, then run it again');
  });
});

describe('sweepNext', () => {
  const item = (id: string, ownGate: Gate = 'pass'): ItemGrade => ({ id, layer: 'part', parent: null, status: 'asked', own: [], ownGate, gate: ownGate });

  it("pass uses the caller's own text", () => {
    expect(sweepNext('MM3-1', 'pass', [], [], 'act on it')).toBe('act on it');
  });

  it('a failing item present: drills worst[0], worstFirst order', () => {
    const worst = [item('payments/refunds', 'fail'), item('payments', 'fail')];
    const graded = [item('gateway'), ...worst];
    expect(sweepNext('MM3-1', 'fail', worst, graded, 'act on it')).toBe('mm3 template drill --parent MM3-1 --from payments/refunds');
  });

  it('no failing item, but something was graded (only the goal missed): says so, not a passing item', () => {
    const graded = [item('gateway'), item('payments')];
    expect(sweepNext('MM3-1', 'fail', [], graded, 'act on it')).toBe('the goal missed though every part passed · fix what is missing, then run it again');
  });

  it('nothing graded at all (every item skipped past the depth cap): says so [C-046]', () => {
    expect(sweepNext('MM3-1', 'unsure', [], [], 'act on it')).toBe('every item was skipped · raise depth or narrow over, then run it again');
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
    expect(regressionNext('MM3-1', [2], cats)).toBe('mm3 template drill --parent MM3-1 --from injection');
    expect(regressionNext('MM3-1', [3], cats)).toBe('mm3 template drill --parent MM3-1 --from access');
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
    expect(reusedIds({ '1': 'MM3-0002', '2': 'MM3-0001', goal: 'MM3-0002' })).toEqual(['MM3-0001', 'MM3-0002']);
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

describe('probeWarnings (item F, round 4 fix batch G) [C-198]: up to 3 warn-only "probe:" dry-run notes', () => {
  it('a clean request: no warnings', () => {
    expect(probeWarnings(mak([cat('injection', 'no', [1, 2])]))).toEqual([]);
  });

  it('two question marks in one line reads as a compound question', () => {
    expect(probeWarnings(mak([oneQuestion('Does it sanitize input? Does it also log it?')]))).toEqual([
      'probe: "Does it sanitize input? Does it also log it?" reads as two questions joined into one — split it',
    ]);
  });

  it('" and " joining two clauses reads as a compound question too', () => {
    expect(probeWarnings(mak([oneQuestion('Does it sanitize input and reject bad rows?')]))).toEqual([
      'probe: "Does it sanitize input and reject bad rows?" reads as two questions joined into one — split it',
    ]);
  });

  it('a backticked path named in a question but missing from where: is flagged', () => {
    expect(probeWarnings(mak([oneQuestion('Does `src/other.ts` sanitize the field?')], ['src/handler.ts']))).toEqual([
      'probe: "src/other.ts" is named in a question but not in where: — it has nothing to answer from',
    ]);
  });

  it('a backticked path that IS in where: (bare, or with a line range) is never flagged', () => {
    expect(probeWarnings(mak([oneQuestion('Does `src/handler.ts` sanitize the field?')], ['src/handler.ts']))).toEqual([]);
    expect(probeWarnings(mak([oneQuestion('Does `src/handler.ts` sanitize the field?')], ['src/handler.ts:1-20']))).toEqual([]);
  });

  it('with no where: at all (scan/loop/drill legitimately have none), the backtick check never fires', () => {
    expect(probeWarnings(mak([oneQuestion('Does `src/handler.ts` sanitize the field?')], []))).toEqual([]);
  });

  it('a backticked code identifier (not a file path) is never flagged, even without a matching where:', () => {
    expect(probeWarnings(mak([oneQuestion('Does `req.query.id` get validated before use?')], ['src/handler.ts']))).toEqual([]);
    expect(probeWarnings(mak([oneQuestion('Is `db.query` called with a parameterized string?')], ['src/handler.ts']))).toEqual([]);
  });

  it('a backticked file path not in where: is still flagged', () => {
    expect(probeWarnings(mak([oneQuestion('Does `src/other.ts` sanitize the field?')], ['src/handler.ts']))).toEqual([
      'probe: "src/other.ts" is named in a question but not in where: — it has nothing to answer from',
    ]);
    expect(probeWarnings(mak([oneQuestion('Does `config.json` hold the secret?')], ['src/handler.ts']))).toEqual([
      'probe: "config.json" is named in a question but not in where: — it has nothing to answer from',
    ]);
  });

  it('a sweep layer\'s own questions are checked too, not just flat categories', () => {
    const swept: Mak = { goal: 'x', where: [], categories: [], layers: [{ name: 'file', categories: [oneQuestion('Does it validate and also normalize input?')] }] };
    expect(probeWarnings(swept)).toEqual(['probe: "Does it validate and also normalize input?" reads as two questions joined into one — split it']);
  });

  it('caps at 3, naming how many more', () => {
    const many = mak([oneQuestion('A and B?'), oneQuestion('C and D?'), oneQuestion('E and F?'), oneQuestion('G and H?')]);
    const warnings = probeWarnings(many);
    expect(warnings).toHaveLength(4);
    expect(warnings[3]).toBe('probe: 1 more question warning(s) not shown');
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
