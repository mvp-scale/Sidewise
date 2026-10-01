/**
 * Records a paid call: its line in the ledger, and the budget state it leaves behind, in ONE lock section, so
 * budget.runs == run records + failed records at all times. Spend is no longer a separate counter to keep in
 * sync (the budget is derived from the ledger itself) — there is nothing to roll back if the append
 * fails, since nothing was "spent" anywhere else. Never nests withLock (budgetStateNow's own index read is
 * reentrancy-safe against a lock this same process already holds — see its own comment).
 */
import { budgetLine, budgetStateNow, type BudgetState } from '../budget/budget.ts';
import { withLock } from './lock.ts';
import { appendContractRunLocked, appendFailedLocked, appendRunLocked, type ContractRun, type FailedRecord, type NewContractRun, type NewFailed, type NewRun, type RunRecord } from './log.ts';
import type { Mm3Paths } from './paths.ts';

export function recordCall(paths: Mm3Paths, costUsd: number, entry: { run: NewRun }, now?: number): { budget: BudgetState; record: RunRecord };
export function recordCall(paths: Mm3Paths, costUsd: number, entry: { contract: NewContractRun }, now?: number): { budget: BudgetState; record: ContractRun };
export function recordCall(paths: Mm3Paths, costUsd: number, entry: { failed: NewFailed }, now?: number): { budget: BudgetState; record: FailedRecord };
export function recordCall(
  paths: Mm3Paths,
  costUsd: number,
  entry: { run: NewRun } | { contract: NewContractRun } | { failed: NewFailed },
  now: number = Date.now(),
): { budget: BudgetState; record: RunRecord | ContractRun | FailedRecord } {
  return withLock(paths.lock, () => {
    // The state THIS call's own spend will leave behind — an arithmetic bump on top of the ledger-derived
    // "before" (not a re-query after appending): the embedded budget line on a ContractRun must already reflect
    // its own cost, before the record holding that line has been written at all.
    const before = budgetStateNow(paths, now);
    const spend = Number.isFinite(costUsd) ? Math.max(0, costUsd) : 0;
    const after: BudgetState = { ...before, spentUsd: before.spentUsd + spend, runs: before.runs + 1 };
    const record =
      'run' in entry
        ? appendRunLocked(paths, entry.run, now)
        : 'contract' in entry
          ? appendContractRunLocked(paths, entry.contract, now, budgetLine(after))
          : appendFailedLocked(paths, entry.failed, now);
    return { budget: after, record };
  });
}
