/**
 * loop: "does this idea hold up?" A sweep of ideas the agent wrote itself (a design, a plan, a feature), graded
 * the same way scan grades code. No evidence to read (over: is plain arrays, never a resolver), so this is
 * mostly wiring: planSweep/runSweep do the reuse-aware work; loop grades, orders (tree order, unlike
 * scan/drill's worst-first) and responds.
 */
import { providerIdentity } from '../classifier/select.ts';
import { gradeItems, goalGate, sweepGate, worstFirst } from '../contract/grade.ts';
import { m } from '../contract/emit.ts';
import type { Category } from '../contract/types.ts';
import type { NewContractRun } from '../ledger/log.ts';
import { actorOf, createdNote, preflight } from './pay.ts';
import { loadRequest } from './request.ts';
import { commonNotes, COST_ESTIMATED_NOTE, probeWarnings, respondText, sweepEntry, sweepNext, wiseRecorded } from './respond.ts';
import { itemRecords, planNeedsBudget, planSweep, recordSweep, runSweep, sweepDryRun } from './sweep.ts';
import type { VerbContext, VerbResult } from './types.ts';

export async function runLoop(text: string, ctx: VerbContext): Promise<VerbResult> {
  const loaded = loadRequest(text, 'loop');
  if (!loaded.ok) return loaded.result;
  const { request } = loaded;

  const who = { adapter: ctx.provider.adapter, model: ctx.provider.model };
  const identity = providerIdentity(ctx.env);
  const plan = planSweep(request, who, ctx.paths, ctx.dryRun ?? false);

  if (ctx.dryRun) return sweepDryRun(plan, identity, probeWarnings(request.side));

  // A fully-reused loop (every layer's call: null) must never be blocked by an already-reached cap.
  const pre = preflight(ctx, { needsBudget: planNeedsBudget(plan) });
  if (!pre.ok) return pre.result;

  const ran = await runSweep(ctx, 'loop', plan);
  if (!ran.ok) return ran.result;
  const { answers, costUsd, costEstimated, statusOf } = ran.value;

  const categoriesOf = (layer: string): readonly Category[] => request.side.layers.find((l) => l.name === layer)!.categories;
  const grades = gradeItems(plan.items, categoriesOf, statusOf, answers);

  const goalAnswer = answers['goal'] as { kind: 'yesno'; p: number } | undefined;
  const goal = goalAnswer ? goalGate(goalAnswer.p) : 'pass'; // vacuous: the goal is always present, reused or asked
  const gate = sweepGate(goal, grades);

  // Tree order, not worst-first: failing: and passing: read in the order the request was written.
  const failingIds = plan.items.filter((i) => grades.get(i.id)!.ownGate !== 'pass').map((i) => i.id);
  const failing = m(...failingIds.map((id) => sweepEntry(grades.get(id)!)));
  const passing = plan.items.filter((i) => grades.get(i.id)!.gate === 'pass').map((i) => i.id);

  // worstFirst only picks drill's target; failing: above stays in tree order regardless.
  const graded = [...grades.values()].filter((g) => g.status === 'asked' || g.status === 'reused');
  const worst = worstFirst(graded);

  const calls = plan.planned.filter((p) => p.call).length;

  const items = itemRecords(plan.items, grades);

  const response = (id: string, budget: string): string =>
    respondText(
      m(['id', id], ['gate', gate], ['goal', m(['gate', goal], ['p', goalAnswer?.p ?? 0])], ['failing', failing], ['passing', passing]),
      wiseRecorded(request.wise),
      sweepNext(id, gate, worst, graded, 'act on it'),
      commonNotes(
        [...loaded.notes, ...(pre.value.created ? [createdNote(pre.value.state)] : []), ...(costEstimated ? [COST_ESTIMATED_NOTE] : [])],
        `${calls} call${calls === 1 ? '' : 's'} · ${plan.askedQuestions} question${plan.askedQuestions === 1 ? '' : 's'} · ${budget}`,
        ctx.provider.adapter,
      ),
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
    route: identity.route,
    baseURL: identity.baseURL,
  };

  return recordSweep(ctx, calls, costUsd, run);
}
