import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { createFakeAdapter } from '../../src/classifier/fake.ts';
import { __testOnly } from '../../src/ledger/index.ts';
import { appendOutcome, appendRun, readLedger } from '../../src/ledger/log.ts';
import { runChange } from '../../src/verbs/change.ts';
import { runClass } from '../../src/verbs/class.ts';
import { runView } from '../../src/verbs/view.ts';
import { stubProvider } from '../helpers/stub-provider.ts';
import { tempProject } from '../helpers/project.ts';
import { sampleRun } from '../helpers/runs.ts';
import { writeSyntheticLedger } from '../gen/synthetic-ledger.ts';

afterEach(() => {
  __testOnly.forceFallback = false;
});

const at = (day: number) => Date.parse(`2026-09-${String(day).padStart(2, '0')}T12:00:00Z`);

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

  it('shows 10 runs at L1 and says how many are older', () => {
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
    expect(runView('SW-0099', 1, { paths, env: {} })).toEqual({ exit: 2, text: '✖ view: SW-0099 is not in the ledger → "sidewise view <folder>" lists recent runs' });
  });
});

describe('view: request mode', () => {
  it('the contract example, no history: runs 0, next class, free [C-053] [C-054]', async () => {
    const { paths } = tempProject({ 'src/user.ts': 'x'.repeat(5) });
    const text = 'side:\n  goal: This login handler is safe to merge\n  depth: quick\n  where: [src/user.ts:1-3]\n  ask:\n    injection:\n      pass: no\n      1: Is request text placed directly into the SQL query?\n';
    const r = runView(text, 1, { paths, env: {} });
    expect(r.exit).toBe(0);
    expect(r.text).toBe(
      ['side:', '  view: src/user.ts:1-3', '  runs: 0', '  categories:', '    injection: {runs: 0}', 'wise: {recorded: none}', 'next: sidewise class', 'notes: [free]'].join('\n') + '\n',
    );
  });

  it('with history: per-category counts, and reuse when the exact question set was asked before [C-052] [C-059]', async () => {
    const { paths } = tempProject({ 'src/user.ts': 'x'.repeat(5) });
    // First: a real class run on this file with this exact category (Task 15's runClass), so it lands in the ledger as v2.
    await runClass(
      'side:\n  goal: This login handler is safe to merge\n  depth: quick\n  where: [src/user.ts:1-3]\n  ask:\n    injection:\n      pass: no\n      1: Is request text placed directly into the SQL query?\n      2: q2?\n      3: q3?\n      4: q4?\n      5: q5?\n      6: q6?\n      7: q7?\n      8: q8?\n      9: q9?\n      10: q10?\n',
      { paths, provider: stubProvider({ yes: () => 0.9 }), env: {} },
    );
    const draft = 'side:\n  goal: yes it is\n  depth: quick\n  where: [src/user.ts:1-3]\n  ask:\n    injection:\n      pass: no\n      1: Is request text placed directly into the SQL query?\n      2: q2?\n      3: q3?\n      4: q4?\n      5: q5?\n      6: q6?\n      7: q7?\n      8: q8?\n      9: q9?\n      10: q10?\n';
    const r = runView(draft, 1, { paths, env: {} });
    expect(r.text).toContain('runs: 1');
    expect(r.text).toContain('injection: {runs: 1, pass: 0, fail: 1, last: SW-0001}');
  });

  it('reuse: the exact same request comes back as reuse, and the view call spends nothing [C-050] [C-053] [C-054]', async () => {
    const { paths } = tempProject({ 'src/user.ts': 'x'.repeat(5) });
    // The fake adapter (Task 7) is what providerIdentity({}) names too, so the run and the lookup agree on who answered.
    const text =
      'side:\n  goal: This login handler is safe to merge\n  depth: quick\n  where: [src/user.ts:1-3]\n  ask:\n    injection:\n      pass: no\n      1: Is request text placed directly into the SQL query?\n      2: q2?\n      3: q3?\n      4: q4?\n      5: q5?\n      6: q6?\n      7: q7?\n      8: q8?\n      9: q9?\n      10: q10?\n';
    const classResult = await runClass(text, { paths, provider: createFakeAdapter(), env: {} });
    expect(classResult.exit).toBe(0);
    const linesBefore = readLedger(paths).length;
    const budgetBefore = readFileSync(paths.budget, 'utf8');
    // The SAME request text: same goal, same categories/questions, same where.
    const r = runView(text, 1, { paths, env: {} });
    expect(r.text).toContain('reuse: SW-0001');
    expect(r.text).toContain('next: sidewise view SW-0001');
    expect(readLedger(paths).length).toBe(linesBefore);
    expect(readFileSync(paths.budget, 'utf8')).toBe(budgetBefore);
  });

  it('a fixed-and-held category gets no hit ranking: view shows the plain per-category record, nothing else [C-052] [C-067]', async () => {
    const { paths } = tempProject({ 'src/user.ts': 'x'.repeat(5) });
    const text =
      'side:\n  goal: This login handler is safe to merge\n  depth: quick\n  where: [src/user.ts:1-3]\n  ask:\n    injection:\n      pass: no\n      1: q1?\n      2: q2?\n      3: q3?\n      4: q4?\n      5: q5?\n      6: q6?\n      7: q7?\n      8: q8?\n      9: q9?\n      10: q10?\n';
    await runClass(text, { paths, provider: stubProvider({ yes: () => 0.9 }), env: {} }); // SW-0001: injection fails
    await runChange('side:\n  goal: verify the fix\n  parent: SW-0001\n  compare: {before: worktree, after: worktree}\n', { paths, provider: stubProvider({ yes: () => 0.05 }), env: {} }); // SW-0002: injection now passes
    appendOutcome(paths, 'SW-0001', 'held', 'owner'); // the yardstick's prediction is confirmed: a "hit"
    const r = runView(text, 1, { paths, env: {} });
    // The record is still just runs/pass/fail/last, unranked — recording the hit changed nothing about it
    // (SW-0001 fails "before", SW-0002 the change's "after" gate passes; nothing above this counts the hit).
    expect(r.text).toContain('injection: {runs: 2, pass: 1, fail: 1, last: SW-0002}');
    expect(r.text).not.toContain('best');
    expect(r.text).not.toContain('hit');
    expect(r.text).not.toContain('rank');
  });
});

// S1: runRequestMode's place lookup now goes through the index (handle.placeCandidates) instead of a full
// readLedger scan. The expected text below was captured from the UNCHANGED implementation against this exact
// synthetic ledger (seed 'view-req-1', 300 runs — a mix of class/scan/change/loop/view verbs, legacy and
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
