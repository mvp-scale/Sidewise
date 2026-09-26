// Dependencies fail: the provider times out or answers junk, the log is corrupt, a file can't be written.
// Each ends in exit 1 (or 3 for the budget) with one clean line, and the answer says whether the call was
// counted. Budget and ledger always agree: budget runs == run records + failed records (a paid call whose answer
// was junk is logged as a `failed` record in the same lock section as its spend). A problem we can see before
// the call stops before the call.
import { appendFileSync, chmodSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadBudget } from '../../src/budget/budget.ts';
import type { ClassifierAnswer, ClassifierPort, ClassifierResult } from '../../src/classifier/port.ts';
import { appendRun, LedgerError, readLedger } from '../../src/ledger/log.ts';
import type { SidewisePaths } from '../../src/ledger/paths.ts';
import { parseRequest } from '../../src/lens/parse.ts';
import { runClass, toQuestions } from '../../src/verbs/class.ts';
import { runView } from '../../src/verbs/view.ts';
import { tempProject } from '../helpers/project.ts';
import { classRequest } from '../helpers/requests.ts';
import { sampleRun } from '../helpers/runs.ts';
import { stubProvider } from '../helpers/stub-provider.ts';

const env = { SIDEWISE_ACTOR: 'reviewer-7' };

/** A port whose ask() returns whatever the test hands it (typed loosely: this is junk on purpose). */
function junkProvider(result: unknown): ClassifierPort & { calls: number } {
  const port = {
    adapter: 'stub',
    model: 'stub-1',
    calls: 0,
    async ask() {
      port.calls += 1;
      return result as ClassifierResult;
    },
  };
  return port;
}

/** The stub's good answers with some of them replaced. */
async function answersWith(over: Record<string, unknown>): Promise<Record<string, ClassifierAnswer>> {
  const parsed = parseRequest(classRequest());
  if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
  const { answers } = await stubProvider().ask(toQuestions(parsed.request), {});
  return { ...answers, ...(over as Record<string, ClassifierAnswer>) };
}

const COUNTED = '→ retry; the call was counted against the budget';

/** The invariant: every counted call has exactly one run or failed record. */
function expectAgree(paths: SidewisePaths): void {
  const logged = readLedger(paths).filter((r) => r.kind === 'run' || r.kind === 'failed').length;
  expect(loadBudget(paths).state.runs).toBe(logged);
}

/** A counted call with a junk answer: one `failed` record and no run. */
function expectFailedOnly(paths: SidewisePaths, reason: RegExp, costUsd: number | null = 0): void {
  const records = readLedger(paths);
  expect(records).toHaveLength(1);
  expect(records[0]).toMatchObject({ kind: 'failed', verb: 'class', actor: 'reviewer-7', adapter: 'stub', model: 'stub-1', costUsd });
  expect((records[0] as { reason: string }).reason).toMatch(reason);
  expect((records[0] as { uid: string }).uid).toHaveLength(26);
  expectAgree(paths);
}

describe('the provider fails', () => {
  it('a timeout: exit 1, not logged, NOT counted', async () => {
    const { paths } = tempProject();
    const r = await runClass(classRequest(), { paths, provider: stubProvider({ fail: 'request timed out after 30000 ms' }), env });
    expect(r).toEqual({ exit: 1, text: '✖ classifier: request timed out after 30000 ms → retry later, or set SIDEWISE_PROVIDER=fake to check the request' });
    expect(readLedger(paths)).toEqual([]);
    expect(loadBudget(paths).state.runs).toBe(0);
  });

  it('a throw that is not an Error, or a many-line message, still gives one line', async () => {
    const { paths } = tempProject();
    const thrower = (thrown: unknown): ClassifierPort => ({ adapter: 'stub', model: 'stub-1', ask: async () => Promise.reject(thrown) });
    expect((await runClass(classRequest(), { paths, provider: thrower('boom'), env })).text).toBe(
      '✖ classifier: boom → retry later, or set SIDEWISE_PROVIDER=fake to check the request',
    );
    const long = await runClass(classRequest(), { paths, provider: thrower(new Error(`bad gateway\n<html>${'x'.repeat(5000)}</html>`)), env });
    expect(long.exit).toBe(1);
    expect(long.text).not.toContain('\n');
    expect(long.text.length).toBeLessThan(300);
  });

  it('junk instead of answers: exit 1, counted (the call was made), logged as a failed record', async () => {
    for (const junk of [null, 'garbage', { answers: null }, { answers: 'x' }, { answers: { s1: 'yes' } }, { answers: [] }]) {
      const { paths } = tempProject();
      const r = await runClass(classRequest(), { paths, provider: junkProvider(junk), env });
      expect(r.exit).toBe(1);
      expect(r.text).toMatch(/^✖ classifier: [^\n]+ → retry; the call was counted against the budget$/);
      expectFailedOnly(paths, /./, null); // junk carries no usable cost
    }
  });

  it('answers missing some slot ids: exit 1, counted, a failed record', async () => {
    const { paths } = tempProject();
    const answers = await answersWith({});
    delete answers.s4;
    const r = await runClass(classRequest(), { paths, provider: junkProvider({ answers, costUsd: 0 }), env });
    expect(r).toEqual({ exit: 1, text: `✖ classifier: no yes/no answer for slot 4 ${COUNTED}` });
    expectFailedOnly(paths, /^no yes\/no answer for slot 4$/);
  });

  it('probabilities outside 0..1, NaN or infinite: exit 1, never logged as a run', async () => {
    for (const p of [1.5, -0.1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const { paths } = tempProject();
      const answers = await answersWith({ s2: { type: 'noul', probability: p } });
      const r = await runClass(classRequest(), { paths, provider: junkProvider({ answers, costUsd: 0 }), env });
      expect(r).toEqual({ exit: 1, text: `✖ classifier: slot 2 probability ${p} is not between 0 and 1 ${COUNTED}` });
      expectFailedOnly(paths, /^slot 2 probability/);
    }
  });

  it('a primitive distribution with NaN or a negative value: exit 1, never logged as a run', async () => {
    for (const bad of [Number.NaN, -0.2]) {
      const { paths } = tempProject();
      const answers = await answersWith({ p2: { type: 'choice', choice: 'ship', probabilities: { ship: bad, fix: 0.5, block: 0.5 }, confidence: 0.5 } });
      const r = await runClass(classRequest(), { paths, provider: junkProvider({ answers, costUsd: 0 }), env });
      expect(r.exit).toBe(1);
      expect(r.text).toBe(`✖ classifier: "Where should this go?" has a probability ${bad} that is not between 0 and 1 ${COUNTED}`);
      expectFailedOnly(paths, /has a probability/);
    }
  });

  it('a cost that is NaN, negative or infinite counts as not reported, and never corrupts the budget', async () => {
    for (const costUsd of [Number.NaN, -3, Number.POSITIVE_INFINITY, '0.5']) {
      const { paths } = tempProject();
      const answers = await answersWith({});
      const r = await runClass(classRequest(), { paths, provider: { ...junkProvider({ answers, costUsd }), adapter: 'typesafe' }, env });
      expect(r.exit).toBe(0);
      expect(r.text).toContain('provider did not report cost; the run cap still applies');
      expect(loadBudget(paths).state).toMatchObject({ runs: 1, spentUsd: 0 });
      expect(readLedger(paths)[0]).toMatchObject({ costUsd: null });
    }
  });
});

describe('the log is corrupt: refuse with a fix, before any call or spend', () => {
  const corrupt = (paths: SidewisePaths, tail: string): void => {
    appendRun(paths, sampleRun());
    appendFileSync(paths.log, tail);
  };

  it.each([
    ['a garbage line mid-file', 'not json at all\n{"kind":"outcome"}\n', 'line 2 of .sidewise/log.jsonl is not valid JSON'],
    ['a truncated last line', '{"kind":"run","id":"SW-00', 'line 2 of .sidewise/log.jsonl is not valid JSON'],
    ['a JSON line that is not a record', 'null\n', 'line 2 of .sidewise/log.jsonl is not a ledger record'],
    ['a run record missing its fields', '{"kind":"run","id":"SW-0002"}\n', 'line 2 of .sidewise/log.jsonl is not a ledger record'],
  ])('%s', async (_name, tail, problem) => {
    const { paths } = tempProject();
    corrupt(paths, tail);
    const before = readFileSync(paths.log, 'utf8');
    const provider = stubProvider();
    const r = await runClass(classRequest(), { paths, provider, env });
    expect(r).toEqual({ exit: 1, text: `✖ ledger: ${problem} → fix or remove that line` });
    expect(provider.calls).toHaveLength(0);
    expect(loadBudget(paths).state.runs).toBe(0);
    expect(readFileSync(paths.log, 'utf8')).toBe(before);
    if (tail.endsWith('\n')) expect(() => runView('src', 1, paths)).toThrow(LedgerError);
    else expect(runView('src', 1, paths).exit).toBe(0); // an unterminated last line may be an append in progress
  });
});

describe('a file cannot be written', () => {
  it('the log path is a directory: exit 1 before the call, nothing counted', async () => {
    const { paths } = tempProject();
    mkdirSync(paths.log, { recursive: true });
    const provider = stubProvider();
    const r = await runClass(classRequest(), { paths, provider, env });
    expect(r).toEqual({ exit: 1, text: '✖ files: cannot read .sidewise/log.jsonl (EISDIR) → make .sidewise/ a writable folder, with log.jsonl and budget.json as files' });
    expect(provider.calls).toHaveLength(0);
    expect(loadBudget(paths).state.runs).toBe(0);
  });

  it('the log becomes a directory during the call: exit 1, NOT counted, nothing logged (one section)', async () => {
    const { paths } = tempProject();
    const stub = stubProvider();
    const provider: ClassifierPort = {
      ...stub,
      ask: async (q, s) => {
        const r = await stub.ask(q, s);
        rmSync(paths.log, { force: true });
        mkdirSync(paths.log);
        return r;
      },
    };
    const r = await runClass(classRequest(), { paths, provider, env });
    expect(r.exit).toBe(1);
    expect(r.text).toMatch(/^✖ files: cannot [a-z]+ \.sidewise\/log\.jsonl \(EISDIR\) → .* \(the call was NOT counted against the budget\)$/);
    expect(loadBudget(paths).state.runs).toBe(0);
  });

  it('the log is corrupted during the call: the spend is rolled back, exit 1, NOT counted', async () => {
    const { paths } = tempProject();
    const stub = stubProvider();
    const provider: ClassifierPort = {
      ...stub,
      ask: async (q, s) => {
        const r = await stub.ask(q, s);
        appendFileSync(paths.log, 'garbage\n');
        return r;
      },
    };
    const r = await runClass(classRequest(), { paths, provider, env });
    expect(r).toEqual({ exit: 1, text: '✖ ledger: line 1 of .sidewise/log.jsonl is not valid JSON → fix or remove that line (the call was NOT counted against the budget)' });
    expect(loadBudget(paths).state.runs).toBe(0);
  });

  it('budget.json is a directory: refused like a corrupt budget (exit 3)', async () => {
    const { paths } = tempProject();
    mkdirSync(paths.budget, { recursive: true });
    const provider = stubProvider();
    const r = await runClass(classRequest(), { paths, provider, env });
    expect(r).toEqual({ exit: 3, text: '✖ budget: .sidewise/budget.json is unreadable (EISDIR) → the owner runs "sidewise budget reset" to start a fresh budget' });
    expect(provider.calls).toHaveLength(0);
  });

  it.skipIf(process.getuid?.() === 0)('a read-only log file: exit 1 before the call', async () => {
    const { paths } = tempProject();
    appendRun(paths, sampleRun());
    chmodSync(paths.log, 0o444);
    const provider = stubProvider();
    const r = await runClass(classRequest(), { paths, provider, env });
    expect(r.exit).toBe(1);
    expect(r.text).toMatch(/^✖ files: cannot write \.sidewise\/log\.jsonl \(EACCES\) → /);
    expect(provider.calls).toHaveLength(0);
  });
});
