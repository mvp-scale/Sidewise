/**
 * scan: "where in this code should we look?" A sweep across code (file, then function, then call), graded the
 * same way loop grades ideas — but read from disk instead of written by the agent. createCodeResolver turns
 * over:'s file pattern into items; planSweep/runSweep do the reuse-aware work, so an unchanged function costs
 * nothing on a later scan. Unlike loop: failing: is worst first (Plan 2a decision 11), passing: and reused:
 * are counts (not lists), and the response carries an extra scanned: {layer: count, ...} line.
 */
import { providerIdentity } from '../classifier/select.ts';
import { gradeItems, goalGate, sweepGate, worstFirst } from '../contract/grade.ts';
import { m, type Value } from '../contract/emit.ts';
import type { Category } from '../contract/types.ts';
import { expandGlob } from '../evidence/glob.ts';
import { createCodeResolver } from '../evidence/units.ts';
import type { ItemRecord, NewContractRun } from '../ledger/log.ts';
import { actorOf, createdNote, preflight } from './pay.ts';
import { loadRequest } from './request.ts';
import { commonNotes, COST_ESTIMATED_NOTE, respondText, sweepEntry, sweepNext, wiseRecorded } from './respond.ts';
import { planNeedsBudget, planSweep, recordSweep, runSweep, sweepDryRun } from './sweep.ts';
import type { VerbContext, VerbResult } from './types.ts';

// Fix #17: a scan only ever looks at what over: names — nothing says so if that misses the file most likely
// to matter. A short, fixed list (never grown per-project, never a stop): a real entrypoint or config file
// outside every over: pattern is worth a note, not silence.
const ENTRYPOINT_GLOBS = ['server.js', 'app.js', 'index.js', 'main.js', 'config/**', '.env*'];

/** Entrypoint/config files that exist in the project but were never one of this scan's own items (at any
 *  layer — unit.path is the same original file path all the way down file -> function -> call). undefined
 *  when there's nothing to say. */
function unlookedEntrypoints(root: string, items: readonly { unit?: { path: string } }[]): string | undefined {
  const touched = new Set(items.flatMap((i) => (i.unit ? [i.unit.path] : [])));
  const missed = [...new Set(ENTRYPOINT_GLOBS.flatMap((pattern) => expandGlob(root, pattern).files))].filter((f) => !touched.has(f));
  if (!missed.length) return undefined;
  return `entrypoints/config outside over: ${missed.join(', ')} — add them to over: file if they matter here`;
}

export async function runScan(text: string, ctx: VerbContext): Promise<VerbResult> {
  const loaded = loadRequest(text, 'scan');
  if (!loaded.ok) return loaded.result;
  const { request } = loaded;
  const notes: string[] = [];

  const who = { adapter: ctx.provider.adapter, model: ctx.provider.model };
  const identity = providerIdentity(ctx.env);
  const plan = planSweep(request, who, ctx.paths, ctx.dryRun ?? false, { resolve: createCodeResolver(ctx.paths.root, notes) });

  if (ctx.dryRun) return sweepDryRun(plan, identity);

  const entrypointNote = unlookedEntrypoints(ctx.paths.root, plan.items);
  if (entrypointNote) notes.push(entrypointNote);

  // Fix #5a: a fully-reused scan (every layer's call: null) must never be blocked by an already-reached cap.
  const pre = preflight(ctx, { needsBudget: planNeedsBudget(plan) });
  if (!pre.ok) return pre.result;

  const swept = await runSweep(ctx, 'scan', plan);
  if (!swept.ok) return swept.result;
  const { answers, costUsd, costEstimated, statusOf } = swept.value;

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
      sweepNext(id, gate, worst, graded, 'act on it'),
      commonNotes(
        [...loaded.notes, ...notes, ...(pre.value.created ? [createdNote(pre.value.state)] : []), ...(costEstimated ? [COST_ESTIMATED_NOTE] : [])],
        `${calls} call${calls === 1 ? '' : 's'} · ${plan.askedQuestions} question${plan.askedQuestions === 1 ? '' : 's'} · ${budget}`,
        ctx.provider.adapter,
      ),
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
    route: identity.route,
    baseURL: identity.baseURL,
  };

  return recordSweep(ctx, calls, costUsd, run);
}
