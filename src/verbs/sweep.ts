/**
 * The shared sweep engine (contract "How it becomes TypeSafe calls": a sweep = one call per layer). Used by
 * loop (idea items, no resolver) and, later, scan and drill (code items, via a Resolver). Two phases:
 *   planSweep: expand over: into items, decide per item — reused (free), skipped (over the depth cap) or asked
 *     (its missing questions go into that layer's one call) — with a single batched ledger lookup. Pure: no
 *     calls, no spend.
 *   runSweep: pay for whatever planSweep queued (askAll), and merge with the answers already resolved for free.
 * The goal question rides on the first layer that ends up with a call; if its own answer is reused, it never
 * needs one at all. A skipped item is graded 'unsure': none of its questions are asked or
 * pulled from reuse, so it never shows up half-answered.
 * sweepDryRun/recordSweep are the two bits of a sweep verb's own wiring (its --dry-run reply and its
 * paid/free ledger epilogue) that don't vary by verb at all — loop, scan and drill share them verbatim.
 */
import { DEPTH_COUNT } from '../contract/types.ts';
import type { Answer, Request, Verb } from '../contract/types.ts';
import { expand, type ExpandOptions, type Item } from '../contract/layers.ts';
import { answerKey, goalQuestion, itemQuestions, itemsState, type AskedQuestion } from '../contract/translate.ts';
import type { ItemStatus } from '../contract/grade.ts';
import type { ClassifierState } from '../classifier/port.ts';
import type { NewContractRun } from '../ledger/log.ts';
import { redact } from '../ledger/redact.ts';
import { lookupAnswers, type Who } from '../ledger/reuse.ts';
import type { SidewisePaths } from '../ledger/paths.ts';
import { askAll, record, recordFree, type PlannedCall, type Step } from './pay.ts';
import { dryRunText } from './respond.ts';
import type { VerbContext, VerbResult } from './types.ts';

interface PlannedLayer {
  layer: string;
  call: PlannedCall | null;
  /** Items this layer's call asks about (pushed into state.items), in item order. */
  itemIds: string[];
  /** Items over the depth cap this layer: not asked, not reused. */
  skipped: string[];
}

interface SweepPlan {
  /** Every layer expand() found (including layers with no ask: entry). */
  layers: string[];
  /** Every item, parents before children. */
  items: Item[];
  /** One entry per asked layer (request.side.layers order), call: null when nothing to ask there. */
  planned: PlannedLayer[];
  /** Question id -> its answer key (translate.ts answerKey), for every question resolved (asked or reused). */
  keys: Map<string, string>;
  /** Question id -> the run whose answer was reused for it. */
  reusedFrom: Map<string, string>;
  /** Every reused answer, already resolved (merged with the asked answers by runSweep). */
  answers: Record<string, Answer>;
  /** Item questions actually placed into a call; the goal is never counted here. */
  askedQuestions: number;
}

interface LayerAsk {
  q: AskedQuestion;
  key: string;
}

interface LayerWork {
  layer: string;
  callItems: Item[];
  callQuestions: AskedQuestion[];
  itemIds: string[];
  skipped: string[];
}

/** Groups items by .layer, preserving relative order. */
function groupByLayer(items: readonly Item[]): Map<string, Item[]> {
  const out = new Map<string, Item[]>();
  for (const it of items) {
    const arr = out.get(it.layer);
    if (arr) arr.push(it);
    else out.set(it.layer, [it]);
  }
  return out;
}

/**
 * planSweep(request, who, paths, dryRun, opts) — pure except for the one batched ledger read (lookupAnswers).
 * No resolver: loop's over: is always plain arrays (checkOver's 'none' rule), so expand never needs one.
 * `dryRun`: threaded into lookupAnswers as `readOnly` — a sweep verb's --dry-run reply (sweepDryRun) is built
 * from THIS plan, so a plan built for a dry run must never persist a catch-up/rebuild of index.db to disk
 * (design binding "dry runs and free reads write nothing"); a real run's plan self-heals as before.
 */
export function planSweep(request: Request, who: Who, paths: SidewisePaths, dryRun: boolean, opts: ExpandOptions = {}): SweepPlan {
  const { layers, items } = expand(request.side.over!, opts);
  const itemsByLayer = groupByLayer(items);

  // Pass 1: every ask, flat, grouped by item so pass 2 can look a whole item's asks up at once.
  const asksByItem = new Map<string, LayerAsk[]>();
  const allKeys: string[] = [];
  for (const layer of request.side.layers) {
    for (const item of itemsByLayer.get(layer.name) ?? []) {
      const asks = itemQuestions(item, layer.categories).map((q) => ({ q, key: answerKey(item.text, q) }));
      asksByItem.set(item.id, asks);
      for (const a of asks) allKeys.push(a.key);
    }
  }
  const goalQ = goalQuestion(request.side.goal);
  const goalKey = answerKey('', goalQ);
  allKeys.push(goalKey);

  // One lookup for every key collected above — not one per item.
  const reused = lookupAnswers(paths, who, allKeys, { readOnly: dryRun });

  const cap = DEPTH_COUNT[request.side.depth ?? 'quick'];
  const keys = new Map<string, string>();
  const reusedFrom = new Map<string, string>();
  const answers: Record<string, Answer> = {};
  let askedQuestions = 0;

  // Pass 2: decide status per item, respecting the layer's depth cap, without yet placing the goal.
  const work: LayerWork[] = request.side.layers.map((layer) => {
    let askedCount = 0;
    const callItems: Item[] = [];
    const callQuestions: AskedQuestion[] = [];
    const itemIds: string[] = [];
    const skipped: string[] = [];
    for (const item of itemsByLayer.get(layer.name) ?? []) {
      const itemAsks = asksByItem.get(item.id) ?? [];
      if (!itemAsks.length) continue; // this layer has no categories: status stays 'none'
      const missing = itemAsks.filter((a) => !reused.has(a.key));
      if (missing.length === 0) {
        for (const a of itemAsks) {
          const hit = reused.get(a.key)!;
          reusedFrom.set(a.q.id, hit.id);
          keys.set(a.q.id, a.key);
          answers[a.q.id] = hit.answer;
        }
      } else if (askedCount >= cap) {
        skipped.push(item.id);
      } else {
        askedCount += 1;
        callItems.push(item);
        itemIds.push(item.id);
        for (const a of itemAsks) {
          keys.set(a.q.id, a.key);
          const hit = reused.get(a.key);
          if (hit) {
            reusedFrom.set(a.q.id, hit.id);
            answers[a.q.id] = hit.answer;
          } else {
            callQuestions.push(a.q);
            askedQuestions += 1;
          }
        }
      }
    }
    return { layer: layer.name, callItems, callQuestions, itemIds, skipped };
  });

  // The goal: one reuse key for the whole run, resolved once. Unreused, it rides the first layer (in order):
  // that layer either already has item questions (the goal joins them) or gets a call just to carry the goal.
  const goalHit = reused.get(goalKey);
  if (goalHit) {
    reusedFrom.set(goalQ.id, goalHit.id);
    keys.set(goalQ.id, goalKey);
    answers[goalQ.id] = goalHit.answer;
  } else {
    const first = work[0];
    if (first) {
      first.callQuestions = [goalQ, ...first.callQuestions];
      keys.set(goalQ.id, goalKey);
    }
  }

  const planned: PlannedLayer[] = work.map(({ layer, callItems, callQuestions, itemIds, skipped }) => {
    if (!callQuestions.length) return { layer, call: null, itemIds, skipped };
    const notes: string[] = []; // truncation notes from itemsState: not surfaced by this engine (SweepPlan carries none)
    const hasGoal = callQuestions[0] === goalQ;
    const state: ClassifierState = { ...(hasGoal ? { goal: redact(request.side.goal) } : {}), items: itemsState(callItems, notes) };
    return { layer, call: { state, questions: callQuestions }, itemIds, skipped };
  });

  return { layers, items, planned, keys, reusedFrom, answers, askedQuestions };
}

/** Whether a real run of this plan would make any call at all — the one thing preflight's own budget
 *  cap check needs to know before it runs, so a fully-reused sweep (every layer's call: null) is never blocked
 *  by an already-reached cap it will never touch. Pass as `preflight(ctx, { needsBudget: planNeedsBudget(plan) })`. */
export function planNeedsBudget(plan: SweepPlan): boolean {
  return plan.planned.some((p) => p.call !== null);
}

/** runSweep(ctx, verb, plan): pays for whatever planSweep queued, merged with the answers already free. */
export async function runSweep(
  ctx: VerbContext,
  verb: Verb,
  plan: SweepPlan,
): Promise<Step<{ answers: Record<string, Answer>; costUsd: number | undefined; costEstimated: boolean; statusOf: (id: string) => ItemStatus }>> {
  const skippedIds = new Set(plan.planned.flatMap((p) => p.skipped));
  const askedIds = new Set(plan.planned.flatMap((p) => p.itemIds));
  const reusedItemIds = new Set<string>();
  for (const qid of plan.reusedFrom.keys()) {
    const at = qid.lastIndexOf('#');
    if (at > 0) reusedItemIds.add(qid.slice(0, at));
  }
  const statusOf = (id: string): ItemStatus => {
    if (skippedIds.has(id)) return 'skipped';
    if (askedIds.has(id)) return 'asked';
    if (reusedItemIds.has(id)) return 'reused';
    return 'none';
  };

  const calls = plan.planned.map((p) => p.call).filter((c): c is PlannedCall => c !== null);
  if (calls.length === 0) return { ok: true, value: { answers: plan.answers, costUsd: 0, costEstimated: false, statusOf } };

  const asked = await askAll(ctx, verb, calls);
  if (!asked.ok) return asked;
  return { ok: true, value: { answers: { ...plan.answers, ...asked.value.answers }, costUsd: asked.value.costUsd, costEstimated: asked.value.costEstimated, statusOf } };
}

/** A sweep verb's --dry-run reply: validate, expand and count; no call, no spend. `identity` is P2's route/base
 *  URL (providerIdentity(ctx.env)) — the only thing beyond the plan itself this needs. */
export function sweepDryRun(plan: SweepPlan, identity: { route: string; baseURL: string | null }): VerbResult {
  const calls = plan.planned.filter((p) => p.call !== null).length;
  const askedItems = plan.planned.reduce((n, p) => n + p.itemIds.length, 0);
  const skippedItems = plan.planned.reduce((n, p) => n + p.skipped.length, 0);
  return {
    exit: 0,
    text: dryRunText({
      calls,
      questions: plan.askedQuestions,
      items: plan.items.length,
      reused: plan.items.length - askedItems - skippedItems,
      route: identity.route,
      baseURL: identity.baseURL,
    }),
  };
}

/** A sweep verb's epilogue: log the run — free when it made no call, paid otherwise — and answer with its response. */
export function recordSweep(ctx: VerbContext, calls: number, costUsd: number | undefined, run: NewContractRun): VerbResult {
  const rec = calls === 0 ? recordFree(ctx, run) : record(ctx, costUsd, run);
  if (!rec.ok) return rec.result;
  return { exit: 0, text: rec.value.run.response, run: rec.value.run };
}
