// scan: a code sweep with per-function reuse. Review Focus #2: a second scan of unchanged code is free.
import { describe, expect, it } from 'vitest';
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
  it('the contract shape: scanned, failing worst first, passing/reused as counts', async () => {
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

  it('a second scan of unchanged code is free', async () => {
    const { paths } = tempProject(FILES);
    const provider = stubProvider({ yes: (q) => (q.id.endsWith('bad#1') ? 0.9 : 0.1) });
    await runScan(REQUEST, { paths, provider, env });
    const r2 = await runScan(REQUEST, { paths, provider, env });
    expect(provider.calls).toHaveLength(1); // still just the one call from the first run
    expect(r2.text).toContain('reused: 2');
    const runs = readLedger(paths).filter(isContractRun);
    expect(runs[1]).toMatchObject({ id: 'SW-0002', verb: 'scan', calls: 0 });
  });

  it('--dry-run: no provider call, no ledger line', async () => {
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
});
