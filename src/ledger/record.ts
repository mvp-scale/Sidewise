/**
 * Records a paid call: its spend in budget.json and its line in the ledger, in ONE lock section, so budget runs
 * == run records + failed records at all times. The budget is written first; if the ledger line then can't be
 * written, the budget is put back before the lock is released, so neither is written. Never nests withLock.
 */
import { budgetLine, restoreLocked, spendLocked, type BudgetState } from '../budget/budget.ts';
import { withLock } from './lock.ts';
import { appendContractRunLocked, appendFailedLocked, appendRunLocked, type ContractRun, type FailedRecord, type NewContractRun, type NewFailed, type NewRun, type RunRecord } from './log.ts';
import type { SidewisePaths } from './paths.ts';

export function recordCall(paths: SidewisePaths, costUsd: number, entry: { run: NewRun }, now?: number): { budget: BudgetState; record: RunRecord };
export function recordCall(paths: SidewisePaths, costUsd: number, entry: { contract: NewContractRun }, now?: number): { budget: BudgetState; record: ContractRun };
export function recordCall(paths: SidewisePaths, costUsd: number, entry: { failed: NewFailed }, now?: number): { budget: BudgetState; record: FailedRecord };
export function recordCall(
  paths: SidewisePaths,
  costUsd: number,
  entry: { run: NewRun } | { contract: NewContractRun } | { failed: NewFailed },
  now: number = Date.now(),
): { budget: BudgetState; record: RunRecord | ContractRun | FailedRecord } {
  return withLock(paths.lock, () => {
    const { before, after } = spendLocked(paths, costUsd, now);
    try {
      const record =
        'run' in entry
          ? appendRunLocked(paths, entry.run, now)
          : 'contract' in entry
            ? appendContractRunLocked(paths, entry.contract, now, budgetLine(after))
            : appendFailedLocked(paths, entry.failed, now);
      return { budget: after, record };
    } catch (e) {
      try {
        restoreLocked(paths, before);
      } catch {
        /* the original failure is the one to report */
      }
      throw e;
    }
  });
}
