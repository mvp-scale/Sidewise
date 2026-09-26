// class on the contract: request → evidence → (reuse or) one call → grade → the compact YAML response.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { loadBudget } from '../../src/budget/budget.ts';
import { isContractRun, readLedger } from '../../src/ledger/log.ts';
import { runClass } from '../../src/verbs/class.ts';
import { tempProject } from '../helpers/project.ts';
import { stubProvider } from '../helpers/stub-provider.ts';

const CLASS_YAML = readFileSync('test/fixtures/requests/valid/class.yaml', 'utf8');
const env = { SIDEWISE_ACTOR: 'reviewer-7' };
// The contract's own numbers (P(yes) per question); see plan Decision 3: this gives SPLIT, not the doc's STRONG.
const P: Record<string, number> = { goal: 0.08, '1': 0.94, '2': 0.91, '10': 0.9, '3': 0.88, '6': 0.81, '9': 0.75, '4': 0.86, '5': 0.84, '7': 0.55, '8': 0.2, '11': 0, '12': 0 };

describe('class', () => {
  it('the contract class example: gate, categories, consensus SPLIT (Decision 3), one call, logged as v2', async () => {
    const { paths } = tempProject({ 'src/user.ts': 'export function findUser(id) { return db.query(`SELECT * FROM users WHERE id = ${id}`); }\n' });
    const provider = stubProvider({ yes: (q) => P[q.id] ?? 0.5, pick: { '11': 'high', '12': 'block' } });
    const r = await runClass(CLASS_YAML, { paths, provider, env, now: () => Date.parse('2026-09-26T12:00:00Z') });
    expect(r.exit).toBe(0);
    expect(r.text).toContain('gate: fail');
    expect(r.text).toContain('consensus: SPLIT');
    expect(r.text).toContain('escalate: true');
    expect(provider.calls).toHaveLength(1);
    const [run] = readLedger(paths).filter(isContractRun);
    expect(run).toMatchObject({ id: 'SW-0001', v: 2, verb: 'class', calls: 1, consensus: 'SPLIT' });
    expect(loadBudget(paths).state.runs).toBe(1);
  });

  it('an identical second run makes no call and is free', async () => {
    const { paths } = tempProject({ 'src/user.ts': 'export function findUser(id) { return db.query(`SELECT * FROM users WHERE id = ${id}`); }\n' });
    const provider = stubProvider({ yes: (q) => P[q.id] ?? 0.5, pick: { '11': 'high', '12': 'block' } });
    await runClass(CLASS_YAML, { paths, provider, env });
    const r2 = await runClass(CLASS_YAML, { paths, provider, env });
    expect(provider.calls).toHaveLength(1); // no second call
    expect(r2.exit).toBe(0);
    const runs = readLedger(paths).filter(isContractRun);
    expect(runs[1]).toMatchObject({ id: 'SW-0002', calls: 0 });
    expect(loadBudget(paths).state.runs).toBe(1); // the free run isn't counted
  });

  it('--dry-run: no provider call, no budget file, no ledger line', async () => {
    const { paths } = tempProject({ 'src/user.ts': 'x' });
    const provider = stubProvider();
    const r = await runClass(CLASS_YAML, { paths, provider, env, dryRun: true });
    expect(r.exit).toBe(0);
    expect(r.text).toBe('plan:\n  calls: 1\n  questions: 13\nnotes: [dry run · no call · no spend]\n');
    expect(provider.calls).toHaveLength(0);
    expect(readLedger(paths)).toEqual([]);
  });

  it('an invalid request exits 2 before touching the budget or the ledger', async () => {
    const { paths } = tempProject({});
    const r = await runClass('side:\n  goal: too short one\n', { paths, provider: stubProvider(), env });
    expect(r.exit).toBe(2);
    expect(readLedger(paths)).toEqual([]);
  });
});
