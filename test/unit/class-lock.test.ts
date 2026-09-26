// A lock held by another live run when the paid call's spend and run are recorded (one lock section): exit 1
// with one clean "✖ lock:" line, and neither the budget nor the ledger is written, so they still agree.
import { mkdirSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadBudget } from '../../src/budget/budget.ts';
import type { ClassifierPort } from '../../src/classifier/port.ts';
import type { SidewisePaths } from '../../src/ledger/paths.ts';
import { readLedger } from '../../src/ledger/log.ts';
import { runClass } from '../../src/verbs/class.ts';
import { tempProject } from '../helpers/project.ts';
import { classRequest } from '../helpers/requests.ts';
import { stubProvider } from '../helpers/stub-provider.ts';

const holdLock = (paths: SidewisePaths): void => {
  mkdirSync(paths.dir, { recursive: true });
  writeFileSync(paths.lock, `${process.pid}\n`); // this test process: alive, so never stale
};

describe('class under a held lock', () => {
  it('lock held when recording the call: exit 1, not counted, nothing logged', async () => {
    const { paths } = tempProject();
    const stub = stubProvider();
    const provider: ClassifierPort = { ...stub, ask: async (q, s) => { const r = await stub.ask(q, s); holdLock(paths); return r; } };
    const r = await runClass(classRequest(), { paths, provider, env: {} });
    expect(r).toEqual({ exit: 1, text: '✖ lock: .sidewise/lock is locked → wait for the other run, or delete the lock file if no run is active (the call was NOT counted against the budget)' });
    expect(loadBudget(paths).state.runs).toBe(0);
    expect(readLedger(paths)).toEqual([]);
  }, 15_000);
});
