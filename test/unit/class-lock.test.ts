// A lock held by another live run at the two post-call writes: spend first, then the ledger. Each path must
// exit 1 with one clean "✖ lock:" line and say whether the call was counted against the budget.
import { mkdirSync, writeFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
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

// appendRun takes the lock after recordSpend releases it; grab it in between to hit the ledger path.
const hold = vi.hoisted(() => ({ ledger: false }));
vi.mock('../../src/ledger/log.ts', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../src/ledger/log.ts')>();
  return {
    ...real,
    appendRun: (paths: SidewisePaths, ...rest: [never, number?]) => {
      if (hold.ledger) holdLock(paths);
      return real.appendRun(paths, ...rest);
    },
  };
});

describe('class under a held lock', () => {
  it('lock held when counting the spend: exit 1, not counted, nothing logged', async () => {
    const { paths } = tempProject();
    const stub = stubProvider();
    const provider: ClassifierPort = { ...stub, ask: async (q, s) => { const r = await stub.ask(q, s); holdLock(paths); return r; } };
    const r = await runClass(classRequest(), { paths, provider, env: {} });
    expect(r).toEqual({ exit: 1, text: '✖ lock: .sidewise/lock is locked → wait for the other run, or delete the lock file if no run is active (the call was NOT counted against the budget)' });
    expect(loadBudget(paths).state.runs).toBe(0);
    expect(readLedger(paths)).toEqual([]);
  }, 15_000);

  it('lock held when logging the run: exit 1, counted, nothing logged', async () => {
    const { paths } = tempProject();
    hold.ledger = true;
    try {
      const r = await runClass(classRequest(), { paths, provider: stubProvider(), env: {} });
      expect(r).toEqual({ exit: 1, text: '✖ lock: .sidewise/lock is locked → wait for the other run, or delete the lock file if no run is active (the call was counted against the budget)' });
    } finally {
      hold.ledger = false;
    }
    expect(loadBudget(paths).state.runs).toBe(1);
    expect(readLedger(paths)).toEqual([]);
  }, 15_000);
});
