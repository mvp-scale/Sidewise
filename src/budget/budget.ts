/**
 * The budget: one hard spend cap and one run cap in .sidewise/budget.json. It NEVER resets on its own; only
 * `sidewise budget reset` (the owner) starts a fresh budget, so there are no surprise bills. The run cap
 * always applies, including when a provider does not report cost. A corrupt file refuses to run (fail closed).
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { onStore, withLock } from '../ledger/lock.ts';
import type { SidewisePaths } from '../ledger/paths.ts';

export interface BudgetState {
  capUsd: number;
  capRuns: number;
  spentUsd: number;
  runs: number;
  resetAt: string;
}

export const DEFAULT_BUDGET = { capUsd: 5, capRuns: 500 } as const;

export class BudgetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BudgetError';
  }
}

type Caps = { capUsd: number; capRuns: number };

const iso = (now: number): string => new Date(now).toISOString().replace(/\.\d{3}Z$/, 'Z');
const money = (n: number): string => `$${n.toFixed(2)}`;
const fresh = (now: number, caps: Caps = DEFAULT_BUDGET): BudgetState => ({ capUsd: caps.capUsd, capRuns: caps.capRuns, spentUsd: 0, runs: 0, resetAt: iso(now) });
const corrupt = (code?: string): BudgetError =>
  new BudgetError(`✖ budget: .sidewise/budget.json is unreadable${code ? ` (${code})` : ''} → the owner runs "sidewise budget reset" to start a fresh budget`);

function isState(v: unknown): v is BudgetState {
  if (!v || typeof v !== 'object') return false;
  const s = v as Record<string, unknown>;
  const numeric = ['capUsd', 'capRuns', 'spentUsd', 'runs'].every((k) => typeof s[k] === 'number' && Number.isFinite(s[k]) && (s[k] as number) >= 0);
  return numeric && typeof s.resetAt === 'string';
}

function read(paths: SidewisePaths): BudgetState | undefined {
  if (!existsSync(paths.budget)) return undefined;
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(paths.budget, 'utf8'));
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    throw corrupt(typeof code === 'string' ? code : undefined); // unreadable for any reason: fail closed
  }
  if (!isState(value)) throw corrupt();
  return value;
}

/** Always under the lock: write a temp file, then rename it over budget.json, so a reader never sees half a file. */
function write(paths: SidewisePaths, state: BudgetState): void {
  const tmp = `${paths.budget}.tmp`;
  onStore(paths.budget, 'write', () => {
    mkdirSync(paths.dir, { recursive: true });
    writeFileSync(tmp, `${JSON.stringify(state, null, 2)}\n`);
    renameSync(tmp, paths.budget);
  });
}

export function loadBudget(paths: SidewisePaths, now: number = Date.now()): { state: BudgetState; created: boolean } {
  const existing = read(paths);
  if (existing) return { state: existing, created: false };
  // Create under the lock, and only if still missing: two first runs at once must not reset each other's count.
  return withLock(paths.lock, () => {
    const again = read(paths);
    if (again) return { state: again, created: false };
    const state = fresh(now);
    write(paths, state);
    return { state, created: true };
  });
}

export function usedFraction(s: BudgetState): number {
  return Math.max(s.capUsd > 0 ? s.spentUsd / s.capUsd : 1, s.capRuns > 0 ? s.runs / s.capRuns : 1);
}

export function checkBudget(s: BudgetState): { ok: true } | { ok: false; message: string } {
  if (s.runs >= s.capRuns || s.spentUsd >= s.capUsd) {
    return { ok: false, message: `✖ budget: cap reached (${money(s.spentUsd)} of ${money(s.capUsd)} · ${s.runs} of ${s.capRuns} runs) → the owner runs "sidewise budget reset"` };
  }
  return { ok: true };
}

export function recordSpend(paths: SidewisePaths, costUsd: number, now: number = Date.now()): BudgetState {
  return withLock(paths.lock, () => {
    const s = read(paths) ?? fresh(now);
    const next = { ...s, spentUsd: s.spentUsd + (Number.isFinite(costUsd) ? Math.max(0, costUsd) : 0), runs: s.runs + 1 };
    write(paths, next);
    return next;
  });
}

export function resetBudget(paths: SidewisePaths, now: number = Date.now()): BudgetState {
  return withLock(paths.lock, () => {
    let caps: Caps = DEFAULT_BUDGET;
    try {
      caps = read(paths) ?? DEFAULT_BUDGET;
    } catch {
      /* corrupt: start again from the defaults */
    }
    const next = fresh(now, caps);
    write(paths, next);
    return next;
  });
}

export function setBudget(paths: SidewisePaths, caps: { capUsd?: number; capRuns?: number }, now: number = Date.now()): BudgetState {
  for (const [name, v] of Object.entries(caps)) {
    if (v !== undefined && !(Number.isFinite(v) && v > 0)) throw new BudgetError(`✖ budget: ${name} must be a positive number, got ${v} → e.g. --usd 5 --runs 500`);
  }
  return withLock(paths.lock, () => {
    const s = read(paths) ?? fresh(now);
    const next = { ...s, ...(caps.capUsd !== undefined ? { capUsd: caps.capUsd } : {}), ...(caps.capRuns !== undefined ? { capRuns: caps.capRuns } : {}) };
    write(paths, next);
    return next;
  });
}

export function budgetLine(s: BudgetState): string {
  const pct = Math.round(usedFraction(s) * 100);
  return `${pct >= 50 ? '⚠ ' : ''}budget ${pct}% used (${money(s.spentUsd)} of ${money(s.capUsd)} · ${s.runs} of ${s.capRuns} runs)`;
}
