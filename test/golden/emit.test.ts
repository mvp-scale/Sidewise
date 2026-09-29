// The response format is a contract (AGENTS.md rule 5). These goldens are the contract's own examples; any change
// to them is a change to what agents read, made on purpose. Every output parses back to the same data.
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';
import { emit, m, num, scalar, type Value } from '../../src/contract/emit.ts';
import { seededRandom } from '../../src/util/prng.ts';
import { commonNotes } from '../../src/verbs/respond.ts';

const lines = (...xs: string[]): string => `${xs.join('\n')}\n`;
/** The plain data a Map-built response stands for, numbers rounded as printed. */
const plain = (v: Value): unknown => {
  if (v instanceof Map) return Object.fromEntries([...v].map(([k, x]) => [k, plain(x)]));
  if (Array.isArray(v)) return v.map(plain);
  return typeof v === 'number' ? Number(num(v)) : v;
};
const roundTrip = (doc: Map<string, Value>): void => {
  expect(parse(emit(doc), { version: '1.2', schema: 'core' })).toEqual(plain(doc));
};

describe('emit (golden: the contract examples)', () => {
  it('a rehearsal adapter labels notes: "not evidence", right before the budget line [C-092]', () => {
    const doc = m(
      ['mak', m(['id', 'MM3-0001'], ['gate', 'pass'])],
      ['mdl', m(['recorded', 'none'])],
      ['next', 'act on it'],
      ['notes', commonNotes(['a validation note'], 'budget: $5.00 left of $5.00 · 499 of 500 runs left', 'fake')],
    );
    expect(emit(doc)).toBe(
      lines(
        'mak:',
        '  id: MM3-0001',
        '  gate: pass',
        'mdl: {recorded: none}',
        'next: act on it',
        'notes: [a validation note, adapter fake · not evidence, "budget: $5.00 left of $5.00 · 499 of 500 runs left"]',
      ),
    );
    roundTrip(doc);
  });

  it('class [C-018] [C-043]', () => {
    const doc = m(
      [
        'mak',
        m(
          ['id', 'MM3-0042'],
          ['gate', 'fail'],
          ['goal', m(['gate', 'fail'], ['p', 0.08])],
          ['injection', m(['gate', 'fail'], ['1', 0.94], ['2', 0.91], ['10', 0.9])],
          ['guards', m(['gate', 'pass'], ['3', 0.88], ['6', 0.81], ['9', 0.75])],
          ['access', m(['gate', 'fail'], ['4', 0.86], ['5', 0.84])],
          ['leaks', m(['gate', 'unsure'], ['7', 0.55], ['8', 0.2])],
          ['severity', m(['gate', 'fail'], ['11', m(['top', 'high'], ['p', 0.81])])],
          ['route', m(['gate', 'fail'], ['12', m(['top', 'block'], ['p', 0.97])])],
          ['consensus', 'STRONG'],
          ['escalate', false],
        ),
      ],
      ['mdl', m(['recorded', ['why', 'area']])],
      ['next', 'mm3 template drill --parent MM3-0042 --from injection'],
      ['notes', ['budget: $4.98 left of $5.00 · 497 of 500 runs left']],
    );
    expect(emit(doc)).toBe(
      lines(
        'mak:',
        '  id: MM3-0042',
        '  gate: fail',
        '  goal: {gate: fail, p: 0.08}',
        '  injection: {gate: fail, 1: 0.94, 2: 0.91, 10: 0.90}',
        '  guards: {gate: pass, 3: 0.88, 6: 0.81, 9: 0.75}',
        '  access: {gate: fail, 4: 0.86, 5: 0.84}',
        '  leaks: {gate: unsure, 7: 0.55, 8: 0.20}',
        '  severity: {gate: fail, 11: {top: high, p: 0.81}}',
        '  route: {gate: fail, 12: {top: block, p: 0.97}}',
        '  consensus: STRONG',
        '  escalate: false',
        'mdl: {recorded: [why, area]}',
        'next: mm3 template drill --parent MM3-0042 --from injection',
        'notes: ["budget: $4.98 left of $5.00 · 497 of 500 runs left"]',
      ),
    );
    roundTrip(doc);
  });

  it('replay [C-018]', () => {
    const doc = m(
      [
        'mak',
        m(
          ['id', 'MM3-0051'],
          ['gate', 'fail'],
          ['goal', m(['gate', 'pass'], ['p', 0.84])],
          ['injection', m(['before', 'fail'], ['after', 'pass'], ['fixed', [1, 2, 10]])],
          ['guards', m(['before', 'pass'], ['after', 'pass'])],
          ['access', m(['before', 'fail'], ['after', 'fail'], ['still', [4, 5]])],
          ['leaks', m(['before', 'unsure'], ['after', 'pass'], ['fixed', [7]])],
          ['regressed', []],
        ),
      ],
      ['mdl', m(['recorded', ['why', 'area', 'parent']])],
      ['next', 'mm3 template drill --parent MM3-0051 --from access'],
      ['notes', ['2 states · budget: $4.96 left of $5.00 · 495 of 500 runs left']],
    );
    expect(emit(doc)).toBe(
      lines(
        'mak:',
        '  id: MM3-0051',
        '  gate: fail',
        '  goal: {gate: pass, p: 0.84}',
        '  injection: {before: fail, after: pass, fixed: [1, 2, 10]}',
        '  guards: {before: pass, after: pass}',
        '  access: {before: fail, after: fail, still: [4, 5]}',
        '  leaks: {before: unsure, after: pass, fixed: [7]}',
        '  regressed: []',
        'mdl: {recorded: [why, area, parent]}',
        'next: mm3 template drill --parent MM3-0051 --from access',
        'notes: ["2 states · budget: $4.96 left of $5.00 · 495 of 500 runs left"]',
      ),
    );
    roundTrip(doc);
  });

  it('replay: a regression alone fails the gate; next: names it, not the goal [C-091]', () => {
    const doc = m(
      [
        'mak',
        m(
          ['id', 'MM3-0052'],
          ['gate', 'fail'],
          ['goal', m(['gate', 'pass'], ['p', 0.81])],
          ['injection', m(['before', 'fail'], ['after', 'pass'], ['fixed', [1, 2, 10]])],
          ['guards', m(['before', 'pass'], ['after', 'pass'])],
          ['access', m(['before', 'pass'], ['after', 'pass'])],
          ['leaks', m(['before', 'unsure'], ['after', 'pass'], ['fixed', [7]])],
          ['regressed', [5]],
        ),
      ],
      ['mdl', m(['recorded', ['why', 'area', 'parent']])],
      ['next', 'mm3 template drill --parent MM3-0052 --from access'],
      ['notes', ['2 states · budget: $4.96 left of $5.00 · 495 of 500 runs left']],
    );
    expect(emit(doc)).toBe(
      lines(
        'mak:',
        '  id: MM3-0052',
        '  gate: fail',
        '  goal: {gate: pass, p: 0.81}',
        '  injection: {before: fail, after: pass, fixed: [1, 2, 10]}',
        '  guards: {before: pass, after: pass}',
        '  access: {before: pass, after: pass}',
        '  leaks: {before: unsure, after: pass, fixed: [7]}',
        '  regressed: [5]',
        'mdl: {recorded: [why, area, parent]}',
        'next: mm3 template drill --parent MM3-0052 --from access',
        'notes: ["2 states · budget: $4.96 left of $5.00 · 495 of 500 runs left"]',
      ),
    );
    roundTrip(doc);
  });

  it('scan: failing is a map of maps, one line per item [C-049]', () => {
    const doc = m(
      [
        'mak',
        m(
          ['id', 'MM3-0060'],
          ['gate', 'fail'],
          ['goal', m(['gate', 'fail'], ['p', 0.21])],
          ['scanned', m(['file', 6], ['function', 23])],
          [
            'failing',
            m(
              ['src/handlers/user.ts/findUser', m(['injection', 'fail'], ['access', 'fail'], ['1', 0.93], ['2', 0.88])],
              ['src/handlers/order.ts/getOrder', m(['access', 'fail'], ['2', 0.79])],
              ['src/handlers/order.ts/listOrders', m(['access', 'unsure'], ['2', 0.52])],
            ),
          ],
          ['passing', 20],
          ['reused', 14],
        ),
      ],
      ['mdl', m(['recorded', ['why', 'area']])],
      ['next', 'mm3 template drill --parent MM3-0060 --from src/handlers/user.ts/findUser'],
      ['notes', ['1 call · 9 questions · budget: $4.92 left of $5.00 · 491 of 500 runs left']],
    );
    expect(emit(doc)).toBe(
      lines(
        'mak:',
        '  id: MM3-0060',
        '  gate: fail',
        '  goal: {gate: fail, p: 0.21}',
        '  scanned: {file: 6, function: 23}',
        '  failing:',
        '    src/handlers/user.ts/findUser: {injection: fail, access: fail, 1: 0.93, 2: 0.88}',
        '    src/handlers/order.ts/getOrder: {access: fail, 2: 0.79}',
        '    src/handlers/order.ts/listOrders: {access: unsure, 2: 0.52}',
        '  passing: 20',
        '  reused: 14',
        'mdl: {recorded: [why, area]}',
        'next: mm3 template drill --parent MM3-0060 --from src/handlers/user.ts/findUser',
        'notes: ["1 call · 9 questions · budget: $4.92 left of $5.00 · 491 of 500 runs left"]',
      ),
    );
    roundTrip(doc);
  });

  it('loop: ids with spaces stay plain; passing is a list', () => {
    const doc = m(
      [
        'mak',
        m(
          ['id', 'MM3-0070'],
          ['gate', 'fail'],
          ['goal', m(['gate', 'pass'], ['p', 0.74])],
          [
            'failing',
            m(
              ['payments', m(['boundaries', 'fail'], ['2', 0.18])],
              ['payments/refunds', m(['done', 'fail'], ['risk', 'fail'], ['3', 0.22], ['4', 0.91])],
              ['payments/partial capture', m(['risk', 'unsure'], ['4', 0.48])],
            ),
          ],
          ['passing', ['gateway', 'gateway/guest checkout', 'gateway/saved cards', 'payments/retries', 'ledger']],
        ),
      ],
      ['mdl', m(['recorded', ['why', 'area']])],
      ['next', 'mm3 template drill --parent MM3-0070 --from payments/refunds'],
      ['notes', ['2 calls · 16 questions · budget: $4.94 left of $5.00 · 493 of 500 runs left']],
    );
    expect(emit(doc)).toBe(
      lines(
        'mak:',
        '  id: MM3-0070',
        '  gate: fail',
        '  goal: {gate: pass, p: 0.74}',
        '  failing:',
        '    payments: {boundaries: fail, 2: 0.18}',
        '    payments/refunds: {done: fail, risk: fail, 3: 0.22, 4: 0.91}',
        '    payments/partial capture: {risk: unsure, 4: 0.48}',
        '  passing: [gateway, gateway/guest checkout, gateway/saved cards, payments/retries, ledger]',
        'mdl: {recorded: [why, area]}',
        'next: mm3 template drill --parent MM3-0070 --from payments/refunds',
        'notes: ["2 calls · 16 questions · budget: $4.94 left of $5.00 · 493 of 500 runs left"]',
      ),
    );
    roundTrip(doc);
  });

  it("replay: expected: grades expect:'s prediction, right after the per-category lines, before regressed: (plan 2b)", () => {
    const doc = m(
      [
        'mak',
        m(
          ['id', 'MM3-0053'],
          ['gate', 'fail'],
          ['goal', m(['gate', 'pass'], ['p', 0.84])],
          ['injection', m(['before', 'fail'], ['after', 'pass'], ['fixed', [1, 2, 10]])],
          ['guards', m(['before', 'pass'], ['after', 'pass'])],
          ['access', m(['before', 'fail'], ['after', 'fail'], ['still', [4, 5]])],
          ['expected', m(['fixed', ['injection']], ['still', ['access']])],
          ['regressed', []],
        ),
      ],
      ['mdl', m(['recorded', ['why', 'parent']])],
      ['next', 'mm3 template drill --parent MM3-0053 --from access'],
      ['notes', ['2 states · budget: $4.96 left of $5.00 · 495 of 500 runs left']],
    );
    expect(emit(doc)).toBe(
      lines(
        'mak:',
        '  id: MM3-0053',
        '  gate: fail',
        '  goal: {gate: pass, p: 0.84}',
        '  injection: {before: fail, after: pass, fixed: [1, 2, 10]}',
        '  guards: {before: pass, after: pass}',
        '  access: {before: fail, after: fail, still: [4, 5]}',
        '  expected: {fixed: [injection], still: [access]}',
        '  regressed: []',
        'mdl: {recorded: [why, parent]}',
        'next: mm3 template drill --parent MM3-0053 --from access',
        'notes: ["2 states · budget: $4.96 left of $5.00 · 495 of 500 runs left"]',
      ),
    );
    roundTrip(doc);
  });

  it("mdl: {recorded: [...]} carries plan 2c's knowledge fields (problem/uses/touches/blast), in that order, last", () => {
    const doc = m(
      ['mak', m(['id', 'MM3-0080'], ['gate', 'pass'])],
      ['mdl', m(['recorded', ['why', 'area', 'problem', 'uses', 'touches', 'blast']])],
      ['next', 'act on it'],
      ['notes', ['free']],
    );
    expect(emit(doc)).toBe(
      lines(
        'mak:',
        '  id: MM3-0080',
        '  gate: pass',
        'mdl: {recorded: [why, area, problem, uses, touches, blast]}',
        'next: act on it',
        'notes: [free]',
      ),
    );
    roundTrip(doc);
  });

  it('view: categories is a map of maps; mdl records none', () => {
    const doc = m(
      [
        'mak',
        m(
          ['view', 'src/user.ts:1-3'],
          ['reuse', 'MM3-0042'],
          ['runs', 7],
          [
            'categories',
            m(
              ['injection', m(['runs', 5], ['pass', 1], ['fail', 4], ['last', 'MM3-0042'])],
              ['guards', m(['runs', 5], ['pass', 4], ['fail', 1], ['last', 'MM3-0042'])],
              ['leaks', m(['runs', 0])],
            ),
          ],
        ),
      ],
      ['mdl', m(['recorded', 'none'])],
      ['next', 'mm3 view MM3-0042'],
      ['notes', ['free']],
    );
    expect(emit(doc)).toBe(
      lines(
        'mak:',
        '  view: src/user.ts:1-3',
        '  reuse: MM3-0042',
        '  runs: 7',
        '  categories:',
        '    injection: {runs: 5, pass: 1, fail: 4, last: MM3-0042}',
        '    guards: {runs: 5, pass: 4, fail: 1, last: MM3-0042}',
        '    leaks: {runs: 0}',
        'mdl: {recorded: none}',
        'next: mm3 view MM3-0042',
        'notes: [free]',
      ),
    );
    roundTrip(doc);
  });
});

describe('scalars', () => {
  it('plain when safe; quoted when YAML would read something else', () => {
    expect(['free', 'payments/partial capture', 'src/user.ts:1-3', '2 calls · 16 questions'].map((s) => scalar(s, true))).toEqual([
      'free',
      'payments/partial capture',
      'src/user.ts:1-3',
      '2 calls · 16 questions',
    ]);
    expect(['no', 'true', '1.5', '', ' x', 'a: b', 'a #b', '-x', '{x}', '[x]', "'x"].map((s) => scalar(s, false))).toEqual([
      '"no"', '"true"', '"1.5"', '""', '" x"', '"a: b"', '"a #b"', '"-x"', '"{x}"', '"[x]"', '"\'x"',
    ]);
    expect([scalar('a, b', true), scalar('a, b', false)]).toEqual(['"a, b"', 'a, b']);
  });

  it('any string survives a round trip in every position (seeded fuzz)', () => {
    const rnd = seededRandom('emit-fuzz');
    const alphabet = [...'aZ10.-+ :#?,[]{}"\'!&*|>%@`~/\\·exontru\t=()$;'];
    for (let i = 0; i < 5000; i++) {
      let s = '';
      const len = 1 + Math.floor(rnd() * 8);
      for (let j = 0; j < len; j++) s += alphabet[Math.floor(rnd() * alphabet.length)];
      if (s === 'k') continue;
      roundTrip(m(['mak', m(['k', s], ['f', m(['x', s], [s, 1])], ['l', [s, 'b']])], ['next', s], ['notes', [s]]));
    }
  });
});
