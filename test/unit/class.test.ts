import { describe, expect, it } from 'vitest';
import { createFakeAdapter } from '../../src/classifier/fake.ts';
import { loadBudget, recordSpend, setBudget } from '../../src/budget/budget.ts';
import { isRun, readLedger } from '../../src/ledger/log.ts';
import { runClass } from '../../src/verbs/class.ts';
import type { ClassifierQuestion } from '../../src/classifier/port.ts';
import { EVIDENCE_LIMITS } from '../../src/evidence/code.ts';
import { tempProject } from '../helpers/project.ts';
import { classRequest, RM_SLOTS } from '../helpers/requests.ts';
import { stubProvider } from '../helpers/stub-provider.ts';

const REVERSED = new Set(['s3', 's6', 's9']);
/** Forward slots say yes (.9) except slot 8 (.2); reversed slots say no (.1): a STRONG concern. */
const yes = (q: ClassifierQuestion): number => (REVERSED.has(q.id) ? 0.1 : q.id === 's8' ? 0.2 : 0.9);
const env = { SIDEWISE_ACTOR: 'reviewer-7' };

describe('class', () => {
  it('answers the canonical request, logs one run and counts it against the budget (golden)', async () => {
    const { paths } = tempProject();
    const provider = stubProvider({ yes, pick: { p1: 'high', p2: 'block' } });
    const r = await runClass(classRequest(), { paths, provider, env, now: () => Date.parse('2026-09-25T12:00:00Z') });
    expect(r.exit).toBe(0);
    expect(r.text).toBe(
      [
        'sidewise SW-0001 · class L1 · consensus STRONG · leans block (.90)',
        'concern 1 2 3 4 5 6 7 9 10 · clear 8 · reversed 3 6 9 ok',
        '~ How severe is the worst issue: high (.90)',
        'guidance: the evidence agrees there are concerns about "This handler is safe to merge"',
        'next: sidewise outcome SW-0001 held|overruled|failed --by <actor>',
        'notes: budget 0% used ($0.00 of $5.00 · 1 of 500 runs); budget initialised ($5.00 / 500 runs; "sidewise budget set" changes it)',
      ].join('\n'),
    );
    const [run] = readLedger(paths).filter(isRun);
    expect(run).toMatchObject({ id: 'SW-0001', actor: 'reviewer-7', perspective: 'reviewer', consensus: 'STRONG', verdict: 'concern', lean: { option: 'block', p: 0.9 } });
    expect(run!.slots[7]).toEqual({ pos: 8, text: 'Does the code log an email address?', reverse: false, p: 0.2 });
    expect(loadBudget(paths).state.runs).toBe(1);
  });

  it('sends slots and primitives as one ask, with the focus, problem and code as evidence', async () => {
    const { paths } = tempProject();
    const provider = stubProvider({ yes });
    await runClass(classRequest(), { paths, provider, env });
    expect(provider.calls).toHaveLength(1);
    const call = provider.calls[0]!;
    expect(call.questions.map((q) => q.id)).toEqual(['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8', 's9', 's10', 'p1', 'p2']);
    expect(call.state).toMatchObject({ focus: 'This handler is safe to merge', problem: 'login lookup builds SQL from the request' });
    expect(String(call.state['code:src/user.ts:1-3'])).toContain('SELECT * FROM users');
  });

  it('labels the fake provider as not evidence', async () => {
    const { paths } = tempProject();
    const r = await runClass(classRequest(), { paths, provider: createFakeAdapter(), env });
    expect(r.exit).toBe(0);
    expect(r.text.split('\n')[0]).toContain('adapter fake · not evidence');
  });

  it('an invalid request exits 2, never calls the provider, logs nothing and spends nothing', async () => {
    const { paths } = tempProject();
    const provider = stubProvider({ yes });
    const r = await runClass(classRequest({ slots: RM_SLOTS.slice(0, 7) }), { paths, provider, env });
    expect(r).toEqual({ exit: 2, text: '✖ slots: L1 needs 10, got 7 → add 3 questions on the same focus' });
    expect(provider.calls).toHaveLength(0);
    expect(readLedger(paths)).toEqual([]);
  });

  it('a folder in where exits 2 before any call', async () => {
    const { paths } = tempProject();
    const provider = stubProvider({ yes });
    const r = await runClass(classRequest({ fields: { where: 'src' } }), { paths, provider, env });
    expect(r.exit).toBe(2);
    expect(r.text).toMatch(/"src" is a folder/);
    expect(provider.calls).toHaveLength(0);
  });

  it('a reached cap exits 3 and never calls the provider', async () => {
    const { paths } = tempProject();
    setBudget(paths, { capRuns: 1 });
    recordSpend(paths, 0);
    const provider = stubProvider({ yes });
    const r = await runClass(classRequest(), { paths, provider, env });
    expect(r.exit).toBe(3);
    expect(r.text).toMatch(/cap reached .* → the owner runs "sidewise budget reset"/);
    expect(provider.calls).toHaveLength(0);
  });

  it('a provider error exits 1 and logs nothing', async () => {
    const { paths } = tempProject();
    const r = await runClass(classRequest(), { paths, provider: stubProvider({ fail: 'HTTP 503: unavailable' }), env });
    expect(r).toEqual({ exit: 1, text: '✖ classifier: HTTP 503: unavailable → retry later, or set SIDEWISE_PROVIDER=fake to check the request' });
    expect(readLedger(paths)).toEqual([]);
  });

  it('notes when the provider does not report cost; the run still counts', async () => {
    const { paths } = tempProject();
    const r = await runClass(classRequest(), { paths, provider: stubProvider({ yes, costUsd: undefined, adapter: 'typesafe' }), env });
    expect(r.text).toContain('provider did not report cost; the run cap still applies');
    expect(loadBudget(paths).state.runs).toBe(1);
  });

  it('notes run in a fixed order: validation, evidence, unreported cost, budget initialised', async () => {
    const { paths } = tempProject({ 'src/user.ts': 'x'.repeat(EVIDENCE_LIMITS.perFileChars + 10) });
    const text = classRequest({ fields: { perspective: null, where: 'src/user.ts' } });
    const r = await runClass(text, { paths, provider: stubProvider({ yes, costUsd: undefined, adapter: 'typesafe' }), env });
    expect(r.exit).toBe(0);
    expect(readLedger(paths).filter(isRun)[0]!.notes).toEqual([
      'no perspective; recorded as "agent"',
      `src/user.ts truncated to ${EVIDENCE_LIMITS.perFileChars} chars`,
      'provider did not report cost; the run cap still applies',
      'budget initialised ($5.00 / 500 runs; "sidewise budget set" changes it)',
    ]);
  });

  it('redacts secrets in slot text before the provider and the ledger see them', async () => {
    const token = 'gh' + 'p_' + 'q'.repeat(30);
    const { paths } = tempProject();
    const provider = stubProvider({ yes });
    const slots = RM_SLOTS.map((s, i) => (i === 0 ? ` 1  Is ${token} placed directly into the SQL query?` : s));
    await runClass(classRequest({ slots }), { paths, provider, env });
    expect(provider.calls[0]!.questions[0]!.ask).toBe('Is [redacted] placed directly into the SQL query?');
    expect(readLedger(paths).filter(isRun)[0]!.slots[0]!.text).toBe('Is [redacted] placed directly into the SQL query?');
  });

  it("escalates at L3: guidance ends with don't act on this alone", async () => {
    const { paths } = tempProject();
    const slots = Array.from({ length: 30 }, (_, i) => `${String(i + 1).padStart(2)} ${(i + 1) % 3 === 0 ? '!' : ' '}Check ${i + 1} passes for the handler?`);
    const r = await runClass(classRequest({ header: 'sidewise class L3', slots }), { paths, provider: stubProvider({ yes: (q) => (Number(q.id.slice(1)) % 3 === 0 ? 0.1 : 0.9) }), env });
    expect(r.exit).toBe(0);
    expect(r.text).toMatch(/guidance: .*; don't act on this alone/);
  });
});
