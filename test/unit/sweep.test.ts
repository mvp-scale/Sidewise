// The shared sweep engine: depth-cap skipping, per-question reuse, one call per layer that needs one.
import { describe, expect, it } from 'vitest';
import { planNeedsBudget, planSweep, runSweep } from '../../src/verbs/sweep.ts';
import { runLoop } from '../../src/verbs/loop.ts';
import { validateRequest } from '../../src/contract/validate.ts';
import { readRequestText } from '../../src/contract/read.ts';
import type { Request } from '../../src/contract/types.ts';
import { tempProject } from '../helpers/project.ts';
import { stubProvider } from '../helpers/stub-provider.ts';

// part is not the finest layer (story is): a thin 2-probe ask is fine there. story needs the full contract:
// 3 concerns categories x 3 probes + decisions.
const LOOP =
  'side:\n  goal: The checkout redesign is sound\n  depth: quick\n  over:\n    part:\n      - name: gateway\n        story: [guest checkout, saved cards]\n      - name: payments\n        story: [refunds, retries, partial capture]\n      - ledger\n  ask:\n    part:\n      concerns:\n        boundaries:\n          pass: yes\n          1: Does {part} own one clear responsibility?\n          2: Can {part} be deployed without the others?\n    story:\n      concerns:\n        done:\n          pass: yes\n          3: Is "{story}" testable against {part} as written?\n          4: Does "{story}" have a named owner?\n          5: Is "{story}" small enough to ship on its own?\n        risk:\n          pass: no\n          6: Does "{story}" need data {part} doesn\'t own?\n          7: Does "{story}" depend on another part\'s release order?\n          8: Could "{story}" fail silently in production?\n        fit:\n          pass: yes\n          9: Does "{story}" match how {part} is meant to be used?\n          10: Would "{story}" survive {part} being replaced later?\n          11: Is "{story}" covered by an existing test today?\n      decisions:\n        severity:\n          pass: [none]\n          12:\n            scale: How risky is "{story}"?\n            levels: [none, high]\n        route:\n          pass: [build-now]\n          13:\n            choice: What should happen to "{story}" next?\n            options: [build-now, rework]\n';
const req = () => {
  const v = validateRequest((readRequestText(LOOP) as { ok: true; value: unknown }).value, 'loop');
  if (!v.ok) throw new Error(v.stops.map((s) => s.text).join('\n'));
  return v.request;
};
const WHO = { adapter: 'stub', model: 'stub-1' };

describe('planSweep + runSweep (the contract loop example)', () => {
  it('2 calls, one per layer, 61 item-questions asked (goal excluded from the count)', async () => {
    const { paths } = tempProject({});
    const plan = planSweep(req(), WHO, paths, false);
    expect(plan.planned.map((p) => p.layer)).toEqual(['part', 'story']);
    expect(plan.planned.every((p) => p.call !== null)).toBe(true);
    // part: 2 probes x 3 items = 6; story: 11 probes (9 concerns + 2 decisions) x 5 items = 55; 6+55 = 61.
    expect(plan.askedQuestions).toBe(61);
    const r = await runSweep({ paths, provider: stubProvider({ yes: () => 0.9 }), env: {} }, 'loop', plan);
    expect(r.ok && Object.keys(r.value.answers)).toContain('goal');
  });

  it('a mid-layer item with a partially-reused question still gets a call for the missing one', async () => {
    const { paths } = tempProject({});
    const provider = stubProvider({ yes: () => 0.9 });
    await runLoop(LOOP, { paths, provider, env: {} });
    // "payments" (mid-list) is fully answered by the first run; retarget one of its questions so only that
    // question is missing on the next plan — the item must still produce a call for the one question.
    const RETARGETED = LOOP.replace('2: Can {part} be deployed without the others?', '2: Can {part} be deployed without the others, unlike before?');
    const v = validateRequest((readRequestText(RETARGETED) as { ok: true; value: unknown }).value, 'loop');
    if (!v.ok) throw new Error(v.stops.map((s) => s.text).join('\n'));
    const plan = planSweep(v.request, WHO, paths, false);
    const partCall = plan.planned.find((p) => p.layer === 'part')!;
    expect(partCall.call).not.toBeNull();
    // Only question 2 (retargeted) is missing for every part item; question 1 stays reused for all of them.
    expect(partCall.call!.questions.map((q) => q.id)).toEqual(['gateway#2', 'payments#2', 'ledger#2']);
    expect(partCall.itemIds).toEqual(['gateway', 'payments', 'ledger']);
    // The story layer is untouched by the retarget: every one of its questions is still reused.
    const storyCall = plan.planned.find((p) => p.layer === 'story')!;
    expect(storyCall.call).toBeNull();
  });

  it('runSweep with zero calls returns costUsd: 0, costEstimated: false, and planNeedsBudget: false', async () => {
    const { paths } = tempProject({});
    const provider = stubProvider({ yes: () => 0.9 });
    await runLoop(LOOP, { paths, provider, env: {} });
    const plan2 = planSweep(req(), WHO, paths, false);
    expect(plan2.planned.every((p) => p.call === null)).toBe(true);
    expect(planNeedsBudget(plan2)).toBe(false); // fix #5a: nothing to ask, so a reached cap must never block this
    const r = await runSweep({ paths, provider, env: {} }, 'loop', plan2);
    expect(r.ok && r.value.costUsd).toBe(0);
    expect(r.ok && r.value.costEstimated).toBe(false);
    expect(provider.calls.length).toBe(2); // only the seeding runLoop call above; runSweep made none
  });

  it('planNeedsBudget: true when any layer still has a call to make', () => {
    const plan = planSweep(req(), WHO, tempProject({}).paths, false);
    expect(plan.planned.some((p) => p.call !== null)).toBe(true);
    expect(planNeedsBudget(plan)).toBe(true);
  });

  it('a second identical sweep reuses every item: no calls, everything free', async () => {
    const { paths } = tempProject({});
    const provider = stubProvider({ yes: () => 0.9 });
    // A real loop.ts run logs each item's answer via record(); seed the ledger with one, then replan.
    await runLoop(LOOP, { paths, provider, env: {} });
    const plan2 = planSweep(req(), WHO, paths, false);
    expect(plan2.planned.every((p) => p.call === null)).toBe(true);
  });

  // Decision 5: the depth cap counts items ASKED, not items listed — reused items are free and don't count
  // against it. validate.ts's checkOver already bounds a loop layer's *listed* item count at the same cap
  // (Task 4), which makes this path unreachable through loop.ts's own validated text pipeline: a layer can
  // never list more than `cap` idea items in the first place. It stays reachable for scan/drill (Task 20/21),
  // whose code layers ("each") aren't counted statically since their item count isn't known until resolve
  // time. So this plants a Request straight into planSweep, bypassing validateRequest, to prove the engine's
  // own cap logic: once enough items are freed up by reuse, the rest still queue past the cap and skip.
  it('items still needing an answer beyond the depth cap are skipped; reuse frees a slot instead of using one', async () => {
    const { paths } = tempProject({});
    const provider = stubProvider({ yes: () => 0.9 });
    const category = { name: 'boundaries', section: 'concerns' as const, pass: 'yes' as const, need: 'all' as const, tags: [], questions: [{ n: 1, kind: 'yesno' as const, text: 'Does {part} own one clear responsibility?' }] };
    const names = Array.from({ length: 15 }, (_, i) => `part${i}`);
    const makeRequest = (over: string[]): Request => ({
      side: { goal: 'The parts are sound', depth: 'quick', where: [], categories: [], layers: [{ name: 'part', categories: [category] }], over: { part: over } },
      wise: null,
    });

    // Seed 3 items (part0-2) as already answered, through the real engine (runSweep alone never writes the
    // ledger — only record()/recordFree(), reached via a verb — so this goes through runLoop's own text form).
    // "boundaries" keeps its original q1 text — that's the only question the later reuse check cares about;
    // the other 2 concerns categories and the decisions just round out the depth: quick (3 x 3) + decisions
    // contract on this, the only (finest), layer.
    const SEED =
      'side:\n  goal: The parts are sound\n  depth: quick\n  over:\n    part: [part0, part1, part2]\n  ask:\n    part:\n      concerns:\n        boundaries:\n          pass: yes\n          1: Does {part} own one clear responsibility?\n          2: Can {part} be deployed alone?\n          3: Does {part} have a single owner?\n        clarity:\n          pass: yes\n          4: Is {part} documented?\n          5: Is {part} easy to test?\n          6: Is {part} loosely coupled?\n        fit:\n          pass: yes\n          7: Does {part} fit the design?\n          8: Would {part} survive a rewrite?\n          9: Is {part} used as intended?\n      decisions:\n        severity:\n          pass: [none]\n          10:\n            scale: How risky is {part}?\n            levels: [none, high]\n        route:\n          pass: [ship]\n          11:\n            choice: What should happen to {part}?\n            options: [ship, rework]\n';
    const seedRun = await runLoop(SEED, { paths, provider, env: {} });
    expect(seedRun.exit).toBe(0);

    // 15 items total, cap 10 (quick): 3 reused for free, 12 need asking — only the first 10 of those fit.
    const plan = planSweep(makeRequest(names), WHO, paths, false);
    const p = plan.planned[0]!;
    expect(p.itemIds).toHaveLength(10);
    expect(p.itemIds[0]).toBe('part3'); // part0-2 were reused, not asked
    expect(p.skipped).toEqual(['part13', 'part14']);
  });
});
