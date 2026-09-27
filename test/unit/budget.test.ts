import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { budgetLine, checkBudget, loadBudget, recordSpend, resetBudget, setBudget } from '../../src/budget/budget.ts';
import { tempProject } from '../helpers/project.ts';

describe('budget', () => {
  it('creates the default $5 / 500-run budget on first use and says so', () => {
    const { paths } = tempProject({});
    const { state, created } = loadBudget(paths, Date.parse('2026-09-25T00:00:00Z'));
    expect(created).toBe(true);
    expect(state).toEqual({ capUsd: 5, capRuns: 500, spentUsd: 0, runs: 0, resetAt: '2026-09-25T00:00:00Z' });
    expect(loadBudget(paths).created).toBe(false);
  });

  it('never resets on its own: the run cap blocks even when cost is never reported, hinting "set --runs" [C-133]', () => {
    const { paths } = tempProject({});
    setBudget(paths, { capRuns: 2 });
    recordSpend(paths, 0);
    recordSpend(paths, 0);
    const gate = checkBudget(loadBudget(paths, Date.parse('2027-01-01T00:00:00Z')).state);
    // fix #5c: the run cap alone tripped (the $ cap has room), so raising it fits better than resetting spend.
    expect(gate).toEqual({ ok: false, message: '✖ budget: cap reached ($0.00 of $5.00 · 2 of 2 runs) → the owner runs "sidewise budget set --runs <n>"' });
  });

  it('blocks on spend, hints "reset", and reset starts a fresh budget with the same caps [C-133]', () => {
    const { paths } = tempProject({});
    setBudget(paths, { capUsd: 1 });
    recordSpend(paths, 1.2);
    expect(checkBudget(loadBudget(paths).state)).toEqual({ ok: false, message: '✖ budget: cap reached ($1.20 of $1.00 · 1 of 500 runs) → the owner runs "sidewise budget reset"' });
    const fresh = resetBudget(paths);
    expect(fresh).toMatchObject({ capUsd: 1, capRuns: 500, spentUsd: 0, runs: 0 });
    expect(checkBudget(fresh).ok).toBe(true);
  });

  it('both caps reached: still hints "reset", not "set --runs" [C-133]', () => {
    const { paths } = tempProject({});
    setBudget(paths, { capUsd: 1, capRuns: 1 });
    recordSpend(paths, 1.2);
    expect(checkBudget(loadBudget(paths).state)).toEqual({ ok: false, message: '✖ budget: cap reached ($1.20 of $1.00 · 1 of 1 runs) → the owner runs "sidewise budget reset"' });
  });

  it('refuses a corrupt budget file, and reset recovers it', () => {
    const { paths } = tempProject({});
    mkdirSync(paths.dir, { recursive: true });
    writeFileSync(paths.budget, '{ nope');
    expect(() => loadBudget(paths)).toThrow(/budget\.json is unreadable → the owner runs "sidewise budget reset"/);
    expect(resetBudget(paths)).toMatchObject({ capUsd: 5, capRuns: 500 });
    expect(JSON.parse(readFileSync(paths.budget, 'utf8'))).toMatchObject({ runs: 0 });
  });

  it('refuses caps that are not positive numbers', () => {
    const { paths } = tempProject({});
    expect(() => setBudget(paths, { capUsd: -1 })).toThrow(/positive/);
    expect(() => setBudget(paths, { capRuns: Number.NaN })).toThrow(/positive/);
  });

  it('the budget line warns from 50% on', () => {
    const base = { capUsd: 5, capRuns: 100, spentUsd: 0, resetAt: 'x' };
    expect(budgetLine({ ...base, runs: 12 })).toBe('budget 12% used ($0.00 of $5.00 · 12 of 100 runs)');
    expect(budgetLine({ ...base, runs: 76 })).toBe('⚠ budget 76% used ($0.00 of $5.00 · 76 of 100 runs)');
  });
});
