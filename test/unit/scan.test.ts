// scan: a code sweep with per-function reuse. Review Focus #2: a second scan of unchanged code is free.
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadBudget } from '../../src/budget/budget.ts';
import { readLedger, isContractRun } from '../../src/ledger/log.ts';
import { runScan } from '../../src/verbs/scan.ts';
import { tempProject } from '../helpers/project.ts';
import { stubProvider } from '../helpers/stub-provider.ts';

const env = { SIDEWISE_ACTOR: 'r' };
const REQUEST =
  'side:\n  goal: Handlers don\'t trust request input\n  depth: quick\n  over:\n    file: src/*.ts\n    function: each\n  ask:\n    function:\n      injection:\n        pass: no\n        1: Does {function} put request text straight into a query?\nwise:\n  why: find\n  area: api\n';
const FILES = {
  'src/a.ts': 'export function bad(req) { return db.query(`x ${req.id}`); }\n',
  'src/b.ts': 'export function good(req) { return db.query("x", [req.id]); }\n',
};

describe('scan', () => {
  it('the contract shape: scanned, failing worst first, passing/reused as counts [C-070]', async () => {
    const { paths } = tempProject(FILES);
    const provider = stubProvider({ yes: (q) => (q.id.endsWith('bad#1') ? 0.9 : 0.1) });
    const r = await runScan(REQUEST, { paths, provider, env });
    expect(r.exit).toBe(0);
    expect(r.text).toContain('scanned: {file: 2, function: 2}');
    expect(r.text).toContain('src/a.ts/bad: {injection: fail, 1: 0.90}');
    expect(r.text).toContain('passing: 1');
    expect(r.text).toContain('reused: 0');
    expect(r.text).toContain('next: sidewise template drill --parent SW-0001 --from src/a.ts/bad');
    expect(provider.calls).toHaveLength(1); // one call: the function layer (file has no ask categories)
  });

  it('a second scan of unchanged code is free [C-072] [C-073]', async () => {
    const { paths } = tempProject(FILES);
    const provider = stubProvider({ yes: (q) => (q.id.endsWith('bad#1') ? 0.9 : 0.1) });
    const r1 = await runScan(REQUEST, { paths, provider, env });
    const budgetAfterFirst = loadBudget(paths).state;
    const r2 = await runScan(REQUEST, { paths, provider, env });
    expect(provider.calls).toHaveLength(1); // still just the one call from the first run
    expect(r2.text).toContain('reused: 2');
    // The second run's ledger line answers identically to the first: same worst-first failing entry.
    expect(r1.text).toContain('src/a.ts/bad: {injection: fail, 1: 0.90}');
    expect(r2.text).toContain('src/a.ts/bad: {injection: fail, 1: 0.90}');
    // Free really means free: budget spend and run count unchanged by the second (all-reused) run.
    const budgetAfterSecond = loadBudget(paths).state;
    expect(budgetAfterSecond.runs).toBe(budgetAfterFirst.runs);
    expect(budgetAfterSecond.spentUsd).toBe(budgetAfterFirst.spentUsd);
    const runs = readLedger(paths).filter(isContractRun);
    expect(runs[1]).toMatchObject({ id: 'SW-0002', verb: 'scan', calls: 0 });
    // [C-073] a sweep run's own top-level categories stays empty; the per-function grading lives only
    // under items[id].categories (same shape loop.test.ts pins for C-083) — no folder/category query reads
    // this field for scan today.
    expect(runs[1]!.categories).toEqual({});
  });

  it('a changed function forces exactly one new call carrying only it; the unchanged one stays reused [C-036]', async () => {
    const { root, paths } = tempProject(FILES);
    const provider = stubProvider({ yes: (q) => (q.id.endsWith('bad#1') ? 0.9 : 0.1) });
    await runScan(REQUEST, { paths, provider, env });
    expect(provider.calls).toHaveLength(1);

    // Same function name, same file, different body: its answer key (keyed on the function's own text) no
    // longer matches the ledger, so only this one function is asked again.
    writeFileSync(path.join(root, 'src/a.ts'), 'export function bad(req) { return db.query(`y ${req.id}`); }\n');

    const r2 = await runScan(REQUEST, { paths, provider, env });
    expect(provider.calls).toHaveLength(2); // exactly one new call
    const secondCall = provider.calls[1]!;
    expect(secondCall.questions.map((q) => q.id)).toEqual(['src/a.ts/bad#1']); // only the changed function is asked
    expect(Object.keys(secondCall.state.items ?? {})).toEqual(['src/a.ts/bad']); // and it carries only that function
    expect(r2.text).toContain('reused: 1'); // src/b.ts/good, unchanged, is still free
  });

  it('--dry-run: no provider call, no ledger line [C-088]', async () => {
    const { paths } = tempProject(FILES);
    const provider = stubProvider();
    const r = await runScan(REQUEST, { paths, provider, env, dryRun: true });
    expect(r.exit).toBe(0);
    expect(r.text).toBe('plan:\n  calls: 1\n  questions: 2\n  items: 4\n  reused: 2\nnotes: ["dry run: no call, no spend"]\n');
    expect(provider.calls).toHaveLength(0);
    expect(readLedger(paths)).toEqual([]);
  });

  it('an invalid request exits 2 before any ledger read', async () => {
    const { paths } = tempProject(FILES);
    const provider = stubProvider();
    const r = await runScan('side:\n  goal: x\n', { paths, provider, env });
    expect(r.exit).toBe(2);
    expect(provider.calls).toHaveLength(0);
    expect(readLedger(paths)).toEqual([]);
  });

  it('wise: {recorded: [why, area]}', async () => {
    const { paths } = tempProject(FILES);
    const provider = stubProvider({ yes: () => 0.9 });
    const r = await runScan(REQUEST, { paths, provider, env });
    expect(r.text).toContain('wise: {recorded: [why, area]}');
  });

  it('a goal that misses the bar on an all-passing scan: next says so, not a passing item [C-071]', async () => {
    const { paths } = tempProject(FILES);
    // Every function passes injection (pass: no, low P(yes)); only the goal itself misses the 0.70 bar, so
    // worstFirst has nothing to point at — this used to throw on worst[0]!.id, then (fix round 1) wrongly
    // drilled into src/a.ts/bad even though it passed.
    const provider = stubProvider({ yes: (q) => (q.id === 'goal' ? 0.1 : 0.1) });
    const r = await runScan(REQUEST, { paths, provider, env });
    expect(r.exit).toBe(0);
    expect(r.text).toContain('gate: fail');
    expect(r.text).toContain('goal: {gate: fail, p: 0.10}');
    expect(r.text).toContain('passing: 2');
    expect(r.text).toContain('failing: {}');
    expect(r.text).toContain('next: the goal missed though every part passed · fix what is missing, then run it again');
  });

  it('a glob matching nothing and a missed goal: next says every item was skipped, not a crash [C-071]', async () => {
    const { paths } = tempProject(FILES); // FILES are on disk, but the pattern below matches none of them
    const NOTHING_MATCHES =
      'side:\n  goal: Handlers don\'t trust request input\n  depth: quick\n  over:\n    file: src/nope/*.ts\n    function: each\n  ask:\n    function:\n      injection:\n        pass: no\n        1: Does {function} put request text straight into a query?\nwise:\n  why: find\n  area: api\n';
    // Nothing to grade at all (zero files matched, so zero functions); the goal still rides its own call and misses.
    const provider = stubProvider({ yes: () => 0.1 });
    const r = await runScan(NOTHING_MATCHES, { paths, provider, env });
    expect(r.exit).toBe(0);
    expect(provider.calls).toHaveLength(1); // the goal alone
    expect(r.text).toContain('scanned: {file: 0, function: 0}');
    expect(r.text).toContain('gate: fail');
    expect(r.text).toContain('passing: 0');
    expect(r.text).toContain('reused: 0');
    expect(r.text).toContain('next: every item was skipped · raise depth or narrow over, then run it again');
  });
});
