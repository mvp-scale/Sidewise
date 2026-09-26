// loop: the contract's own example end to end, tree order for failing: and passing:.
import { describe, expect, it } from 'vitest';
import { runLoop } from '../../src/verbs/loop.ts';
import { isContractRun, readLedger } from '../../src/ledger/log.ts';
import { tempProject } from '../helpers/project.ts';
import { stubProvider } from '../helpers/stub-provider.ts';

const LOOP =
  'side:\n  goal: The checkout redesign is sound\n  depth: quick\n  over:\n    part:\n      - name: gateway\n        story: [guest checkout, saved cards]\n      - name: payments\n        story: [refunds, retries, partial capture]\n      - ledger\n  ask:\n    part:\n      boundaries:\n        pass: yes\n        1: Does {part} own one clear responsibility?\n        2: Can {part} be deployed without the others?\n    story:\n      done:\n        pass: yes\n        3: Is "{story}" testable against {part} as written?\n      risk:\n        pass: no\n        4: Does "{story}" need data {part} doesn\'t own?\nwise:\n  why: validate\n  area: api\n';

describe('loop', () => {
  it('the contract example: payments and its failing children show up, tree order, worst-target next [C-080] [C-082]', async () => {
    const { paths } = tempProject({});
    const yes = (q: { id: string }) =>
      q.id === 'payments#2' ? 0.18 : q.id === 'payments/refunds#3' ? 0.22 : q.id === 'payments/refunds#4' ? 0.91 : q.id === 'payments/partial capture#4' ? 0.48 : q.id.endsWith('#4') ? 0.1 : 0.9;
    const r = await runLoop(LOOP, { paths, provider: stubProvider({ yes }), env: {} });
    expect(r.exit).toBe(0);
    expect(r.text).toContain('payments: {boundaries: fail, 2: 0.18}');
    expect(r.text).toContain('payments/refunds: {done: fail, risk: fail, 3: 0.22, 4: 0.91}');
    expect(r.text).toContain('payments/partial capture: {risk: unsure, 4: 0.48}');
    expect(r.text).toContain('passing: [gateway, gateway/guest checkout, gateway/saved cards, payments/retries, ledger]');
    expect(r.text).toContain('gate: fail');
    expect(r.text).toContain('wise: {recorded: [why, area]}');
    // worstFirst picks the worst item (most fails, then unsures): refunds (2 failing categories) over
    // payments itself (1) or partial capture (0 fails, 1 unsure) — matches the contract's own golden example.
    expect(r.text).toContain('next: sidewise template drill --parent SW-0001 --from payments/refunds');
    expect(r.text).toMatch(/2 calls · 16 questions · budget \d+% used/);
    expect(r.run).toBeDefined();
  });

  it('--dry-run: no provider call, no budget file, no ledger line [C-088]', async () => {
    const { paths } = tempProject({});
    const provider = stubProvider();
    const r = await runLoop(LOOP, { paths, provider, env: {}, dryRun: true });
    expect(r.exit).toBe(0);
    expect(r.text).toBe('plan:\n  calls: 2\n  questions: 16\n  items: 8\n  reused: 0\n  route: fake\nnotes: ["dry run: no call, no spend"]\n');
    expect(provider.calls).toHaveLength(0);
    expect(readLedger(paths)).toEqual([]);
  });

  it('a goal that clears the bar on a fully-passing sweep: gate pass, next is "act on it"', async () => {
    const { paths } = tempProject({});
    const ALL_PASS =
      'side:\n  goal: The checkout redesign is sound\n  depth: quick\n  over:\n    part:\n      - gateway\n      - payments\n  ask:\n    part:\n      boundaries:\n        pass: yes\n        1: Does {part} own one clear responsibility?\nwise:\n  why: validate\n  area: api\n';
    const r = await runLoop(ALL_PASS, { paths, provider: stubProvider({ yes: () => 0.95 }), env: {} });
    expect(r.exit).toBe(0);
    expect(r.text).toContain('gate: pass');
    expect(r.text).toContain('next: act on it');
    expect(r.text).toContain('passing: [gateway, payments]');
  });

  it('a goal that misses the bar on an all-passing sweep: next says so, not a passing item', async () => {
    const { paths } = tempProject({});
    const ALL_PASS =
      'side:\n  goal: The checkout redesign is sound\n  depth: quick\n  over:\n    part:\n      - gateway\n      - payments\n  ask:\n    part:\n      boundaries:\n        pass: yes\n        1: Does {part} own one clear responsibility?\nwise:\n  why: validate\n  area: api\n';
    // Every item's own category clears the bar; only the goal itself misses — worstFirst has nothing to point
    // at, so this used to throw on worst!.id, then (fix round 1) wrongly drilled into gateway even though it passed.
    const yes = (q: { id: string }) => (q.id === 'goal' ? 0.1 : 0.95);
    const r = await runLoop(ALL_PASS, { paths, provider: stubProvider({ yes }), env: {} });
    expect(r.exit).toBe(0);
    expect(r.text).toContain('gate: fail');
    expect(r.text).toContain('goal: {gate: fail, p: 0.10}');
    expect(r.text).toContain('passing: [gateway, payments]');
    expect(r.text).toContain('next: the goal missed though every part passed · fix what is missing, then run it again');
  });

  it('the full per-item category record is kept in the ledger even though no per-layer query surfaces it yet [C-084]', async () => {
    const { paths } = tempProject({});
    const yes = (q: { id: string }) =>
      q.id === 'payments#2' ? 0.18 : q.id === 'payments/refunds#3' ? 0.22 : q.id === 'payments/refunds#4' ? 0.91 : q.id === 'payments/partial capture#4' ? 0.48 : q.id.endsWith('#4') ? 0.1 : 0.9;
    const r = await runLoop(LOOP, { paths, provider: stubProvider({ yes }), env: {} });
    // Unlike class (view's request mode reads a per-category, per-place record straight off the ledger),
    // a sweep run's own top-level `categories` is always {} — the per-item categories below are the only
    // place this run's grading lives, and today only this run's own response reads them back, not a
    // dedicated cross-run pattern query. That's the real, current shape of "Wise learns" for loop.
    if (!r.run || !isContractRun(r.run)) throw new Error('expected a v2 contract run');
    expect(r.run.categories).toEqual({});
    expect(r.run.items?.['payments']?.categories).toEqual({ boundaries: 'fail' });
    expect(r.run.items?.['payments/refunds']?.categories).toEqual({ done: 'fail', risk: 'fail' });
  });

  it('a rehearsal adapter (fake) labels its notes "not evidence" (BRIEF §5) [C-092]', async () => {
    const { paths } = tempProject({});
    const yes = (q: { id: string }) =>
      q.id === 'payments#2' ? 0.18 : q.id === 'payments/refunds#3' ? 0.22 : q.id === 'payments/refunds#4' ? 0.91 : q.id === 'payments/partial capture#4' ? 0.48 : q.id.endsWith('#4') ? 0.1 : 0.9;
    const r = await runLoop(LOOP, { paths, provider: stubProvider({ yes, adapter: 'fake' }), env: {} });
    expect(r.exit).toBe(0);
    expect(r.text).toContain('adapter fake · not evidence');
  });

  it('a missing budget file is created with defaults, and the first run says so (BRIEF §5) [C-093]', async () => {
    const { paths } = tempProject({});
    const yes = (q: { id: string }) =>
      q.id === 'payments#2' ? 0.18 : q.id === 'payments/refunds#3' ? 0.22 : q.id === 'payments/refunds#4' ? 0.91 : q.id === 'payments/partial capture#4' ? 0.48 : q.id.endsWith('#4') ? 0.1 : 0.9;
    const r = await runLoop(LOOP, { paths, provider: stubProvider({ yes }), env: {} });
    expect(r.exit).toBe(0);
    expect(r.text).toContain('budget file created with defaults ($5.00 · 500 runs)');
  });
});
