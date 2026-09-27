/**
 * The paid path every classifier verb shares:
 *   preflight: the budget gate and a ledger we can write, BEFORE any call or spend;
 *   askAll:    the calls in order, each answer checked before it is used;
 *   record:    the spend and the run in ONE lock section (recordCall), so budget runs == paid runs + failed records.
 * Nothing is counted when the first call fails. Once a call has been paid, every way out logs it: a later failure
 * or a junk answer becomes a `failed` record in the same lock section as its spend.
 */
import { BudgetError, budgetLine, checkBudget, loadBudget, type BudgetState } from '../budget/budget.ts';
import type { ClassifierAnswer, ClassifierResult, ClassifierState } from '../classifier/port.ts';
import { toClassifierQuestion, type AskedQuestion } from '../contract/translate.ts';
import type { Answer, Verb } from '../contract/types.ts';
import { LockError, StoreError } from '../ledger/lock.ts';
import { appendContractRun, checkLedger, LedgerError, type ContractRun, type NewContractRun } from '../ledger/log.ts';
import { recordCall } from '../ledger/record.ts';
import { redact } from '../ledger/redact.ts';
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
 *  truncation (P6): a provider error can echo back request headers or config, so this is the one place every
 *  caller (the first-call-failure stop, and logFailed's reason, which also flows into the ledger) is guaranteed
 *  to have already run through redact() before the text can reach a VerbResult a caller prints to stderr. */
export function oneLine(e: unknown): string {
  const text = redact((e instanceof Error ? e.message : String(e)).split('\n')[0]!.trim());
  return text.length > 200 ? `${text.slice(0, 199)}…` : text;
}

export const actorOf = (ctx: VerbContext): string => ctx.env.SIDEWISE_ACTOR?.trim() || 'agent';

function notCounted(e: unknown): { ok: false; result: VerbResult } {
  if (e instanceof BudgetError) return fail(3, `${e.message} ${NOT_COUNTED}`);
  if (isStoreFailure(e)) return fail(1, `${e.message} ${NOT_COUNTED}`);
  throw e;
}

/** BRIEF §5: a missing budget file is created with defaults, "and the answer says so" — once, on whichever run's
 * preflight finds it missing (loadBudget creates it right there; every verb threads preflight's own `created`
 * back into that same run's notes: — see commonNotes' callers). */
export function createdNote(state: BudgetState): string {
  return `budget file created with defaults ($${state.capUsd.toFixed(2)} · ${state.capRuns} runs)`;
}

/** Before any call: a budget with room, and a ledger that reads cleanly and can be written. */
export function preflight(ctx: VerbContext): Step<{ state: BudgetState; created: boolean }> {
  const now = ctx.now ?? Date.now;
  let budget: { state: BudgetState; created: boolean };
  try {
    budget = loadBudget(ctx.paths, now());
  } catch (e) {
    if (e instanceof BudgetError) return fail(3, e.message);
    if (isStoreFailure(e)) return fail(1, e.message);
    throw e;
  }
  const gate = checkBudget(budget.state);
  if (!gate.ok) return fail(3, gate.message);
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

/** The calls in order. Answers are merged by question id; the cost is their sum, or undefined if any call didn't report one. */
export async function askAll(ctx: VerbContext, verb: Verb, calls: readonly PlannedCall[]): Promise<Step<{ answers: Record<string, Answer>; costUsd: number | undefined }>> {
  const answers: Record<string, Answer> = {};
  let costUsd: number | undefined = 0;
  let paid = 0;
  for (const [i, call] of calls.entries()) {
    let result: ClassifierResult;
    try {
      result = await ctx.provider.ask(call.questions.map(toClassifierQuestion), call.state);
    } catch (e) {
      if (paid === 0) return fail(1, `✖ classifier: ${oneLine(e)} → retry later, or set SIDEWISE_PROVIDER=fake to check the request`);
      return logFailed(ctx, verb, costUsd, `call ${i + 1} of ${calls.length}: ${oneLine(e)}`);
    }
    paid += 1;
    const c = usableCost((result as Partial<ClassifierResult> | null | undefined)?.costUsd);
    costUsd = costUsd === undefined || c === undefined ? undefined : costUsd + c;
    try {
      Object.assign(answers, readAnswers(call.questions, result));
    } catch (e) {
      return logFailed(ctx, verb, costUsd, (e as Error).message);
    }
  }
  return { ok: true, value: { answers, costUsd } };
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
