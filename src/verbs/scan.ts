/**
 * scan: "where in this code should we look?" A sweep across code (file, then function, then call), graded the
 * same way loop grades ideas — but read from disk instead of written by the agent. createCodeResolver turns
 * over:'s file pattern into items; planSweep/runSweep do the reuse-aware work, so an unchanged function costs
 * nothing on a later scan. Unlike loop: failing: is worst first (Plan 2a decision 11), passing: and reused:
 * are counts (not lists), and the response carries an extra scanned: {layer: count, ...} line.
 */
import { gradeItems, goalGate, sweepGate, worstFirst } from '../contract/grade.ts';
import { m, type Value } from '../contract/emit.ts';
import type { Category } from '../contract/types.ts';
import { createCodeResolver } from '../evidence/units.ts';
import type { ItemRecord, NewContractRun } from '../ledger/log.ts';
import { actorOf, preflight, record, recordFree } from './pay.ts';
import { loadRequest } from './request.ts';
import { commonNotes, drillNext, dryRunText, respondText, sweepEntry, wiseRecorded } from './respond.ts';
import { planSweep, runSweep } from './sweep.ts';
import type { VerbContext, VerbResult } from './types.ts';

export async function runScan(text: string, ctx: VerbContext): Promise<VerbResult> {
  const loaded = loadRequest(text, 'scan');
  if (!loaded.ok) return loaded.result;
  const { request } = loaded;
  const notes: string[] = [];

  const who = { adapter: ctx.provider.adapter, model: ctx.provider.model };
  const plan = planSweep(request, who, ctx.paths, { resolve: createCodeResolver(ctx.paths.root, notes) });

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

  const swept = await runSweep(ctx, 'scan', plan);
  if (!swept.ok) return swept.result;
  const { answers, costUsd, statusOf } = swept.value;

  // The `?? []`, not a bang-assertion: a layer nobody asked about (like the contract example's `file`) has no
  // entry in side.layers at all, and must still grade as 'none' rather than throw.
  const categoriesOf = (layer: string): readonly Category[] => request.side.layers.find((l) => l.name === layer)?.categories ?? [];
  const grades = gradeItems(plan.items, categoriesOf, statusOf, answers);

  const goalAnswer = answers['goal'] as { kind: 'yesno'; p: number };
  const goalGrade = goalGate(goalAnswer.p);
  const gate = sweepGate(goalGrade, grades);

  const graded = [...grades.values()].filter((g) => g.status === 'asked' || g.status === 'reused');
  const worst = worstFirst(grades.values()); // every failing/unsure item, worst first (Decision 11) — not tree order like loop
  const failing = m(...worst.map((g) => sweepEntry(g)));
  const passing = graded.filter((g) => g.ownGate === 'pass').length;
  const reused = graded.filter((g) => g.status === 'reused').length;
  const scanned = m(...plan.layers.map((l): [string, Value] => [l, plan.items.filter((i) => i.layer === l).length]));

  const calls = plan.planned.filter((p) => p.call !== null).length;

  const items: Record<string, ItemRecord> = {};
  for (const it of plan.items) {
    const g = grades.get(it.id)!;
    items[it.id] = {
      layer: it.layer,
      fill: it.fill,
      ...(it.unit ? { unit: it.unit } : {}),
      status: statusOf(it.id),
      gate: g.gate,
      categories: Object.fromEntries(g.own.map((c) => [c.name, c.gate])),
    };
  }

  const response = (id: string, budget: string): string =>
    respondText(
      m(
        ['id', id],
        ['gate', gate],
        ['goal', m(['gate', goalGrade], ['p', goalAnswer.p])],
        ['scanned', scanned],
        ['failing', failing],
        ['passing', passing],
        ['reused', reused],
      ),
      wiseRecorded(request.wise),
      gate === 'pass' ? 'act on it' : drillNext(id, worst[0]!.id),
      commonNotes([...loaded.notes, ...notes], `${calls} call${calls === 1 ? '' : 's'} · ${plan.askedQuestions} question${plan.askedQuestions === 1 ? '' : 's'} · ${budget}`),
    );

  const run: NewContractRun = {
    verb: 'scan',
    actor: actorOf(ctx),
    task: ctx.env.SIDEWISE_TASK?.trim() || null,
    goal: request.side.goal,
    depth: request.side.depth ?? null,
    where: [],
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
    goalGate: goalGrade,
    goalP: goalAnswer.p,
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
