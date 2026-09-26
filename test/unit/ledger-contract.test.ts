// Contract runs in the ledger: ids shared with legacy runs, the stored response, redaction (keys too), one lock
// section with the spend, outcomes, and answer reuse that never crosses providers or overruled runs.
import { appendFileSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadBudget } from '../../src/budget/budget.ts';
import { appendContractRun, appendOutcome, appendRun, findRun, isContractRun, isRun, nextRunNumber, readLedger } from '../../src/ledger/log.ts';
import { recordCall } from '../../src/ledger/record.ts';
import { redactDeep } from '../../src/ledger/redact.ts';
import { exactReuse, lookupAnswers } from '../../src/ledger/reuse.ts';
import { tempProject } from '../helpers/project.ts';
import { sampleContractRun, sampleRun } from '../helpers/runs.ts';

const GH_TOKEN = 'gh' + 'p_' + 'a'.repeat(30);
const WHO = { adapter: 'stub', model: 'stub-1' };
const T = Date.parse('2026-09-26T12:00:00Z');

describe('contract runs', () => {
  it('share one id sequence with legacy runs; the response is built with the id and the budget line', () => {
    const { paths } = tempProject({});
    appendRun(paths, sampleRun());
    const r = appendContractRun(paths, sampleContractRun(), T, 'budget 0% used');
    expect(r).toMatchObject({ kind: 'run', v: 2, id: 'SW-0002', ts: '2026-09-26T12:00:00Z', response: 'side:\n  id: SW-0002\n  gate: fail\nnotes: [budget 0% used]\n' });
    const records = readLedger(paths);
    expect(records.filter(isRun).map((x) => x.id)).toEqual(['SW-0001']);
    expect(records.filter(isContractRun).map((x) => x.id)).toEqual(['SW-0002']);
    expect(nextRunNumber(paths)).toBe(3);
    expect(findRun(paths, 'SW-0002')).toMatchObject({ v: 2, goal: 'The handler is safe to merge' });
    expect(findRun(paths, 'SW-0001')).toMatchObject({ focus: 'handler is safe to merge' });
    expect(findRun(paths, 'SW-0009')).toBeUndefined();
  });

  it('redacts values and keys, and the stored response', () => {
    const { paths } = tempProject({});
    const run = sampleContractRun({
      goal: `leaked ${GH_TOKEN}`,
      answers: { [`item ${GH_TOKEN}#1`]: { kind: 'yesno', p: 0.5 } },
      response: () => `side:\n  goal: ${GH_TOKEN}\n`,
    });
    appendContractRun(paths, run, T, 'b');
    const text = readFileSync(paths.log, 'utf8');
    expect(text).not.toContain(GH_TOKEN);
    expect(redactDeep({ [`a ${GH_TOKEN}`]: 1 })).toEqual({ 'a [redacted]': 1 });
  });

  it('a line that claims v: 2 but lacks the fields refuses the read (fail closed)', () => {
    const { paths } = tempProject({});
    appendContractRun(paths, sampleContractRun(), T, 'b');
    appendFileSync(paths.log, '{"kind":"run","v":2,"id":"SW-0002"}\n');
    expect(() => readLedger(paths)).toThrow(/line 2 of \.sidewise\/log\.jsonl is not a ledger record/);
  });

  it('recordCall({ contract }) spends and appends in one lock section; a failed append puts the budget back', () => {
    const { paths } = tempProject({});
    const { budget, record } = recordCall(paths, 0.02, { contract: sampleContractRun() }, T);
    expect(record.id).toBe('SW-0001');
    expect(record.response).toContain('notes: [budget 0% used ($0.02 of $5.00 · 1 of 500 runs)]');
    expect(budget.runs).toBe(1);
    rmSync(paths.log);
    mkdirSync(paths.log);
    expect(() => recordCall(paths, 0.02, { contract: sampleContractRun() }, T)).toThrow(/EISDIR/);
    expect(loadBudget(paths).state.runs).toBe(1);
  });

  it('outcomes attach to contract runs; the asker still cannot mark its own run held', () => {
    const { paths } = tempProject({});
    appendContractRun(paths, sampleContractRun({ actor: 'reviewer' }), T, 'b');
    expect(() => appendOutcome(paths, 'SW-0001', 'held', 'reviewer')).toThrow(/reviewer asked SW-0001, so it can't mark it held/);
    expect(appendOutcome(paths, 'SW-0001', 'held', 'owner').record).toMatchObject({ of: 'SW-0001', outcome: 'held' });
  });
});

describe('answer reuse', () => {
  it('finds answers by key, for the same adapter and model only', () => {
    const { paths } = tempProject({});
    appendContractRun(paths, sampleContractRun(), T, 'b');
    appendContractRun(paths, sampleContractRun({ adapter: 'fake', model: 'sidewise-fake-1', answers: { 1: { kind: 'yesno', p: 0.1 } }, keys: { 1: 'k-fake' } }), T, 'b');
    const found = lookupAnswers(paths, WHO, ['k-1', 'k-goal', 'k-none']);
    expect(Object.fromEntries(found)).toEqual({
      'k-goal': { id: 'SW-0001', answer: { kind: 'yesno', p: 0.2 } },
      'k-1': { id: 'SW-0001', answer: { kind: 'yesno', p: 0.9 } },
    });
    expect(lookupAnswers(paths, { adapter: 'typesafe', model: 'jev-1.13.0' }, ['k-fake']).size).toBe(0);
  });

  it('reuse never crosses providers or outcomes: an overruled or failed run is skipped, a held one is not', () => {
    const { paths } = tempProject({});
    appendContractRun(paths, sampleContractRun({ actor: 'a' }), T, 'b');
    appendContractRun(paths, sampleContractRun({ actor: 'a', keys: { 1: 'k-2' } }), T, 'b');
    appendOutcome(paths, 'SW-0001', 'overruled', 'owner');
    appendOutcome(paths, 'SW-0002', 'held', 'owner');
    expect(lookupAnswers(paths, WHO, ['k-1']).size).toBe(0);
    expect(lookupAnswers(paths, WHO, ['k-2']).get('k-2')!.id).toBe('SW-0002');
    appendContractRun(paths, sampleContractRun({ keys: { 1: 'k-1' }, reusedFrom: { 1: 'SW-0001' } }), T, 'b');
    expect(lookupAnswers(paths, WHO, ['k-1']).size).toBe(0); // its original run was overruled
  });

  it('exact reuse: the newest run holding every key', () => {
    const { paths } = tempProject({});
    appendContractRun(paths, sampleContractRun(), T, 'b');
    appendContractRun(paths, sampleContractRun({ keys: { goal: 'k-goal', 1: 'k-1', 2: 'k-2' } }), T, 'b');
    expect(exactReuse(paths, WHO, ['k-goal', 'k-1'])).toBe('SW-0002');
    expect(exactReuse(paths, WHO, ['k-goal', 'k-9'])).toBeUndefined();
    expect(exactReuse(paths, WHO, [])).toBeUndefined();
  });
});
