/**
 * The paid path every classifier verb shares:
 *   preflight: the budget gate and a ledger we can write, BEFORE any call or spend;
 *   askAll:    the calls in order, each answer checked before it is used;
 *   record:    the spend and the run in ONE lock section (recordCall), so budget runs == paid runs + failed records.
 * Nothing is counted when the first call fails. Once a call has been paid, every way out logs it: a later failure
 * or a junk answer becomes a `failed` record in the same lock section as its spend.
 */
import { BudgetError, budgetLine, checkBudget, loadBudget, type BudgetState } from '../budget/budget.ts';
import { providerIdentity } from '../classifier/select.ts';
import type { ClassifierAnswer, ClassifierResult, ClassifierState } from '../classifier/port.ts';
import { toClassifierQuestion, type AskedQuestion } from '../contract/translate.ts';
import type { Answer, Verb } from '../contract/types.ts';
import { LockError, StoreError } from '../ledger/lock.ts';
import { appendContractRun, checkLedger, LedgerError, type ContractRun, type NewContractRun, type TelemetryEntry } from '../ledger/log.ts';
import { recordCall } from '../ledger/record.ts';
import { redact } from '../ledger/redact.ts';
import type { Reusable } from '../ledger/reuse.ts';
import type { VerbContext, VerbResult } from './types.ts';

export interface PlannedCall {
  state: ClassifierState;
  questions: AskedQuestion[];
}

export type Step<T> = { ok: true; value: T } | { ok: false; result: VerbResult };

const NOT_COUNTED = '(the call was NOT counted against the budget)';
const fail = (exit: VerbResult['exit'], text: string): { ok: false; result: VerbResult } => ({ ok: false, result: { exit, text } });
const isStoreFailure = (e: unknown): e is Error => e instanceof LedgerError || e instanceof LockError || e instanceof StoreError;
const isProbability = (p: unknown): p is number => typeof p === 'number' && p >= 0 && p <= 1; // NaN fails both

/** A reported cost we can add up: finite and not negative. Anything else counts as not reported. */
const usableCost = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : undefined);

/** One short line from whatever a provider threw (an Error, a string, a many-line HTML body). Redacted before
 *  truncation: a provider error can echo back request headers or config, so this is the one place every
 *  caller (the first-call-failure stop, and logFailed's reason, which also flows into the ledger) is guaranteed
 *  to have already run through redact() before the text can reach a VerbResult a caller prints to stderr. */
export function oneLine(e: unknown): string {
  const text = redact((e instanceof Error ? e.message : String(e)).split('\n')[0]!.trim());
  return text.length > 200 ? `${text.slice(0, 199)}…` : text;
}

export const actorOf = (ctx: VerbContext): string => ctx.env.MM3_ACTOR?.trim() || 'agent';

/** Splits a keyed question list into what the ledger already answered (merged straight into `answers`/
 *  `reusedFrom`, for free) and the pairs still left to actually ask — class.ts and drill's one-subject shape
 *  both build a call from exactly this split. */
export function splitReuse<Q extends AskedQuestion>(
  keyed: readonly (readonly [Q, string])[],
  reused: ReadonlyMap<string, Reusable>,
  answers: Record<string, Answer>,
  reusedFrom: Record<string, string>,
): (readonly [Q, string])[] {
  const toAsk: (readonly [Q, string])[] = [];
  for (const [q, k] of keyed) {
    const hit = reused.get(k);
    if (hit) {
      answers[q.id] = hit.answer;
      reusedFrom[q.id] = hit.id;
    } else {
      toAsk.push([q, k]);
    }
  }
  return toAsk;
}

function notCounted(e: unknown): { ok: false; result: VerbResult } {
  if (e instanceof BudgetError) return fail(3, `${e.message} ${NOT_COUNTED}`);
  if (isStoreFailure(e)) return fail(1, `${e.message} ${NOT_COUNTED}`);
  throw e;
}

/** A missing budget file is created with defaults, and the answer says so — once, on whichever run's
 * preflight finds it missing (loadBudget creates it right there; every verb threads preflight's own `created`
 * back into that same run's notes: — see commonNotes' callers). */
export function createdNote(state: BudgetState): string {
  return `budget file created with defaults ($${state.capUsd.toFixed(2)} · ${state.capRuns} runs)`;
}

/** Before any call: a budget with room, and a ledger that reads cleanly and can be written.
 *  `needsBudget: false` (the caller already knows every answer will be reused, so this run will spend
 *  nothing) skips only the cap check — a fully-reused run must never be blocked by a cap it will never touch.
 *  The budget file is still loaded/created and the ledger still checked either way: a free run still writes a
 *  line. Defaults to true, so every other call site's behavior is unchanged. */
export function preflight(ctx: VerbContext, opts: { needsBudget?: boolean } = {}): Step<{ state: BudgetState; created: boolean }> {
  const now = ctx.now ?? Date.now;
  let budget: { state: BudgetState; created: boolean };
  try {
    budget = loadBudget(ctx.paths, now());
  } catch (e) {
    if (e instanceof BudgetError) return fail(3, e.message);
    if (isStoreFailure(e)) return fail(1, e.message);
    throw e;
  }
  if (opts.needsBudget ?? true) {
    const gate = checkBudget(budget.state);
    if (!gate.ok) return fail(3, gate.message);
  }
  try {
    checkLedger(ctx.paths);
  } catch (e) {
    if (isStoreFailure(e)) return fail(1, e.message);
    throw e;
  }
  return { ok: true, value: budget };
}

function toAnswer(q: AskedQuestion, a: ClassifierAnswer | undefined): Answer {
  const what = q.n === null ? 'the goal' : q.item !== undefined ? `question ${q.n} for ${q.item}` : `question ${q.n}`;
  if (q.kind === 'yesno') {
    if (!a || a.type !== 'noul') throw new Error(`no yes/no answer for ${what}`);
    if (!isProbability(a.probability)) throw new Error(`${what} probability ${a.probability} is not between 0 and 1`);
    return { kind: 'yesno', p: a.probability };
  }
  let dist: Record<string, number>;
  if (q.kind === 'scale') {
    if (!a || a.type !== 'score' || !Array.isArray(a.distribution)) throw new Error(`no scale answer for ${what}`);
    dist = Object.fromEntries((q.levels ?? []).map((l, i) => [l, a.distribution[i] ?? 0]));
  } else {
    if (!a || a.type !== 'choice' || !a.probabilities || typeof a.probabilities !== 'object') throw new Error(`no choice answer for ${what}`);
    dist = Object.fromEntries((q.options ?? []).map((o) => [o, a.probabilities[o] ?? 0]));
  }
  const bad = Object.values(dist).find((v) => !isProbability(v));
  if (bad !== undefined) throw new Error(`${what} has a probability ${bad} that is not between 0 and 1`);
  return { kind: q.kind, dist };
}

function readAnswers(questions: readonly AskedQuestion[], result: unknown): Record<string, Answer> {
  const raw = (result as Partial<ClassifierResult> | null | undefined)?.answers;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('the provider returned no answers');
  return Object.fromEntries(questions.map((q) => [q.id, toAnswer(q, (raw as Record<string, ClassifierAnswer>)[q.id])]));
}

/** Logs a paid call whose run can't be completed; the spend and the failed record share one lock section. */
function logFailed(ctx: VerbContext, verb: Verb, costUsd: number | undefined, reason: string): { ok: false; result: VerbResult } {
  const now = ctx.now ?? Date.now;
  try {
    recordCall(ctx.paths, costUsd ?? 0, { failed: { verb, actor: actorOf(ctx), adapter: ctx.provider.adapter, model: ctx.provider.model, costUsd: costUsd ?? null, reason } }, now());
  } catch (e) {
    return notCounted(e);
  }
  return fail(1, `✖ classifier: ${reason} → retry; the call was counted against the budget`);
}

/** One provider call's own telemetry (plan 2c B2) — `latencyMs` measured locally around the call, never trusted
 *  from the provider; `retries`/`baseURL` come along for free from what this call site already has (an
 *  `identity` lookup every verb already does before calling askAll — cheap and pure, no extra I/O). */
function telemetryOf(model: string, identity: { baseURL: string | null }, call: PlannedCall, result: ClassifierResult, latencyMs: number): TelemetryEntry {
  // The call itself didn't throw (that's askAll's own catch, above), but a rehearsal/fake/broken provider can
  // still return junk (null, a bare string, a shape missing `usage`) — readAnswers is what actually validates
  // the answer shape, AFTER this runs, so every field here must tolerate `result` being anything.
  const r = (result ?? {}) as Partial<ClassifierResult>;
  return {
    source: 'provider',
    model,
    ...(identity.baseURL !== null ? { baseURL: identity.baseURL } : {}),
    questions: call.questions.length,
    ...(r.usage?.inputTokens !== undefined ? { inputTokens: r.usage.inputTokens } : {}),
    ...(r.usage?.outputTokens !== undefined ? { outputTokens: r.usage.outputTokens } : {}),
    latencyMs,
    ...(r.retries !== undefined ? { retries: r.retries } : {}),
    status: 'ok',
    evidenceBytes: Buffer.byteLength(JSON.stringify(call.state)),
    ...(usableCost(r.costUsd) !== undefined ? { costUsd: usableCost(r.costUsd) } : {}),
    ...(r.costEstimated ? { costEstimated: true } : {}),
  };
}

/** The calls in order. Answers are merged by question id; the cost is their sum, or undefined if any call didn't
 *  report one. `costEstimated` is true when ANY summed call's cost came from a token-based estimate
 *  (typesafe/answers.ts) rather than the provider's own reported figure, so the total can be marked as such.
 *  `telemetry` (plan 2c B2): one entry per call actually made — never per reused answer (see ledger/reuse.ts for
 *  the separate `source: 'cache'` shape, not built here). */
export async function askAll(
  ctx: VerbContext,
  verb: Verb,
  calls: readonly PlannedCall[],
): Promise<Step<{ answers: Record<string, Answer>; costUsd: number | undefined; costEstimated: boolean; telemetry: TelemetryEntry[] }>> {
  const answers: Record<string, Answer> = {};
  let costUsd: number | undefined = 0;
  let costEstimated = false;
  let paid = 0;
  const telemetry: TelemetryEntry[] = [];
  const identity = providerIdentity(ctx.env, { resolveStored: ctx.resolveStored });
  for (const [i, call] of calls.entries()) {
    let result: ClassifierResult;
    const startedAt = Date.now();
    try {
      result = await ctx.provider.ask(call.questions.map(toClassifierQuestion), call.state);
    } catch (e) {
      if (paid === 0) return fail(1, `✖ classifier: ${oneLine(e)} → retry later, or set MM3_PROVIDER=fake to check the request`);
      return logFailed(ctx, verb, costUsd, `call ${i + 1} of ${calls.length}: ${oneLine(e)}`);
    }
    const latencyMs = Date.now() - startedAt;
    paid += 1;
    const c = usableCost((result as Partial<ClassifierResult> | null | undefined)?.costUsd);
    costUsd = costUsd === undefined || c === undefined ? undefined : costUsd + c;
    if (c !== undefined && (result as Partial<ClassifierResult> | null | undefined)?.costEstimated) costEstimated = true;
    telemetry.push(telemetryOf(ctx.provider.model, identity, call, result, latencyMs));
    try {
      Object.assign(answers, readAnswers(call.questions, result));
    } catch (e) {
      return logFailed(ctx, verb, costUsd, (e as Error).message);
    }
  }
  return { ok: true, value: { answers, costUsd, costEstimated, telemetry } };
}

/** A paid run: its spend and its ledger line in one lock section. */
export function record(ctx: VerbContext, costUsd: number | undefined, run: NewContractRun): Step<{ run: ContractRun; budget: BudgetState }> {
  const now = ctx.now ?? Date.now;
  try {
    const { record: saved, budget } = recordCall(ctx.paths, costUsd ?? 0, { contract: run }, now());
    return { ok: true, value: { run: saved, budget } };
  } catch (e) {
    return notCounted(e);
  }
}

/** A run that made no call (every answer reused): logged, not spent. The budget is read before the lock (never nested). */
export function recordFree(ctx: VerbContext, run: NewContractRun): Step<{ run: ContractRun }> {
  const now = ctx.now ?? Date.now;
  try {
    const budget = loadBudget(ctx.paths, now()).state;
    return { ok: true, value: { run: appendContractRun(ctx.paths, run, now(), budgetLine(budget)) } };
  } catch (e) {
    if (e instanceof BudgetError) return fail(3, e.message);
    if (isStoreFailure(e)) return fail(1, e.message);
    throw e;
  }
}
