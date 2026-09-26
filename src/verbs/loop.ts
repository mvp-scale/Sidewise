/**
 * loop: "does this idea hold up?" A sweep of ideas the agent wrote itself (a design, a plan, a feature), graded
 * the same way scan grades code. No evidence to read (over: is plain arrays, never a resolver), so this is
 * mostly wiring: planSweep/runSweep do the reuse-aware work; loop grades, orders (tree order — Plan 2a decision
 * 11, unlike scan/drill's worst-first) and responds.
 */
import { gradeItems, goalGate, sweepGate, worstFirst } from '../contract/grade.ts';
import { m } from '../contract/emit.ts';
import type { Category } from '../contract/types.ts';
import type { ItemRecord, NewContractRun } from '../ledger/log.ts';
import { actorOf, preflight, record, recordFree } from './pay.ts';
import { loadRequest } from './request.ts';
import { commonNotes, drillNext, dryRunText, respondText, sweepEntry, wiseRecorded } from './respond.ts';
import { planSweep, runSweep } from './sweep.ts';
import type { VerbContext, VerbResult } from './types.ts';

export async function runLoop(text: string, ctx: VerbContext): Promise<VerbResult> {
  const loaded = loadRequest(text, 'loop');
  if (!loaded.ok) return loaded.result;
  const { request } = loaded;

  const who = { adapter: ctx.provider.adapter, model: ctx.provider.model };
  const plan = planSweep(request, who, ctx.paths);

  if (ctx.dryRun) {
    const calls = plan.planned.filter((p) => p.call).length;
    const askedItems = plan.planned.reduce((n, p) => n + p.itemIds.length, 0);
    const skippedItems = plan.planned.reduce((n, p) => n + p.skipped.length, 0);
    return {
      exit: 0,
      text: dryRunText({ calls, questions: plan.askedQuestions, items: plan.items.length, reused: plan.items.length - askedItems - skippedItems }),
    };
  }

  const pre = preflight(ctx);
  if (!pre.ok) return pre.result;

  const ran = await runSweep(ctx, 'loop', plan);
  if (!ran.ok) return ran.result;
  const { answers, costUsd, statusOf } = ran.value;

  const categoriesOf = (layer: string): readonly Category[] => request.side.layers.find((l) => l.name === layer)!.categories;
  const grades = gradeItems(plan.items, categoriesOf, statusOf, answers);

  const goalAnswer = answers['goal'] as { kind: 'yesno'; p: number } | undefined;
  const goal = goalAnswer ? goalGate(goalAnswer.p) : 'pass'; // vacuous: the goal is always present, reused or asked
  const gate = sweepGate(goal, grades);

  // Tree order (Decision 11), not worst-first: failing: and passing: read in the order the request was written.
  const failingIds = plan.items.filter((i) => grades.get(i.id)!.ownGate !== 'pass').map((i) => i.id);
  const failing = m(...failingIds.map((id) => sweepEntry(grades.get(id)!)));
  const passing = plan.items.filter((i) => grades.get(i.id)!.gate === 'pass').map((i) => i.id);

  // worstFirst only picks drill's target; failing: above stays in tree order regardless.
  const worst = worstFirst([...grades.values()])[0];

  const calls = plan.planned.filter((p) => p.call).length;

  const items: Record<string, ItemRecord> = {};
  for (const it of plan.items) {
    const g = grades.get(it.id)!;
    items[it.id] = {
      layer: it.layer,
      fill: it.fill,
      ...(it.unit ? { unit: it.unit } : {}),
      status: g.status,
      gate: g.gate,
      categories: Object.fromEntries(g.own.map((c) => [c.name, c.gate])),
    };
  }

  const response = (id: string, budget: string): string =>
    respondText(
      m(['id', id], ['gate', gate], ['goal', m(['gate', goal], ['p', goalAnswer?.p ?? 0])], ['failing', failing], ['passing', passing]),
      wiseRecorded(request.wise),
      gate === 'pass' ? 'act on it' : drillNext(id, worst!.id),
      commonNotes(loaded.notes, `${calls} call${calls === 1 ? '' : 's'} · ${plan.askedQuestions} question${plan.askedQuestions === 1 ? '' : 's'} · ${budget}`),
    );

  const run: NewContractRun = {
    verb: 'loop',
    actor: actorOf(ctx),
    task: ctx.env.SIDEWISE_TASK?.trim() || null,
    goal: request.side.goal,
    depth: request.side.depth ?? null,
    where: request.side.where,
    parent: null,
    from: null,
    compare: null,
    wise: request.wise,
    ask: { categories: [], layers: request.side.layers },
    over: request.side.over!,
    items,
    answers,
    keys: Object.fromEntries(plan.keys),
    reusedFrom: Object.fromEntries(plan.reusedFrom),
    categories: {},
    gate,
    goalGate: goal,
    goalP: goalAnswer?.p ?? null,
    consensus: null,
    response,
    notes: [],
    adapter: ctx.provider.adapter,
    model: ctx.provider.model,
    costUsd: costUsd ?? null,
    calls,
  };

  const rec = calls === 0 ? recordFree(ctx, run) : record(ctx, costUsd, run);
  if (!rec.ok) return rec.result;
  return { exit: 0, text: rec.value.run.response, run: rec.value.run };
}
