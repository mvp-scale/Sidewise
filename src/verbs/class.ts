/**
 * class: "does the evidence support this one focus?" One pass through the lens:
 *   parse → validate (help first) → budget gate → read our code → check the ledger → one classifier ask →
 *   count the spend → check the answers → consensus → log the run → the ≤ 6-line answer.
 * Nothing reaches the provider or the ledger unredacted; nothing is logged or spent for an invalid request.
 */
import { BudgetError, budgetLine, checkBudget, DEFAULT_BUDGET, loadBudget, recordSpend, type BudgetState } from '../budget/budget.ts';
import type { ClassifierAnswer, ClassifierQuestion, ClassifierResult } from '../classifier/port.ts';
import { readCodeEvidence } from '../evidence/code.ts';
import { LockError, StoreError } from '../ledger/lock.ts';
import { appendRun, checkLedger, LedgerError, type LoggedPrimitive, type RunRecord } from '../ledger/log.ts';
import { redact } from '../ledger/redact.ts';
import { formatAnswer, type PrimitiveAnswer } from '../lens/answer.ts';
import { computeConsensus, type SlotAnswer } from '../lens/consensus.ts';
import { parseRequest } from '../lens/parse.ts';
import type { Primitive, Request } from '../lens/request.ts';
import { IRREVERSIBLE_NOTE_PREFIX, validate } from '../lens/validate.ts';
import type { VerbContext, VerbResult } from './types.ts';

const slotId = (pos: number): string => `s${pos}`;
const primitiveId = (i: number): string => `p${i + 1}`;
const MAX_STOPS = 5;

/** At most 5 stops, then one line saying how many more: pasted junk must not flood an agent's context. */
function stopText(stops: readonly string[]): string {
  if (stops.length <= MAX_STOPS) return stops.join('\n');
  return [...stops.slice(0, MAX_STOPS), `✖ request: ${stops.length - MAX_STOPS} more problems → fix the ones above, then run again`].join('\n');
}

/** One short line from whatever a provider threw (an Error, a string, a many-line HTML body). */
function oneLine(e: unknown): string {
  const text = (e instanceof Error ? e.message : String(e)).split('\n')[0]!.trim();
  return text.length > 200 ? `${text.slice(0, 199)}…` : text;
}

const isStoreFailure = (e: unknown): e is Error => e instanceof LedgerError || e instanceof LockError || e instanceof StoreError;

/** A reported cost we can add up: finite and not negative. Anything else counts as not reported. */
const usableCost = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : undefined);

const isProbability = (p: unknown): p is number => typeof p === 'number' && p >= 0 && p <= 1; // NaN fails both

function primitiveQuestion(p: Primitive, id: string): ClassifierQuestion {
  const ask = redact(p.text);
  if (p.kind === 'bool') return { type: 'noul', id, ask };
  if (p.kind === 'scale') return { type: 'score', id, ask, levels: p.options };
  return { type: 'choice', id, ask, options: Object.fromEntries(p.options.map((o) => [o, o])) };
}

export function toQuestions(req: Request): ClassifierQuestion[] {
  return [
    ...req.slots.map((s): ClassifierQuestion => ({ type: 'noul', id: slotId(s.pos), ask: redact(s.text) })),
    ...req.primitives.map((p, i) => primitiveQuestion(p, primitiveId(i))),
  ];
}

function readSlots(req: Request, answers: Record<string, ClassifierAnswer>): SlotAnswer[] {
  return req.slots.map((s) => {
    const a = answers[slotId(s.pos)];
    if (!a || a.type !== 'noul') throw new Error(`no yes/no answer for slot ${s.pos}`);
    if (!isProbability(a.probability)) throw new Error(`slot ${s.pos} probability ${a.probability} is not between 0 and 1`);
    return { pos: s.pos, reverse: s.reverse, p: a.probability };
  });
}

function readPrimitive(p: Primitive, a: ClassifierAnswer | undefined): { answer: PrimitiveAnswer; logged: LoggedPrimitive } {
  if (p.kind === 'bool') {
    if (!a || a.type !== 'noul') throw new Error(`no yes/no answer for "${p.text}"`);
    if (!isProbability(a.probability)) throw new Error(`"${p.text}" probability ${a.probability} is not between 0 and 1`);
    return { answer: { kind: 'bool', text: p.text, p: a.probability }, logged: { kind: 'bool', text: p.text, p: a.probability } };
  }
  let distribution: Record<string, number>;
  if (a?.type === 'score') distribution = Object.fromEntries(p.options.map((o, i) => [o, a.distribution[i] ?? 0]));
  else if (a?.type === 'choice') distribution = { ...a.probabilities };
  else throw new Error(`no ${p.kind} answer for "${p.text}"`);
  const bad = Object.values(distribution).find((v) => !isProbability(v));
  if (bad !== undefined) throw new Error(`"${p.text}" has a probability ${bad} that is not between 0 and 1`);
  const top = p.options.reduce((best, o) => ((distribution[o] ?? 0) > (distribution[best] ?? 0) ? o : best), p.options[0] ?? '');
  return {
    answer: { kind: p.kind, text: p.text, top, p: distribution[top] ?? 0 },
    logged: { kind: p.kind, text: p.text, options: p.options, distribution },
  };
}

export async function runClass(text: string, ctx: VerbContext): Promise<VerbResult> {
  const now = ctx.now ?? Date.now;
  const parsed = parseRequest(text);
  if (!parsed.ok) return { exit: 2, text: stopText(parsed.errors) };
  const req = parsed.request;
  const v = validate(req, ['class']);
  if (v.stops.length) return { exit: 2, text: stopText(v.stops) };

  let budget: { state: BudgetState; created: boolean };
  try {
    budget = loadBudget(ctx.paths, now());
  } catch (e) {
    if (e instanceof BudgetError) return { exit: 3, text: e.message };
    if (isStoreFailure(e)) return { exit: 1, text: e.message };
    throw e;
  }
  const gate = checkBudget(budget.state);
  if (!gate.ok) return { exit: 3, text: gate.message };

  const evidence = readCodeEvidence(ctx.paths.root, req.where);
  if (!evidence.ok) return { exit: 2, text: stopText(evidence.errors) };

  // Before paying for a call, make sure its run can be logged: a corrupt or unwritable ledger stops here.
  try {
    checkLedger(ctx.paths);
  } catch (e) {
    if (isStoreFailure(e)) return { exit: 1, text: e.message };
    throw e;
  }

  let result: ClassifierResult;
  try {
    result = await ctx.provider.ask(toQuestions(req), { focus: redact(req.focus), problem: redact(req.problem), ...evidence.evidence.state });
  } catch (e) {
    return { exit: 1, text: `✖ classifier: ${oneLine(e)} → retry later, or set SIDEWISE_PROVIDER=fake to check the request` };
  }
  // A port is only a promise: whatever came back, count the call, then check the answers before using them.
  const costUsd = usableCost((result as Partial<ClassifierResult> | null)?.costUsd);
  // Spend, then log: sequential, never nested (they share one non-reentrant lock).
  let spent: BudgetState;
  try {
    spent = recordSpend(ctx.paths, costUsd ?? 0, now());
  } catch (e) {
    if (e instanceof BudgetError) return { exit: 3, text: e.message };
    if (isStoreFailure(e)) return { exit: 1, text: `${e.message} (the call was NOT counted against the budget)` };
    throw e;
  }

  let slots: SlotAnswer[];
  let primitives: { answer: PrimitiveAnswer; logged: LoggedPrimitive }[];
  try {
    const answers = (result as Partial<ClassifierResult> | null)?.answers;
    if (!answers || typeof answers !== 'object') throw new Error('the provider returned no answers');
    slots = readSlots(req, answers);
    primitives = req.primitives.map((p, i) => readPrimitive(p, answers[primitiveId(i)]));
  } catch (e) {
    return { exit: 1, text: `✖ classifier: ${(e as Error).message} → retry; the call was counted against the budget` };
  }

  const consensus = computeConsensus(slots);
  // Order: safety/evidence notes first, since a long tail is clipped from the end (answer.ts, 160 chars) and
  // the one-time budget-initialised notice is the lowest-priority thing to lose to that clip.
  const notes = [
    ...v.notes,
    ...evidence.evidence.notes,
    ...(costUsd === undefined && ctx.provider.adapter !== 'fake' ? ['provider did not report cost; the run cap still applies'] : []),
    ...(budget.created ? [`budget initialised ($${DEFAULT_BUDGET.capUsd.toFixed(2)} / ${DEFAULT_BUDGET.capRuns} runs; "sidewise budget set" changes it)`] : []),
  ];
  const lean = primitives.map((p) => p.answer).find((p) => p.kind === 'direction');
  const perspective = req.perspective || 'agent';

  let run: RunRecord;
  try {
    run = appendRun(
      ctx.paths,
      {
        verb: 'class',
        level: req.level,
        actor: ctx.env.SIDEWISE_ACTOR?.trim() || perspective,
        perspective,
        where: req.where,
        problem: req.problem,
        tags: req.tags,
        focus: req.focus,
        ...(req.parent ? { parent: req.parent } : {}),
        slots: slots.map((s, i) => ({ pos: s.pos, text: req.slots[i]!.text, reverse: s.reverse, p: s.p })),
        primitives: primitives.map((p) => p.logged),
        consensus: consensus.consensus,
        verdict: consensus.verdict,
        ...(lean && lean.kind === 'direction' ? { lean: { option: lean.top, p: lean.p } } : {}),
        notes,
        adapter: ctx.provider.adapter,
        model: ctx.provider.model,
        costUsd: costUsd ?? null,
        task: ctx.env.SIDEWISE_TASK?.trim() || null,
      },
      now(),
    );
  } catch (e) {
    if (isStoreFailure(e)) return { exit: 1, text: `${e.message} (the call was counted against the budget)` };
    throw e;
  }

  const escalate = req.level === 3 || v.notes.some((n) => n.startsWith(IRREVERSIBLE_NOTE_PREFIX));
  const answer = formatAnswer({
    id: run.id,
    verb: 'class',
    level: req.level,
    adapter: ctx.provider.adapter,
    focus: req.focus,
    result: consensus,
    primitives: primitives.map((p) => p.answer),
    escalate,
    notes,
    budget: budgetLine(spent),
  });
  return { exit: 0, text: answer, run };
}
