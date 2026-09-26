// class on the contract: request → evidence → (reuse or) one call → grade → the compact YAML response.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { loadBudget } from '../../src/budget/budget.ts';
import { EVIDENCE_LIMITS } from '../../src/evidence/code.ts';
import { isContractRun, readLedger } from '../../src/ledger/log.ts';
import { runClass } from '../../src/verbs/class.ts';
import { tempProject } from '../helpers/project.ts';
import { stubProvider } from '../helpers/stub-provider.ts';

const CLASS_YAML = readFileSync('test/fixtures/requests/valid/class.yaml', 'utf8');
const env = { SIDEWISE_ACTOR: 'reviewer-7' };
// The contract's own numbers (P(yes) per question); see plan Decision 3: this gives SPLIT, not the doc's STRONG.
// 11 (severity, scale) and 12 (route, choice) aren't yes/no: stubProvider only uses `pick` for those, never `yes`.
const P: Record<string, number> = { goal: 0.08, '1': 0.94, '2': 0.91, '10': 0.9, '3': 0.88, '6': 0.81, '9': 0.75, '4': 0.86, '5': 0.84, '7': 0.55, '8': 0.2 };

describe('class', () => {
  it('the contract class example: gate, categories, consensus SPLIT (Decision 3), one call, logged as v2', async () => {
    const { paths } = tempProject({ 'src/user.ts': 'export function findUser(id) { return db.query(`SELECT * FROM users WHERE id = ${id}`); }\n' });
    const provider = stubProvider({ yes: (q) => P[q.id] ?? 0.5, pick: { '11': 'high', '12': 'block' } });
    const r = await runClass(CLASS_YAML, { paths, provider, env, now: () => Date.parse('2026-09-26T12:00:00Z') });
    expect(r.exit).toBe(0);
    expect(r.text).toContain('gate: fail');
    expect(r.text).toContain('severity: {gate: fail, 11: {top: high, p: 0.90}}');
    expect(r.text).toContain('route: {gate: fail, 12: {top: block, p: 0.90}}');
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
    expect(r.text).toBe('plan:\n  calls: 1\n  questions: 13\nnotes: ["dry run: no call, no spend"]\n');
    expect(provider.calls).toHaveLength(0);
    expect(readLedger(paths)).toEqual([]);
  });

  it('an oversized source file: the evidence-truncation note comes before the budget note', async () => {
    const big = 'x'.repeat(EVIDENCE_LIMITS.perFileChars + 5000);
    const { paths } = tempProject({ 'src/user.ts': big });
    const provider = stubProvider({ yes: (q) => P[q.id] ?? 0.5, pick: { '11': 'high', '12': 'block' } });
    const r = await runClass(CLASS_YAML, { paths, provider, env });
    expect(r.exit).toBe(0);
    expect(r.text).toContain(`notes: [src/user.ts:1-3 truncated to ${EVIDENCE_LIMITS.perFileChars} chars, `);
    expect(r.text.indexOf('truncated to')).toBeGreaterThan(-1);
    expect(r.text.indexOf('truncated to')).toBeLessThan(r.text.indexOf('budget'));
  });

  it('an invalid request exits 2 before touching the budget or the ledger', async () => {
    const { paths } = tempProject({});
    const r = await runClass('side:\n  goal: too short one\n', { paths, provider: stubProvider(), env });
    expect(r.exit).toBe(2);
    expect(readLedger(paths)).toEqual([]);
  });

  it('a goal that misses the bar while every category passes: next says so, not categories[0]', async () => {
    const { paths } = tempProject({ 'src/user.ts': 'export function findUser(id) { return db.query("SELECT * FROM users WHERE id = ?", [id]); }\n' });
    // injection/access/leaks (pass: no) low; guards (pass: yes) high; severity picks none (a passing level);
    // route picks ship (the only passing option) — every category passes. Only the goal itself misses.
    const ALL_PASS: Record<string, number> = { goal: 0.1, '1': 0.1, '2': 0.1, '10': 0.1, '3': 0.9, '6': 0.9, '9': 0.9, '4': 0.1, '5': 0.1, '7': 0.1, '8': 0.1 };
    const provider = stubProvider({ yes: (q) => ALL_PASS[q.id] ?? 0.5, pick: { '11': 'none', '12': 'ship' } });
    const r = await runClass(CLASS_YAML, { paths, provider, env });
    expect(r.exit).toBe(0);
    expect(r.text).toContain('gate: fail');
    expect(r.text).toContain('goal: {gate: fail, p: 0.10}');
    expect(r.text).toContain('injection: {gate: pass');
    expect(r.text).toContain('guards: {gate: pass');
    expect(r.text).toContain('access: {gate: pass');
    expect(r.text).toContain('leaks: {gate: pass');
    expect(r.text).toContain('severity: {gate: pass');
    expect(r.text).toContain('route: {gate: pass');
    expect(r.text).toContain('next: the goal missed though every part passed · fix what is missing, then run it again');
  });
});
