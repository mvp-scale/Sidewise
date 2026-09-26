import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { budgetLine, checkBudget, loadBudget, recordSpend, resetBudget, setBudget } from '../../src/budget/budget.ts';
import { pathsFor } from '../../src/ledger/paths.ts';
import { tempProject } from '../helpers/project.ts';

const WORKER = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'budget-worker.ts');

describe('budget', () => {
  it('creates the default $5 / 500-run budget on first use and says so', () => {
    const { paths } = tempProject({});
    const { state, created } = loadBudget(paths, Date.parse('2026-09-25T00:00:00Z'));
    expect(created).toBe(true);
    expect(state).toEqual({ capUsd: 5, capRuns: 500, spentUsd: 0, runs: 0, resetAt: '2026-09-25T00:00:00Z' });
    expect(loadBudget(paths).created).toBe(false);
  });

  it('never resets on its own: the run cap blocks even when cost is never reported', () => {
    const { paths } = tempProject({});
    setBudget(paths, { capRuns: 2 });
    recordSpend(paths, 0);
    recordSpend(paths, 0);
    const gate = checkBudget(loadBudget(paths, Date.parse('2027-01-01T00:00:00Z')).state);
    expect(gate).toEqual({ ok: false, message: '✖ budget: cap reached ($0.00 of $5.00 · 2 of 2 runs) → the owner runs "sidewise budget reset"' });
  });

  it('blocks on spend, and reset starts a fresh budget with the same caps', () => {
    const { paths } = tempProject({});
    setBudget(paths, { capUsd: 1 });
    recordSpend(paths, 1.2);
    expect(checkBudget(loadBudget(paths).state).ok).toBe(false);
    const fresh = resetBudget(paths);
    expect(fresh).toMatchObject({ capUsd: 1, capRuns: 500, spentUsd: 0, runs: 0 });
    expect(checkBudget(fresh).ok).toBe(true);
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

  it('first use raced by 6 processes: the budget is created once and every run is counted', async () => {
    const { root } = tempProject({});
    const rounds = 15;
    const startAt = Date.now() + 1500; // after every worker has started
    const worker = (): Promise<number> =>
      new Promise((resolve) => {
        spawn(process.execPath, ['--import', 'tsx', WORKER, root, String(rounds), String(startAt)], { stdio: 'ignore' }).on('exit', (code) => resolve(code ?? 1));
      });
    expect(await Promise.all(Array.from({ length: 6 }, worker))).toEqual([0, 0, 0, 0, 0, 0]);
    const runs = Array.from({ length: rounds }, (_, k) => loadBudget(pathsFor(path.join(root, `p${k}`))).state.runs);
    expect(runs).toEqual(Array.from({ length: rounds }, () => 6));
  }, 30_000);
});
