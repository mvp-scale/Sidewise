/**
 * The budget (plan 2c B1): caps (`usd`, `runs`, `per`, `since`) live in `.sidewise/config.yaml`'s `budget:` key;
 * spent/runs are derived from the ledger itself — every RunRecord/ContractRun/FailedRecord already carries its
 * own `costUsd`, summed via an index rollup (ledger/index.ts's `budgetRollup`) — so there is no separate counter
 * to ever drift out of sync with what was actually recorded. `per: total` (the default) counts everything since
 * `since` (unset = the whole ledger, from the start); `per: day`/`hour` additionally floors the window to the
 * start of the current UTC day/hour, whichever is later. The run cap always applies, including when a provider
 * does not report cost.
 *
 * `.sidewise/budget.json` (the pre-2c running-counter file) is read at most once, purely to migrate its caps
 * into config.yaml the first time nothing there says otherwise (`budget.since` unset in config); after that it
 * is never consulted again, and never trusted if corrupt — config.yaml is the sole authority once it exists.
 */
import { existsSync, readFileSync } from 'node:fs';
import type { SidewiseConfig } from '../config/defaults.ts';
import { resolveConfig } from '../config/load.ts';
import { writeConfigOverride } from '../config/write.ts';
import { budgetRollup } from '../ledger/index.ts';
import { onStore, withLock } from '../ledger/lock.ts';
import { appendFailedLocked, type NewFailed } from '../ledger/log.ts';
import type { SidewisePaths } from '../ledger/paths.ts';

export interface BudgetState {
  capUsd: number;
  capRuns: number;
  spentUsd: number;
  runs: number;
  resetAt: string;
}

export class BudgetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BudgetError';
  }
}

const iso = (now: number): string => new Date(now).toISOString().replace(/\.\d{3}Z$/, 'Z');
const money = (n: number): string => `$${n.toFixed(2)}`;
const EPOCH = iso(0);
// Every stop below carries its own fix already; the trailing line just points at the deeper card, the same
// pointer every other stop in the codebase ends with (`sidewise agent <verb|tool>`, C-153) — `budget` isn't a
// `Verb`, so this can't reuse `verbs/request.ts`'s `stopText` without `budget/` importing from `verbs/`, a
// layering inversion the rest of the codebase avoids; the literal suffix is the smaller fix.
const AGENT_POINTER = '\n→ see: sidewise agent budget';

/** The pre-2c `.sidewise/budget.json` shape, read at most once for migration — never thrown on, never trusted
 *  for spend after that: any problem (missing, corrupt, wrong shape) simply reads as "nothing to migrate,"
 *  since config.yaml is the real authority now and a stale legacy file must never block a real run. */
function readLegacyBudgetJson(paths: SidewisePaths): { capUsd: number; capRuns: number; resetAt: string } | undefined {
  if (!existsSync(paths.budget)) return undefined;
  try {
    const v = JSON.parse(readFileSync(paths.budget, 'utf8')) as Record<string, unknown>;
    const capUsd = v.capUsd;
    const capRuns = v.capRuns;
    const resetAt = v.resetAt;
    if (typeof capUsd === 'number' && Number.isFinite(capUsd) && typeof capRuns === 'number' && Number.isFinite(capRuns) && typeof resetAt === 'string') {
      return { capUsd, capRuns, resetAt };
    }
  } catch {
    /* corrupt or unreadable: nothing to migrate */
  }
  return undefined;
}

/** `per: total`'s window start is `since` (or the beginning of the ledger, unset); `day`/`hour` additionally
 *  floor it to the start of the current UTC day/hour, whichever is LATER than `since` — so a mid-window reset
 *  still narrows the window further, never widens it back out. */
function windowStartMs(budget: SidewiseConfig['budget'], now: number): number {
  const sinceMs = budget.since ? Date.parse(budget.since) : 0;
  const floor = Number.isNaN(sinceMs) ? 0 : sinceMs;
  if (budget.per === 'total') return floor;
  const d = new Date(now);
  const periodStartMs =
    budget.per === 'day' ? Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) : Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours());
  return Math.max(floor, periodStartMs);
}

function stateFromConfig(paths: SidewisePaths, config: SidewiseConfig, now: number, opts: { readOnly?: boolean } = {}): BudgetState {
  const sinceMs = windowStartMs(config.budget, now);
  // Wrapped in onStore, same as every other ledger read (ledger/reuse.ts's lookupAnswers/exactReuse) — a raw fs
  // error (log.jsonl replaced by a directory, permissions) must surface as the usual clean StoreError, never an
  // unwrapped errno escaping just because this read happens to go through budgetRollup instead of readLedger.
  const { spentUsd, runs } = onStore(paths.log, 'read', () => budgetRollup(paths, iso(sinceMs), opts));
  return { capUsd: config.budget.usd, capRuns: config.budget.runs, spentUsd, runs, resetAt: config.budget.since ?? EPOCH };
}

/** Ledger-derived state with no side effects at all (no migration attempt, no locking of its own) — safe to
 *  call from inside an already-held `paths.lock` (ledger/record.ts's `recordCall`), unlike `loadBudget`, whose
 *  migration path takes the lock itself. */
export function budgetStateNow(paths: SidewisePaths, now: number = Date.now(), env: Record<string, string | undefined> = process.env): BudgetState {
  const { config } = resolveConfig(paths, env);
  return stateFromConfig(paths, config, now);
}

/** A read-only peek at the current budget, for a dry run: never migrates, never writes, never throws. Any
 *  problem reads as `undefined` rather than reported — a dry run only wants to warn when it can positively tell
 *  the cap is already reached; a real run still gets `loadBudget`'s own migration and error handling. */
export function peekBudget(paths: SidewisePaths, now: number = Date.now(), env: Record<string, string | undefined> = process.env): BudgetState | undefined {
  try {
    const { config } = resolveConfig(paths, env);
    return stateFromConfig(paths, config, now, { readOnly: true });
  } catch {
    return undefined;
  }
}

/** Migrates a legacy `.sidewise/budget.json`'s caps into config.yaml, once — only when config.yaml doesn't
 *  already say something about `budget.since` (the marker that this project's budget has already been touched
 *  under the new scheme, whether by a real `budget reset` or by this very migration). A no-op every subsequent
 *  call. Returns true only when it actually wrote, so `loadBudget` can report it as `created` — the same
 *  one-time-notice spirit as the old "budget file created with defaults." */
function migrateLegacyIfNeeded(paths: SidewisePaths, env: Record<string, string | undefined>): boolean {
  if (resolveConfig(paths, env).sources['budget.since'] === 'config') return false;
  return withLock(paths.lock, () => {
    if (resolveConfig(paths, env).sources['budget.since'] === 'config') return false;
    const legacy = readLegacyBudgetJson(paths);
    if (!legacy) return false;
    writeConfigOverride(paths, { budget: { usd: legacy.capUsd, runs: legacy.capRuns, per: 'total', since: legacy.resetAt } });
    return true;
  });
}

export function loadBudget(paths: SidewisePaths, now: number = Date.now(), env: Record<string, string | undefined> = process.env): { state: BudgetState; created: boolean } {
  const created = migrateLegacyIfNeeded(paths, env);
  return { state: budgetStateNow(paths, now, env), created };
}

export function usedFraction(s: BudgetState): number {
  return Math.max(s.capUsd > 0 ? s.spentUsd / s.capUsd : 1, s.capRuns > 0 ? s.runs / s.capRuns : 1);
}

/** When only the RUN cap tripped (the dollar cap has room left), raising it fits better than resetting
 *  the spend already counted — "reset" stays the hint whenever the dollar cap is involved (alone, or with runs). */
export function checkBudget(s: BudgetState): { ok: true } | { ok: false; message: string } {
  const runsCapped = s.runs >= s.capRuns;
  const usdCapped = s.spentUsd >= s.capUsd;
  if (runsCapped || usdCapped) {
    const hint = runsCapped && !usdCapped ? 'the owner runs "sidewise budget set --runs <n>"' : 'the owner runs "sidewise budget reset"';
    return { ok: false, message: `✖ budget: cap reached (${money(s.spentUsd)} of ${money(s.capUsd)} · ${s.runs} of ${s.capRuns} runs) → ${hint}${AGENT_POINTER}` };
  }
  return { ok: true };
}

/** Test/fixture convenience (no real caller in src/ outside this module): simulates one more spent call by
 *  appending a minimal FailedRecord with the given cost, so budget-invariant tests (and the concurrency-stress
 *  e2e fixture) can "reach the cap" without a real classifier call. Counts toward `runs`/`spentUsd` exactly like
 *  any other ledger entry — there is no separate counter left to bump directly. */
export function recordSpend(paths: SidewisePaths, costUsd: number, now: number = Date.now()): BudgetState {
  const failed: NewFailed = {
    verb: 'class',
    actor: 'test',
    adapter: 'test',
    model: 'test',
    costUsd: Number.isFinite(costUsd) ? Math.max(0, costUsd) : 0,
    reason: 'recordSpend (test helper)',
  };
  withLock(paths.lock, () => appendFailedLocked(paths, failed, now));
  return budgetStateNow(paths, now);
}

/** Moves `since` to now — the window narrows from here on; nothing already in the ledger is touched or erased.
 *  Under the same lock every other budget/ledger mutation uses, so a concurrent writer (or a stale held lock)
 *  is detected the same way it always was, even though there's no longer a running counter to serialize. */
export function resetBudget(paths: SidewisePaths, now: number = Date.now(), env: Record<string, string | undefined> = process.env): BudgetState {
  return withLock(paths.lock, () => {
    writeConfigOverride(paths, { budget: { since: iso(now) } });
    return budgetStateNow(paths, now, env);
  });
}

export function setBudget(paths: SidewisePaths, caps: { capUsd?: number; capRuns?: number }, now: number = Date.now(), env: Record<string, string | undefined> = process.env): BudgetState {
  for (const [name, v] of Object.entries(caps)) {
    if (v !== undefined && !(Number.isFinite(v) && v > 0)) throw new BudgetError(`✖ budget: ${name} must be a positive number, got ${v} → e.g. --usd 5 --runs 500${AGENT_POINTER}`);
  }
  return withLock(paths.lock, () => {
    writeConfigOverride(paths, {
      budget: {
        ...(caps.capUsd !== undefined ? { usd: caps.capUsd } : {}),
        ...(caps.capRuns !== undefined ? { runs: caps.capRuns } : {}),
      },
    });
    return budgetStateNow(paths, now, env);
  });
}

export function budgetLine(s: BudgetState): string {
  const pct = Math.round(usedFraction(s) * 100);
  return `${pct >= 50 ? '⚠ ' : ''}budget ${pct}% used (${money(s.spentUsd)} of ${money(s.capUsd)} · ${s.runs} of ${s.capRuns} runs)`;
}
