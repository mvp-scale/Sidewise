import { describe, expect, it, afterEach } from 'vitest';
import { loadBudget } from '../../src/budget/budget.ts';
import { createFakeAdapter } from '../../src/classifier/fake.ts';
import { __testOnly } from '../../src/ledger/index.ts';
import { appendContractRun, appendOutcome, appendRun, readLedger } from '../../src/ledger/log.ts';
import { runReplay } from '../../src/verbs/replay.ts';
import { runClass } from '../../src/verbs/class.ts';
import { runView } from '../../src/verbs/view.ts';
import { stubProvider } from '../helpers/stub-provider.ts';
import { tempProject, USER_TS } from '../helpers/project.ts';
import { sampleContractRun, sampleRun } from '../helpers/runs.ts';
import { writeSyntheticLedger } from '../gen/synthetic-ledger.ts';

afterEach(() => {
  __testOnly.forceFallback = false;
});

const at = (day: number) => Date.parse(`2026-09-${String(day).padStart(2, '0')}T12:00:00Z`);

/** A full, contract-valid quick-depth one-subject ask: 3 concerns categories x 3 probes + decisions (>=1 scale,
 *  >=1 choice). `name` stays the first category so the tests below can still target it by name — view matches
 *  a category by name alone (view.ts's categoryEntry), so a view draft naming the same category doesn't need
 *  to repeat this full shape; only the class/replay runs that actually get graded do. */
const fullClassAsk = (name: string): string =>
  `  ask:\n    concerns:\n      ${name}:\n        pass: no\n        1: q1?\n        2: q2?\n        3: q3?\n      c1:\n        pass: yes\n        4: q4?\n        5: q5?\n        6: q6?\n      c2:\n        pass: yes\n        7: q7?\n        8: q8?\n        9: q9?\n    decisions:\n      severity:\n        pass: [none]\n        10:\n          scale: how bad?\n          levels: [none, high]\n      route:\n        pass: [ship]\n        11:\n          choice: where to?\n          options: [ship, block]\n`;

describe('view', () => {
  it('a folder shows outcome counts and runs newest first; a tag works too [C-055]', () => {
    const { paths } = tempProject({});
    appendRun(paths, sampleRun({ focus: 'first' }), at(20));
    appendRun(paths, sampleRun({ focus: 'second', where: [{ path: 'src/db/pool.ts' }], tags: ['perf'] }), at(21));
    appendRun(paths, sampleRun({ focus: 'third' }), at(22));
    appendOutcome(paths, 'SW-0001', 'held', 'owner');
    appendOutcome(paths, 'SW-0003', 'overruled', 'owner');
    expect(runView('src/api', 1, { paths, env: {} })).toEqual({
      exit: 0,
      text: [
        'sidewise view src/api · 2 runs · held 1 · overruled 1 · failed 0 · open 0',
        'SW-0003 2026-09-22 class L1 STRONG concern "third" · overruled',
        'SW-0001 2026-09-20 class L1 STRONG concern "first" · held',
      ].join('\n'),
    });
    expect(runView('./src/', 1, { paths, env: {} }).text.split('\n')[0]).toBe('sidewise view src · 3 runs · held 1 · overruled 1 · failed 0 · open 1');
    expect(runView('perf', 1, { paths, env: {} }).text).toContain('SW-0002 2026-09-21 class L1 STRONG concern "second" · open');
  });

  it('labels rehearsal runs (fake, chaos) and counts them apart from outcomes', () => {
    const { paths } = tempProject({});
    appendRun(paths, sampleRun({ focus: 'real' }), at(20));
    appendRun(paths, sampleRun({ focus: 'rehearsal', adapter: 'fake' }), at(21));
    appendRun(paths, sampleRun({ focus: 'rehearsal two', adapter: 'fake' }), at(22));
    appendOutcome(paths, 'SW-0002', 'held', 'owner');
    expect(runView('src', 1, { paths, env: {} }).text).toBe(
      [
        'sidewise view src · 3 runs · held 0 · overruled 0 · failed 0 · open 1 · rehearsal 2',
        'SW-0003 2026-09-22 class L1 STRONG concern "rehearsal two" · open · rehearsal',
        'SW-0002 2026-09-21 class L1 STRONG concern "rehearsal" · held · rehearsal',
        'SW-0001 2026-09-20 class L1 STRONG concern "real" · open',
      ].join('\n'),
    );
    expect(runView('SW-0002', 1, { paths, env: {} }).text.split('\n')[1]).toBe('▶ SW-0002 2026-09-21 class L1 STRONG concern "rehearsal" · held · rehearsal');
  });

  it('an empty place says how to start', () => {
    const { paths } = tempProject({});
    expect(runView('docs', 1, { paths, env: {} })).toEqual({ exit: 0, text: 'sidewise view docs · no runs yet → "sidewise class <request>" starts one' });
  });

  it('shows 10 runs at L1 and says how many are older [C-122]', () => {
    const { paths } = tempProject({});
    for (let i = 0; i < 12; i++) appendRun(paths, sampleRun({ focus: `run ${i}` }));
    const lines = runView('src', 1, { paths, env: {} }).text.split('\n');
    expect(lines).toHaveLength(12);
    expect(lines[11]).toBe('… 2 older → raise the level to see more');
    expect(runView('src', 2, { paths, env: {} }).text.split('\n')).toHaveLength(13);
  });

  it('a run id shows its lineage up and down [C-055]', () => {
    const { paths } = tempProject({});
    appendRun(paths, sampleRun({ focus: 'root' }), at(20));
    appendRun(paths, sampleRun({ focus: 'child', parent: 'SW-0001' }), at(21));
    appendRun(paths, sampleRun({ focus: 'grandchild', parent: 'SW-0002' }), at(22));
    expect(runView('SW-0002', 1, { paths, env: {} }).text).toBe(
      [
        'sidewise view SW-0002 · lineage 1 up · 1 down',
        '↑ SW-0001 2026-09-20 class L1 STRONG concern "root" · open',
        '▶ SW-0002 2026-09-21 class L1 STRONG concern "child" · open',
        '↓ SW-0003 2026-09-22 class L1 STRONG concern "grandchild" · open',
      ].join('\n'),
    );
  });

  it('an unknown id exits 2 with a fix', () => {
    const { paths } = tempProject({});
    expect(runView('SW-0099', 1, { paths, env: {} })).toEqual({
      exit: 2,
      text: '✖ view: SW-0099 is not in the ledger → "sidewise view <folder>" lists recent runs\n→ see: sidewise agent view',
    });
  });

  it('[C-121] fix #1: a real source file (not a request) is a place, even when cli.ts already read its bytes as `content`', () => {
    const { paths } = tempProject({ 'src/user.ts': USER_TS });
    appendRun(paths, sampleRun({ focus: 'earlier look', where: [{ path: 'src/user.ts' }] }));
    // `content` is what cli.ts would have read from the file — real source code, not a `side:` request — and
    // must never itself be probed for control characters or shown as the "place"; only `arg` (the path) is.
    const r = runView('src/user.ts', 1, { paths, env: {} }, USER_TS);
    expect(r.exit).toBe(0);
    expect(r.text).toContain('sidewise view src/user.ts · 1 run');
    expect(r.text).not.toContain('control characters');
  });

  it('[C-121] fix #1: a saved request FILE (content parses as side:) is still request mode via `content`', () => {
    const { paths } = tempProject({ 'src/user.ts': 'x'.repeat(5) });
    const yaml = 'side:\n  goal: what do we know here\n  where: [src/user.ts:1-3]\n';
    // arg is the file's path, not the yaml itself — only `content` (what cli.ts read from disk) looks like a request.
    const r = runView('requests/x.yaml', 1, { paths, env: {} }, yaml);
    expect(r.exit).toBe(0);
    expect(r.text).toContain('view: src/user.ts:1-3');
  });

  it('[C-123] fix #3: --level on a run id adds category detail (L2) then notes/adapter (L3); L1 is unchanged', () => {
    const { paths } = tempProject({});
    appendContractRun(paths, sampleContractRun({ categories: { injection: 'fail' }, notes: ['a note'] }), Date.now(), 'b'); // SW-0001
    const l1 = runView('SW-0001', 1, { paths, env: {} }).text;
    expect(l1).not.toContain('categories:');
    expect(l1).not.toContain('a note');
    const l2 = runView('SW-0001', 2, { paths, env: {} }).text;
    expect(l2).toContain('  categories: injection=fail');
    expect(l2).not.toContain('a note');
    const l3 = runView('SW-0001', 3, { paths, env: {} }).text;
    expect(l3).toContain('  categories: injection=fail');
    expect(l3).toContain('  notes: a note');
    expect(l3).toContain('adapter: stub · model: stub-1');
  });

  it('[C-123] fix #3: --level on a legacy (Plan 1) run id is a documented no-op, never a crash', () => {
    const { paths } = tempProject({});
    appendRun(paths, sampleRun({ focus: 'legacy' }));
    expect(runView('SW-0001', 3, { paths, env: {} }).text).toBe(runView('SW-0001', 1, { paths, env: {} }).text);
  });
});

describe('view: request mode', () => {
  it('the contract example, no history: runs 0, next class, free [C-053] [C-054]', async () => {
    const { paths } = tempProject({ 'src/user.ts': 'x'.repeat(5) });
    const text = 'side:\n  goal: This login handler is safe to merge\n  depth: quick\n  where: [src/user.ts:1-3]\n  ask:\n    concerns:\n      injection:\n        pass: no\n        1: Is request text placed directly into the SQL query?\n';
    const r = runView(text, 1, { paths, env: {} });
    expect(r.exit).toBe(0);
    // plan 2c B3 N2: no prior run touched this place at all -> "never asked", not just an omitted field.
    expect(r.text).toBe(
      ['side:', '  view: src/user.ts:1-3', '  reuse: never asked', '  runs: 0', '  categories:', '    injection: {runs: 0}', 'wise: {recorded: none}', 'next: sidewise class', 'notes: [free]'].join(
        '\n',
      ) + '\n',
    );
  });

  it('with history: per-category counts, and reuse when the exact question set was asked before [C-052] [C-059]', async () => {
    const { paths } = tempProject({ 'src/user.ts': 'x'.repeat(5) });
    // First: a real class run on this file with this exact category (Task 15's runClass), so it lands in the ledger as v2.
    await runClass(`side:\n  goal: This login handler is safe to merge\n  depth: quick\n  where: [src/user.ts:1-3]\n${fullClassAsk('injection')}`, {
      paths,
      provider: stubProvider({ yes: () => 0.9 }),
      env: {},
    });
    // A view draft is lenient about the count rules, so it can stay thin — only the category NAME has to match
    // (view.ts's categoryEntry matches by name alone, never by the exact question set).
    const draft = 'side:\n  goal: yes it is\n  depth: quick\n  where: [src/user.ts:1-3]\n  ask:\n    concerns:\n      injection:\n        pass: no\n        1: Is request text placed directly into the SQL query?\n';
    const r = runView(draft, 1, { paths, env: {} });
    expect(r.text).toContain('runs: 1');
    expect(r.text).toContain('injection: {runs: 1, pass: 0, fail: 1, last: SW-0001}');
    // plan 2c B3 N2: a prior run DID touch this place, but its evidence key no longer matches this exact draft
    // (a different goal text) — say so by name, not just omit the field.
    expect(r.text).toContain('reuse: code in where changed since SW-0001');
  });

  it('reuse: the exact same request comes back as reuse, and the view call spends nothing [C-050] [C-053] [C-054]', async () => {
    const { paths } = tempProject({ 'src/user.ts': 'x'.repeat(5) });
    // The fake adapter (Task 7) is what providerIdentity({}) names too, so the run and the lookup agree on who answered.
    const text = `side:\n  goal: This login handler is safe to merge\n  depth: quick\n  where: [src/user.ts:1-3]\n${fullClassAsk('injection')}`;
    const classResult = await runClass(text, { paths, provider: createFakeAdapter(), env: {} });
    expect(classResult.exit).toBe(0);
    const linesBefore = readLedger(paths).length;
    // plan 2c B1: budget state is ledger-derived now (no budget.json bytes to diff) — compare the computed
    // state before/after instead, proving the free lookup spent/counted nothing.
    const budgetBefore = loadBudget(paths).state;
    // The SAME request text: same goal, same categories/questions, same where.
    const r = runView(text, 1, { paths, env: {} });
    expect(r.text).toContain('reuse: SW-0001');
    // plan 2c B3 D1: a found reuse also shows its own age (no git repo here, so no commits-since to show).
    expect(r.text).toContain('reuseAge: {days: 0}');
    expect(r.text).toContain('next: sidewise view SW-0001');
    // Plan 2b: a real draft check (a full ask, not just a bare place/id lookup) is logged, free — one new
    // "lookup" record, never a run: it carries no SW-#### id and never touches the budget (checked below).
    expect(readLedger(paths).length).toBe(linesBefore + 1);
    expect(loadBudget(paths).state).toEqual(budgetBefore);
  });

  it('a fixed-and-held category gets no hit ranking: view shows the plain per-category record, nothing else [C-052] [C-067]', async () => {
    const { paths } = tempProject({ 'src/user.ts': 'x'.repeat(5) });
    const text = `side:\n  goal: This login handler is safe to merge\n  depth: quick\n  where: [src/user.ts:1-3]\n${fullClassAsk('injection')}`;
    await runClass(text, { paths, provider: stubProvider({ yes: () => 0.9 }), env: {} }); // SW-0001: injection fails
    await runReplay('side:\n  goal: verify the fix\n  parent: SW-0001\n  compare: {before: worktree, after: worktree}\n  expect: [injection]\n', {
      paths,
      provider: stubProvider({ yes: () => 0.05 }),
      env: {},
    }); // SW-0002: injection now passes
    appendOutcome(paths, 'SW-0001', 'held', 'owner'); // the yardstick's prediction is confirmed: a "hit"
    const r = runView(text, 1, { paths, env: {} });
    // The record is still just runs/pass/fail/last, unranked — recording the hit changed nothing about it
    // (SW-0001 fails "before", SW-0002 the replay's "after" gate passes; nothing above this counts the hit).
    expect(r.text).toContain('injection: {runs: 2, pass: 1, fail: 1, last: SW-0002}');
    expect(r.text).not.toContain('best');
    expect(r.text).not.toContain('hit');
    expect(r.text).not.toContain('rank');
  });
});

// S1: runRequestMode's place lookup now goes through the index (handle.placeCandidates) instead of a full
// readLedger scan. The expected text below was captured from the UNCHANGED implementation against this exact
// synthetic ledger (seed 'view-req-1', 300 runs — a mix of class/scan/replay/loop/view verbs, legacy and
// contract shapes, and outcome lines) before the index-backed rewrite, so a match here proves the rewrite is
// byte-identical, not just "close." `src/nowhere/ghost.ts` is a real file on disk that no run's `where` ever
// touches — the "place with no runs" case, folded into the same multi-place request.
describe('view <request>: the place lookup via the index matches the old full-ledger scan [C-050] [C-052]', () => {
  it('byte-identical on a realistic mixed ledger, on both the SQLite and linear-fallback paths', () => {
    const { paths } = tempProject({ 'src/infra/file4.ts': 'export const x = 1;\n', 'src/nowhere/ghost.ts': 'export const y = 1;\n' });
    writeSyntheticLedger(paths, { seed: 'view-req-1', runs: 300, outcomeRate: 0.4, badRate: 0.2, sweepShare: 0.1 });
    const text = 'side:\n  goal: what do we know about infra file 4 and a place with no runs\n  where: [src/infra/file4.ts, src/nowhere/ghost.ts]\n';
    const expected = {
      exit: 0,
      text:
        [
          'side:',
          '  view: src/infra/file4.ts, src/nowhere/ghost.ts',
          '  runs: 13',
          '  categories:',
          '    migration: {runs: 2, pass: 0, fail: 1, last: SW-0074}',
          '    perf: {runs: 3, pass: 2, fail: 1, last: SW-0215}',
          '    tests: {runs: 2, pass: 0, fail: 2, last: SW-0144}',
          '    tokens: {runs: 3, pass: 0, fail: 1, last: SW-0255}',
          '    deps: {runs: 1, pass: 0, fail: 0, last: SW-0203}',
          '    sql: {runs: 1, pass: 1, fail: 0, last: SW-0282}',
          '    cache: {runs: 1, pass: 0, fail: 1, last: SW-0296}',
          'wise: {recorded: none}',
          'next: sidewise class',
          'notes: [free]',
        ].join('\n') + '\n',
    };

    expect(runView(text, 1, { paths, env: {} })).toEqual(expected);
    __testOnly.forceFallback = true;
    expect(runView(text, 1, { paths, env: {} })).toEqual(expected);
  });
});

// S2: byId's lineage walk now goes through the index (up: findOffset; down: the new `parent` column via
// handle.childrenOf) instead of building a full id -> record map from readLedger. The expected text below was
// captured from the UNCHANGED implementation against this exact synthetic ledger (seed 'view-lineage-1', 300
// runs, parentShare 0.35 for real branching chains), so a match proves the rewrite is byte-identical. SW-0018
// covers a mid-tree id (2 up, a 2-level "down" BFS); SW-0092 a leaf (deep up, no down); SW-0001 the root (a wide
// multi-branch "down" truncated at the level-1 limit of 10); SW-9999 the not-found case.
describe('view <id>: the lineage walk via the index matches the old full-ledger scan [C-055]', () => {
  it('byte-identical on a realistic ledger with parent chains, on both the SQLite and linear-fallback paths', () => {
    const { paths } = tempProject({});
    writeSyntheticLedger(paths, { seed: 'view-lineage-1', runs: 300, outcomeRate: 0.4, badRate: 0.2, parentShare: 0.35 });

    const cases: { id: string; expected: { exit: number; text: string } }[] = [
      {
        id: 'SW-0018',
        expected: {
          exit: 0,
          text: [
            'sidewise view SW-0018 · lineage 2 up · 3 down',
            '↑ SW-0001 2026-09-01 class thorough pass "cache in auth is safe" · open',
            '↑ SW-0004 2026-09-01 scan standard unsure "tests in auth is safe" · open',
            '▶ SW-0018 2026-09-01 view standard unsure "sql in infra is safe" · held',
            '↓ SW-0024 2026-09-01 loop thorough pass "sql in db is safe" · held',
            '↓ SW-0182 2026-09-01 view thorough pass "sql in docs is safe" · open',
            '↓ SW-0092 2026-09-01 drill thorough fail "tokens in db is safe" · open',
          ].join('\n'),
        },
      },
      {
        id: 'SW-0092',
        expected: {
          exit: 0,
          text: [
            'sidewise view SW-0092 · lineage 4 up · 0 down',
            '↑ SW-0001 2026-09-01 class thorough pass "cache in auth is safe" · open',
            '↑ SW-0004 2026-09-01 scan standard unsure "tests in auth is safe" · open',
            '↑ SW-0018 2026-09-01 view standard unsure "sql in infra is safe" · held',
            '↑ SW-0024 2026-09-01 loop thorough pass "sql in db is safe" · held',
            '▶ SW-0092 2026-09-01 drill thorough fail "tokens in db is safe" · open',
          ].join('\n'),
        },
      },
      {
        id: 'SW-0001',
        expected: {
          exit: 0,
          text: [
            'sidewise view SW-0001 · lineage 0 up · 8 down',
            '▶ SW-0001 2026-09-01 class thorough pass "cache in auth is safe" · open',
            '↓ SW-0004 2026-09-01 scan standard unsure "tests in auth is safe" · open',
            '↓ SW-0084 2026-09-01 loop standard unsure "deps in docs is safe" · open',
            '↓ SW-0018 2026-09-01 view standard unsure "sql in infra is safe" · held',
            '↓ SW-0059 2026-09-01 replay thorough pass "secrets in docs is safe" · open',
            '↓ SW-0116 2026-09-01 class standard pass "secrets in api is safe" · open',
            '↓ SW-0024 2026-09-01 loop thorough pass "sql in db is safe" · held',
            '↓ SW-0182 2026-09-01 view thorough pass "sql in docs is safe" · open',
            '↓ SW-0092 2026-09-01 drill thorough fail "tokens in db is safe" · open',
          ].join('\n'),
        },
      },
      {
        id: 'SW-9999',
        expected: { exit: 2, text: '✖ view: SW-9999 is not in the ledger → "sidewise view <folder>" lists recent runs\n→ see: sidewise agent view' },
      },
    ];

    for (const { id, expected } of cases) expect(runView(id, 1, { paths, env: {} })).toEqual(expected);
    __testOnly.forceFallback = true;
    for (const { id, expected } of cases) expect(runView(id, 1, { paths, env: {} })).toEqual(expected);
  });
});

describe('view: fix #2, a sweep run is indexed by its own item places and category tags [C-120]', () => {
  const sweepRun = () =>
    sampleContractRun({
      verb: 'scan',
      where: [],
      ask: {
        categories: [],
        layers: [{ name: 'file', categories: [{ name: 'injection', section: 'concerns', pass: 'no', need: 'all', tags: ['sql-risk'], questions: [{ n: 1, kind: 'yesno', text: 'q?' }] }] }],
      },
      items: {
        'src/a.ts': { layer: 'file', fill: {}, unit: { path: 'src/a.ts', kind: 'file', name: 'src/a.ts', lines: '1-2' }, status: 'asked', gate: 'fail', categories: { injection: 'fail' } },
      },
      categories: {},
    });

  it('shows up under view <folder> and view <tag> — not just view . — on both engines', () => {
    const { paths } = tempProject({});
    appendContractRun(paths, sweepRun(), Date.now(), 'b'); // SW-0001
    for (const forceFallback of [false, true]) {
      __testOnly.forceFallback = forceFallback;
      expect(runView('src', 1, { paths, env: {} }).text).toContain('sidewise view src · 1 run');
      expect(runView('sql-risk', 1, { paths, env: {} }).text).toContain('sidewise view sql-risk · 1 run');
      expect(runView('.', 1, { paths, env: {} }).text).toContain('sidewise view . · 1 run');
    }
  });

  it('a one-subject run is unaffected: its own where/ask carry no items, no tags added', () => {
    const { paths } = tempProject({});
    appendContractRun(paths, sampleContractRun(), Date.now(), 'b'); // SW-0001, where: [src/api/user.ts]
    expect(runView('sql-risk', 1, { paths, env: {} }).text).toBe('sidewise view sql-risk · no runs yet → "sidewise class <request>" starts one');
  });
});

describe('view: fix #14, --summary [C-124]', () => {
  it('one line per distinct place, from the latest run touching it, worst gate first', () => {
    const { paths } = tempProject({});
    appendContractRun(paths, sampleContractRun({ where: ['src/a.ts'], gate: 'pass', goal: 'a is fine' }), Date.now(), 'b'); // SW-0001
    appendContractRun(paths, sampleContractRun({ where: ['src/b.ts'], gate: 'fail', goal: 'b has a bug' }), Date.now(), 'b'); // SW-0002
    // A second, later run on src/a.ts flips it to fail — the summary must show the LATEST verdict, not the first.
    appendContractRun(paths, sampleContractRun({ where: ['src/a.ts'], gate: 'fail', goal: 'a regressed' }), Date.now(), 'b'); // SW-0003
    const r = runView('.', 1, { paths, env: {} }, undefined, true);
    expect(r.exit).toBe(0);
    const lines = r.text.split('\n');
    expect(lines[0]).toBe('sidewise view . --summary · 2 places');
    expect(lines[1]).toBe('src/a.ts · class fail · SW-0003 "a regressed"');
    expect(lines[2]).toBe('src/b.ts · class fail · SW-0002 "b has a bug"');
  });

  it('an empty scope says so', () => {
    const { paths } = tempProject({});
    expect(runView('src', 1, { paths, env: {} }, undefined, true).text).toBe('sidewise view src --summary · no runs yet → "sidewise class <request>" starts one');
  });

  it('is ignored for a run id (lineage mode has no "places" to summarize)', () => {
    const { paths } = tempProject({});
    appendRun(paths, sampleRun({ focus: 'x' }));
    expect(runView('SW-0001', 1, { paths, env: {} }, undefined, true)).toEqual(runView('SW-0001', 1, { paths, env: {} }));
  });
});
