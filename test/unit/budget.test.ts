import { writeFileSync, mkdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { budgetLine, checkBudget, loadBudget, peekBudget, recordSpend, resetBudget, setBudget } from '../../src/budget/budget.ts';
import { resolveConfig } from '../../src/config/load.ts';
import { writeConfigOverride } from '../../src/config/write.ts';
import { tempProject } from '../helpers/project.ts';

const T = Date.parse('2026-09-25T00:00:00Z');

describe('budget', () => {
  it('runs on the $5 / 500-run defaults with no config.yaml at all, nothing created', () => {
    const { paths } = tempProject({});
    const { state, created } = loadBudget(paths, T);
    expect(created).toBe(false);
    expect(state).toEqual({ capUsd: 5, capRuns: 500, spentUsd: 0, runs: 0, resetAt: '1970-01-01T00:00:00Z' });
    expect(loadBudget(paths, T).created).toBe(false);
  });

  it('spend and run count are ledger-derived: every recorded call counts, no separate counter to drift [plan 2c B1]', () => {
    const { paths } = tempProject({});
    setBudget(paths, { capRuns: 2 }, T);
    recordSpend(paths, 0, T + 1000);
    recordSpend(paths, 0, T + 2000);
    const gate = checkBudget(loadBudget(paths, T + 3000).state);
    // fix #5c: the run cap alone tripped (the $ cap has room), so raising it fits better than resetting spend.
    expect(gate).toEqual({
      ok: false,
      message: '✖ budget: cap reached ($0.00 of $5.00 · 2 of 2 runs) → the owner runs "mm3 budget set --runs <n>"\n→ see: mm3 agent budget',
    });
  });

  it('blocks on spend, hints "reset", and reset starts a fresh window with the same caps [C-133]', () => {
    const { paths } = tempProject({});
    setBudget(paths, { capUsd: 1 }, T);
    recordSpend(paths, 1.2, T + 1000);
    expect(checkBudget(loadBudget(paths, T + 2000).state)).toEqual({
      ok: false,
      message: '✖ budget: cap reached ($1.20 of $1.00 · 1 of 500 runs) → the owner runs "mm3 budget reset"\n→ see: mm3 agent budget',
    });
    // reset moves `since` well past the spend above — the ledger line itself is untouched (never erased), only
    // excluded from the window going forward.
    const fresh = resetBudget(paths, T + 60_000);
    expect(fresh).toMatchObject({ capUsd: 1, capRuns: 500, spentUsd: 0, runs: 0 });
    expect(checkBudget(fresh).ok).toBe(true);
    // the old spend is still there, unharmed — a wider `per: total` window before `since` would still see it.
    expect(resolveConfig(paths).config.budget.since).toBe('2026-09-25T00:01:00Z');
  });

  it('both caps reached: still hints "reset", not "set --runs" [C-133]', () => {
    const { paths } = tempProject({});
    setBudget(paths, { capUsd: 1, capRuns: 1 }, T);
    recordSpend(paths, 1.2, T + 1000);
    expect(checkBudget(loadBudget(paths, T + 2000).state)).toEqual({
      ok: false,
      message: '✖ budget: cap reached ($1.20 of $1.00 · 1 of 1 runs) → the owner runs "mm3 budget reset"\n→ see: mm3 agent budget',
    });
  });

  it('migrates a legacy budget.json into config.yaml once, then never trusts it again [plan 2c B1]', () => {
    const { paths } = tempProject({});
    mkdirSync(paths.dir, { recursive: true });
    writeFileSync(paths.budget, JSON.stringify({ capUsd: 2, capRuns: 20, spentUsd: 999, runs: 999, resetAt: '2020-01-01T00:00:00Z' }));
    const first = loadBudget(paths, T);
    expect(first.created).toBe(true);
    // caps and `since` came from the legacy file; spent/runs come from the (empty) ledger, never the stale counters.
    expect(first.state).toEqual({ capUsd: 2, capRuns: 20, spentUsd: 0, runs: 0, resetAt: '2020-01-01T00:00:00Z' });
    expect(resolveConfig(paths).config.budget).toMatchObject({ usd: 2, runs: 20, since: '2020-01-01T00:00:00Z' });
    // second call: config.yaml already has budget.since — no re-migration, never touches budget.json again.
    writeFileSync(paths.budget, '{ now corrupt, never read again');
    expect(loadBudget(paths, T + 1000).created).toBe(false);
    expect(loadBudget(paths, T + 1000).state.capUsd).toBe(2);
  });

  it('a corrupt legacy budget.json blocks nothing: config.yaml (defaults) wins instead', () => {
    const { paths } = tempProject({});
    mkdirSync(paths.dir, { recursive: true });
    writeFileSync(paths.budget, '{ nope');
    const { state, created } = loadBudget(paths, T);
    expect(created).toBe(false);
    expect(state).toMatchObject({ capUsd: 5, capRuns: 500, spentUsd: 0, runs: 0 });
    expect(peekBudget(paths, T)).toMatchObject({ capUsd: 5, capRuns: 500 });
  });

  it('refuses caps that are not positive numbers', () => {
    const { paths } = tempProject({});
    expect(() => setBudget(paths, { capUsd: -1 }, T)).toThrow(/positive/);
    expect(() => setBudget(paths, { capRuns: Number.NaN }, T)).toThrow(/positive/);
  });

  it('per: day/hour additionally floors the window to the start of the current UTC day/hour', () => {
    const { paths } = tempProject({});
    setBudget(paths, { capUsd: 5 }, T);
    // `setBudget` only ever touches usd/runs; `per` is a hand override the same way a project would actually
    // set it (writeConfigOverride merges, so usd stays 5).
    writeConfigOverride(paths, { budget: { per: 'day' } });
    expect(resolveConfig(paths).config.budget.per).toBe('day');
    const dayStart = Date.UTC(2026, 8, 25); // 2026-09-25T00:00:00Z
    recordSpend(paths, 1, dayStart - 1000); // just before today: excluded from a `per: day` window
    recordSpend(paths, 2, dayStart + 1000); // today: included
    const state = loadBudget(paths, dayStart + 5000).state;
    expect(state).toMatchObject({ spentUsd: 2, runs: 1 });
  });

  // [C-229] The line states headroom (what is left), and warns only at >= 80% used, naming the cap that is low.
  it('[C-229] the budget line states what is left, and warns only from 80% used', () => {
    const base = { capUsd: 5, capRuns: 100, spentUsd: 0, resetAt: 'x' };
    expect(budgetLine({ ...base, runs: 12 })).toBe('budget: $5.00 left of $5.00 · 88 of 100 runs left');
    expect(budgetLine({ ...base, runs: 76 })).toBe('budget: $5.00 left of $5.00 · 24 of 100 runs left');
    expect(budgetLine({ capUsd: 0.12, capRuns: 30, spentUsd: 0.01, runs: 3, resetAt: 'x' })).toBe('budget: $0.11 left of $0.12 · 27 of 30 runs left');
    expect(budgetLine({ ...base, runs: 80 })).toBe('⚠ budget: $5.00 left of $5.00 · 20 of 100 runs left → low: ask the owner to run mm3 budget set --runs <n>');
    expect(budgetLine({ ...base, spentUsd: 4.5, runs: 10 })).toBe('⚠ budget: $0.50 left of $5.00 · 90 of 100 runs left → low: ask the owner to run mm3 budget set --usd <n>');
    expect(budgetLine({ ...base, spentUsd: 5, runs: 100 })).toBe('⚠ budget: $0.00 left of $5.00 · 0 of 100 runs left → low: ask the owner to run mm3 budget set --usd <n> --runs <n>');
  });
});
