/**
 * class: "does the evidence support this one focus?" One pass through the lens:
 *   parse → validate (help first) → budget gate → read our code → one classifier ask → count the spend →
 *   consensus → log the run → the ≤ 6-line answer.
 * Nothing reaches the provider or the ledger unredacted; nothing is logged or spent for an invalid request.
 */
import { BudgetError, budgetLine, checkBudget, DEFAULT_BUDGET, loadBudget, recordSpend, type BudgetState } from '../budget/budget.ts';
import type { ClassifierAnswer, ClassifierQuestion, ClassifierResult } from '../classifier/port.ts';
import { readCodeEvidence } from '../evidence/code.ts';
import { appendRun, LedgerError, type LoggedPrimitive, type RunRecord } from '../ledger/log.ts';
import { redact } from '../ledger/redact.ts';
import { formatAnswer, type PrimitiveAnswer } from '../lens/answer.ts';
import { computeConsensus, type SlotAnswer } from '../lens/consensus.ts';
import { parseRequest } from '../lens/parse.ts';
import type { Primitive, Request } from '../lens/request.ts';
import { IRREVERSIBLE_NOTE_PREFIX, validate } from '../lens/validate.ts';
import type { VerbContext, VerbResult } from './types.ts';

const slotId = (pos: number): string => `s${pos}`;
const primitiveId = (i: number): string => `p${i + 1}`;

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
    return { pos: s.pos, reverse: s.reverse, p: a.probability };
  });
}

function readPrimitive(p: Primitive, a: ClassifierAnswer | undefined): { answer: PrimitiveAnswer; logged: LoggedPrimitive } {
  if (p.kind === 'bool') {
    if (!a || a.type !== 'noul') throw new Error(`no yes/no answer for "${p.text}"`);
    return { answer: { kind: 'bool', text: p.text, p: a.probability }, logged: { kind: 'bool', text: p.text, p: a.probability } };
  }
  let distribution: Record<string, number>;
  if (a?.type === 'score') distribution = Object.fromEntries(p.options.map((o, i) => [o, a.distribution[i] ?? 0]));
  else if (a?.type === 'choice') distribution = { ...a.probabilities };
  else throw new Error(`no ${p.kind} answer for "${p.text}"`);
  const top = p.options.reduce((best, o) => ((distribution[o] ?? 0) > (distribution[best] ?? 0) ? o : best), p.options[0] ?? '');
  return {
    answer: { kind: p.kind, text: p.text, top, p: distribution[top] ?? 0 },
    logged: { kind: p.kind, text: p.text, options: p.options, distribution },
  };
}

export async function runClass(text: string, ctx: VerbContext): Promise<VerbResult> {
  const now = ctx.now ?? Date.now;
  const parsed = parseRequest(text);
  if (!parsed.ok) return { exit: 2, text: parsed.errors.join('\n') };
  const req = parsed.request;
  const v = validate(req, ['class']);
  if (v.stops.length) return { exit: 2, text: v.stops.join('\n') };

  let budget: { state: BudgetState; created: boolean };
  try {
    budget = loadBudget(ctx.paths, now());
  } catch (e) {
    if (e instanceof BudgetError) return { exit: 3, text: e.message };
    throw e;
  }
  const gate = checkBudget(budget.state);
  if (!gate.ok) return { exit: 3, text: gate.message };

  const evidence = readCodeEvidence(ctx.paths.root, req.where);
  if (!evidence.ok) return { exit: 2, text: evidence.errors.join('\n') };

  let result: ClassifierResult;
  try {
    result = await ctx.provider.ask(toQuestions(req), { focus: redact(req.focus), problem: redact(req.problem), ...evidence.evidence.state });
  } catch (e) {
    return { exit: 1, text: `✖ classifier: ${(e as Error).message} → retry later, or set SIDEWISE_PROVIDER=fake to check the request` };
  }
  const spent = recordSpend(ctx.paths, result.costUsd ?? 0, now());

  let slots: SlotAnswer[];
  let primitives: { answer: PrimitiveAnswer; logged: LoggedPrimitive }[];
  try {
    slots = readSlots(req, result.answers);
    primitives = req.primitives.map((p, i) => readPrimitive(p, result.answers[primitiveId(i)]));
  } catch (e) {
    return { exit: 1, text: `✖ classifier: ${(e as Error).message} → retry; the call was counted against the budget` };
  }

  const consensus = computeConsensus(slots);
  // Order: safety/evidence notes first, since a long tail is clipped from the end (answer.ts, 160 chars) and
  // the one-time budget-initialised notice is the lowest-priority thing to lose to that clip.
  const notes = [
    ...v.notes,
    ...evidence.evidence.notes,
    ...(result.costUsd === undefined && ctx.provider.adapter !== 'fake' ? ['provider did not report cost; the run cap still applies'] : []),
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
        costUsd: result.costUsd ?? null,
        task: ctx.env.SIDEWISE_TASK?.trim() || null,
      },
      now(),
    );
  } catch (e) {
    if (e instanceof LedgerError) return { exit: 1, text: `${e.message} (the call was counted against the budget)` };
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
