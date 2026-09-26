// The paid path, with a fault injected at every stage. After every case the budget and the ledger agree:
// budget runs == contract runs that made a call + failed records.
import { appendFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadBudget, setBudget } from '../../src/budget/budget.ts';
import { createChaosAdapter, type ChaosStep } from '../../src/classifier/chaos.ts';
import type { ClassifierPort, ClassifierResult } from '../../src/classifier/port.ts';
import { goalQuestion, type AskedQuestion } from '../../src/contract/translate.ts';
import { isContractRun, readLedger } from '../../src/ledger/log.ts';
import type { SidewisePaths } from '../../src/ledger/paths.ts';
import { askAll, oneLine, preflight, record, recordFree, type PlannedCall } from '../../src/verbs/pay.ts';
import type { VerbContext } from '../../src/verbs/types.ts';
import { tempProject } from '../helpers/project.ts';
import { sampleContractRun } from '../helpers/runs.ts';
import { stubProvider } from '../helpers/stub-provider.ts';

const env = { SIDEWISE_ACTOR: 'reviewer-7' };
const Q: AskedQuestion[] = [goalQuestion('It is safe'), { id: '1', n: 1, kind: 'yesno', text: 'Is it wrong?' }, { id: '2', n: 2, kind: 'scale', text: 'How bad?', levels: ['low', 'high'] }];
const call = (questions = Q): PlannedCall => ({ state: { goal: 'It is safe' }, questions });
const ctxOf = (paths: SidewisePaths, provider: ClassifierPort): VerbContext => ({ paths, provider, env });

function expectAgree(paths: SidewisePaths): void {
  const records = readLedger(paths);
  const counted = records.filter((r) => (isContractRun(r) && r.calls > 0) || r.kind === 'failed').length;
  expect(loadBudget(paths).state.runs).toBe(counted);
}

/** A port that returns whatever it is handed (junk on purpose), once per call. */
const scripted = (...results: unknown[]): ClassifierPort & { calls: number } => {
  const port = { adapter: 'stub', model: 'stub-1', calls: 0, ask: async () => results[port.calls++] as ClassifierResult };
  return port;
};

describe('preflight: stops before any call or spend', () => {
  it('ok, and says when the budget file was just created', () => {
    const { paths } = tempProject({});
    const r = preflight(ctxOf(paths, stubProvider()));
    expect(r.ok && r.value.created).toBe(true);
  });

  it('the cap reached: exit 3', () => {
    const { paths } = tempProject({});
    setBudget(paths, { capRuns: 1 });
    recordCall1(paths);
    const r = preflight(ctxOf(paths, stubProvider()));
    expect(!r.ok && r.result).toEqual({ exit: 3, text: '✖ budget: cap reached ($0.00 of $5.00 · 1 of 1 runs) → the owner runs "sidewise budget reset"' });
  });

  it('a corrupt budget: exit 3; a corrupt ledger or an unwritable one: exit 1', () => {
    const a = tempProject({}).paths;
    mkdirSync(a.dir, { recursive: true });
    writeFileSync(a.budget, '{"capUsd": 5, "runs": ');
    expect(preflight(ctxOf(a, stubProvider()))).toMatchObject({ ok: false, result: { exit: 3 } });
    const b = tempProject({}).paths;
    mkdirSync(b.dir, { recursive: true });
    writeFileSync(b.log, 'garbage\n');
    expect(preflight(ctxOf(b, stubProvider()))).toEqual({ ok: false, result: { exit: 1, text: '✖ ledger: line 1 of .sidewise/log.jsonl is not valid JSON → fix or remove that line' } });
    const c = tempProject({}).paths;
    mkdirSync(c.log, { recursive: true });
    expect(preflight(ctxOf(c, stubProvider()))).toMatchObject({ ok: false, result: { exit: 1 } });
  });
});

function recordCall1(paths: SidewisePaths): void {
  const r = record(ctxOf(paths, stubProvider()), 0, sampleContractRun());
  if (!r.ok) throw new Error(r.result.text);
}

describe('askAll: provider faults', () => {
  it.each<[ChaosStep, string]>([
    ['503', '✖ classifier: HTTP 503: service unavailable → retry later, or set SIDEWISE_PROVIDER=fake to check the request'],
    ['429', '✖ classifier: HTTP 429: rate limited → retry later, or set SIDEWISE_PROVIDER=fake to check the request'],
    ['401', '✖ classifier: HTTP 401: invalid API key → retry later, or set SIDEWISE_PROVIDER=fake to check the request'],
    ['timeout', '✖ classifier: request timed out after 20000ms → retry later, or set SIDEWISE_PROVIDER=fake to check the request'],
  ])('%s on the first call: exit 1, nothing logged, NOT counted', async (step, text) => {
    const { paths } = tempProject({});
    const r = await askAll(ctxOf(paths, createChaosAdapter([step])), 'class', [call()]);
    expect(r).toEqual({ ok: false, result: { exit: 1, text } });
    expect(readLedger(paths)).toEqual([]);
    expect(loadBudget(paths).state.runs).toBe(0);
  });

  it.each<[string, unknown, RegExp]>([
    ['no result', null, /^the provider returned no answers$/],
    ['text', 'garbage', /^the provider returned no answers$/],
    ['answers: []', { answers: [] }, /^the provider returned no answers$/],
    ['a missing answer', { answers: {}, costUsd: 0 }, /^no yes\/no answer for the goal$/],
    ['p out of range', { answers: { goal: { type: 'noul', probability: 1.5 } }, costUsd: 0 }, /^the goal probability 1\.5 is not between 0 and 1$/],
  ])('junk (%s): exit 1, counted, logged as a failed record', async (_name, junk, reason) => {
    const { paths } = tempProject({});
    const r = await askAll(ctxOf(paths, scripted(junk)), 'class', [call()]);
    expect(!r.ok && r.result.exit).toBe(1);
    expect(!r.ok && r.result.text).toMatch(/^✖ classifier: .+ → retry; the call was counted against the budget$/);
    const [failed] = readLedger(paths);
    expect(failed).toMatchObject({ kind: 'failed', verb: 'class', actor: 'reviewer-7', adapter: 'stub' });
    expect((failed as { reason: string }).reason).toMatch(reason);
    expectAgree(paths);
  });

  it('chaos malformed and missing answers are caught the same way', async () => {
    for (const step of ['malformed', 'missing'] as ChaosStep[]) {
      const { paths } = tempProject({});
      const r = await askAll(ctxOf(paths, createChaosAdapter([step])), 'class', [call()]);
      expect(!r.ok && r.result.exit).toBe(1);
      expect(readLedger(paths)[0]).toMatchObject({ kind: 'failed', adapter: 'chaos' });
      expectAgree(paths);
    }
  });

  it('a scale answer with a bad distribution is junk too', async () => {
    const { paths } = tempProject({});
    const answers = { goal: { type: 'noul', probability: 0.5 }, 1: { type: 'noul', probability: 0.5 }, 2: { type: 'score', score: 0, distribution: [Number.NaN, 1], confidence: 1 } };
    const r = await askAll(ctxOf(paths, scripted({ answers, costUsd: 0 })), 'class', [call()]);
    expect(!r.ok && r.result.text).toBe('✖ classifier: question 2 has a probability NaN that is not between 0 and 1 → retry; the call was counted against the budget');
  });

  it('call 2 of 2 fails after call 1 was paid: counted, with call 1\'s cost', async () => {
    const { paths } = tempProject({});
    const first = await stubProvider({ yes: () => 0.9, costUsd: 0.01 }).ask(Q.map((q) => ({ type: q.kind === 'scale' ? 'score' : 'noul', id: q.id, ask: q.text, levels: q.levels ?? [] }) as never), {});
    const port: ClassifierPort = { adapter: 'stub', model: 'stub-1', ask: async (qs) => (qs[0]!.id === 'goal' ? first : Promise.reject(new Error('boom'))) };
    const r = await askAll(ctxOf(paths, port), 'loop', [call(), call([{ id: 'x#1', n: 1, kind: 'yesno', text: 'Is x ok?', item: 'x' }])]);
    expect(r).toEqual({ ok: false, result: { exit: 1, text: '✖ classifier: call 2 of 2: boom → retry; the call was counted against the budget' } });
    expect(readLedger(paths)[0]).toMatchObject({ kind: 'failed', verb: 'loop', costUsd: 0.01 });
    expect(loadBudget(paths).state).toMatchObject({ runs: 1, spentUsd: 0.01 });
  });

  it('answers from every call are merged; costs add up, and any unreported cost makes the total unknown', async () => {
    const { paths } = tempProject({});
    const ok = await askAll(ctxOf(paths, stubProvider({ yes: () => 0.9, costUsd: 0.01 })), 'loop', [call(), call([{ id: 'x#1', n: 1, kind: 'yesno', text: 'Is x ok?', item: 'x' }])]);
    expect(ok.ok && Object.keys(ok.value.answers).sort()).toEqual(['1', '2', 'goal', 'x#1']);
    expect(ok.ok && ok.value.costUsd).toBeCloseTo(0.02, 10);
    const unknown = await askAll(ctxOf(paths, stubProvider({ costUsd: undefined })), 'class', [call()]);
    expect(unknown.ok && unknown.value.costUsd).toBeUndefined();
    expect(ok.ok && ok.value.answers['2']).toEqual({ kind: 'scale', dist: { low: 0.9, high: 0.1 } });
  });
});

describe('oneLine: redacts secret-shaped text before it ever becomes VerbResult text (P6)', () => {
  it('strips an API key and a bearer token from a provider error message', () => {
    const key = 'sk-' + 'A'.repeat(24);
    const bearer = `${'Bearer'} ${'B'.repeat(24)}`;
    const line = oneLine(new Error(`upstream said: key ${key} rejected, header ${bearer} invalid`));
    expect(line).not.toContain(key);
    expect(line).not.toContain('B'.repeat(24));
    expect(line).toContain('[redacted]');
  });

  it('the first-call-failure branch never leaks a secret in its VerbResult.text', async () => {
    const { paths } = tempProject({});
    const key = 'sk-' + 'A'.repeat(24);
    const port: ClassifierPort = { adapter: 'stub', model: 'stub-1', ask: async () => { throw new Error(`auth failed: ${key}`); } };
    const r = await askAll(ctxOf(paths, port), 'class', [call()]);
    expect(!r.ok && r.result.exit).toBe(1);
    expect(!r.ok && r.result.text).not.toContain(key);
    expect(!r.ok && r.result.text).toContain('[redacted]');
  });

  it('a failed record\'s reason (paid, logged) is also redacted in the returned text', async () => {
    const { paths } = tempProject({});
    const key = 'sk-' + 'A'.repeat(24);
    const first = await stubProvider({ yes: () => 0.9, costUsd: 0.01 }).ask(Q.map((q) => ({ type: q.kind === 'scale' ? 'score' : 'noul', id: q.id, ask: q.text, levels: q.levels ?? [] }) as never), {});
    const port: ClassifierPort = { adapter: 'stub', model: 'stub-1', ask: async (qs) => (qs[0]!.id === 'goal' ? first : Promise.reject(new Error(`boom: ${key}`))) };
    const r = await askAll(ctxOf(paths, port), 'loop', [call(), call([{ id: 'x#1', n: 1, kind: 'yesno', text: 'Is x ok?', item: 'x' }])]);
    expect(!r.ok && r.result.text).not.toContain(key);
    expect(!r.ok && r.result.text).toContain('[redacted]');
  });
});

describe('record: the spend and the run in one lock section', () => {
  it('a held lock when recording: exit 1, NOT counted, nothing logged', () => {
    const { paths } = tempProject({});
    mkdirSync(paths.dir, { recursive: true });
    writeFileSync(paths.lock, `${process.pid}\n`);
    const r = record(ctxOf(paths, stubProvider()), 0, sampleContractRun());
    expect(r).toEqual({ ok: false, result: { exit: 1, text: '✖ lock: .sidewise/lock is locked → wait for the other run, or delete the lock file if no run is active (the call was NOT counted against the budget)' } });
    rmSync(paths.lock);
    expect(loadBudget(paths).state.runs).toBe(0);
    expect(readLedger(paths)).toEqual([]);
  }, 15_000);

  it('a ledger corrupted during the call: the spend is rolled back, exit 1, NOT counted', () => {
    const { paths } = tempProject({});
    mkdirSync(paths.dir, { recursive: true });
    appendFileSync(paths.log, 'garbage\n');
    const r = record(ctxOf(paths, stubProvider()), 0.02, sampleContractRun());
    expect(!r.ok && r.result.text).toBe('✖ ledger: line 1 of .sidewise/log.jsonl is not valid JSON → fix or remove that line (the call was NOT counted against the budget)');
    expect(loadBudget(paths).state.runs).toBe(0);
  });

  it('recordFree logs a run that made no call, without spending', () => {
    const { paths } = tempProject({});
    const r = recordFree(ctxOf(paths, stubProvider()), sampleContractRun({ calls: 0 }));
    expect(r.ok && r.value.run.id).toBe('SW-0001');
    expect(loadBudget(paths).state.runs).toBe(0);
    expectAgree(paths);
  });
});
