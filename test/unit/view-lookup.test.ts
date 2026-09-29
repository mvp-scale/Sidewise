// view's free `kind: 'lookup'` ledger record (plan 2b): CONTRACT already claimed "the lookup is logged" —
// this makes it true. A lookup is never a run: no MM3-#### id, never counted toward the budget, and never
// counted as a run by readLedger/index.ts's own run-counting (isRun/isContractRun).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createFakeAdapter } from '../../src/classifier/fake.ts';
import { isContractRun, isRun, readLedger, type LedgerRecord, type LookupRecord } from '../../src/ledger/log.ts';
import { runClass } from '../../src/verbs/class.ts';
import { runView } from '../../src/verbs/view.ts';
import { tempProject } from '../helpers/project.ts';

const isLookup = (r: LedgerRecord): r is LookupRecord => r.kind === 'lookup';
const CLASS_TEXT = readFileSync('test/fixtures/requests/valid/class.yaml', 'utf8');

describe('view: free lookup records', () => {
  it('a hit (the exact question set was asked before) logs goal/where/hit/reused, and assigns no run id', async () => {
    const { paths } = tempProject();
    const classResult = await runClass(CLASS_TEXT, { paths, provider: createFakeAdapter(), env: {} }); // MM3-0001
    expect(classResult.exit).toBe(0);
    const before = readLedger(paths);
    const runsBefore = before.filter((r) => isRun(r) || isContractRun(r)).length;

    const r = runView(CLASS_TEXT, 1, { paths, env: {} });
    expect(r.text).toContain('reuse: MM3-0001');

    const records = readLedger(paths);
    expect(records.filter((r2) => isRun(r2) || isContractRun(r2))).toHaveLength(runsBefore); // no new run

    const lookups = records.filter(isLookup);
    expect(lookups).toHaveLength(1);
    expect(lookups[0]).toMatchObject({ kind: 'lookup', goal: 'This login handler is safe to merge', where: ['src/user.ts:1-3'], hit: true, reused: 'MM3-0001' });
    expect(lookups[0]!.id).not.toMatch(/^SW-/); // never a run number
  });

  it('a miss (no matching prior run) logs hit: false, reused: null, and explains the miss as "never asked" [N2]', () => {
    const { paths } = tempProject();
    const r = runView(CLASS_TEXT, 1, { paths, env: {} });
    expect(r.text).toContain('reuse: never asked'); // plan 2c B3 N2: no prior run touched this place at all
    const lookups = readLedger(paths).filter(isLookup);
    expect(lookups).toHaveLength(1);
    expect(lookups[0]).toMatchObject({ hit: false, reused: null });
  });

  // Plan 2c B4: a bare place ('.', a folder or a tag) or a real run id is logged too, free, same as a request
  // draft's own cache check above — there's no exact-answer reuse concept for a plain browse, so hit/reused are
  // always false/null; `goal` carries the place or id string itself, so the record still says what was searched.
  it('a bare place lookup (not a request draft) logs one lookup per call, goal: the place itself', () => {
    const { paths } = tempProject();
    runView('.', 1, { paths, env: {} });
    runView('src', 1, { paths, env: {} });
    const lookups = readLedger(paths).filter(isLookup);
    expect(lookups).toHaveLength(2);
    expect(lookups[0]).toMatchObject({ goal: '.', where: ['.'], hit: false, reused: null });
    expect(lookups[1]).toMatchObject({ goal: 'src', where: ['src'], hit: false, reused: null });
    expect(lookups.every((l) => !l.id.match(/^SW-/))).toBe(true); // never a run number
  });

  it('a run-id lookup logs on a hit, never on a miss (not in the ledger)', async () => {
    const { paths } = tempProject();
    await runClass(CLASS_TEXT, { paths, provider: createFakeAdapter(), env: {} }); // MM3-0001
    runView('MM3-0001', 1, { paths, env: {} });
    runView('MM3-9999', 1, { paths, env: {} }); // not in the ledger: a stop, never logged
    const lookups = readLedger(paths).filter(isLookup);
    expect(lookups).toHaveLength(1);
    expect(lookups[0]).toMatchObject({ goal: 'MM3-0001', where: [], hit: false, reused: null });
  });

  it('a request draft with no ask: (where-only) logs nothing — it never reaches the categories check', () => {
    const { paths } = tempProject();
    runView('mak:\n  goal: what do we know here\n  where: [src/user.ts:1-3]\n', 1, { paths, env: {} });
    expect(readLedger(paths).filter(isLookup)).toHaveLength(0);
  });
});
