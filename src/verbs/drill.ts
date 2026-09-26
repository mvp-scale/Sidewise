/**
 * drill: "why did this one thing fail?" Goes down from one item, or one category, in a parent run's own
 * arrays — shaped like that parent (CONTRACT.md "drill"). Which shape branches on parent.items:
 *   a sweep parent (scan or loop, items !== null) → from: names one of its items; drill sweeps the next
 *     layer down from that one item (sweep.ts's shared engine), worst first, same as scan.
 *   a one-subject parent (class, change, or an earlier drill, items === null) → from: names one of its
 *     categories; drill sends brand-new, narrower questions straight under ask: and answers with class's
 *     own shape.
 * Both branches share parent/from resolution and next:'s ruling (task-21-brief, Controller ruling): drill's
 * own next: always points at fixing-then-proving, never at drilling further (you're already at the bottom) —
 * a one-subject parent keeps "fix it, then change"; a sweep parent says to fix and re-run this drill instead
 * (unchanged items are reused, so it is nearly free), since change refuses a sweep parent outright.
 */
import { m } from '../contract/emit.ts';
import { goalGate, gradeItems, gradeSubject, sweepGate, worstFirst } from '../contract/grade.ts';
import { firstStringLayer, type Item } from '../contract/layers.ts';
import { answerKey, goalQuestion, subjectEvidence, subjectQuestions } from '../contract/translate.ts';
import type { Answer, Category } from '../contract/types.ts';
import { IRREVERSIBLE_NOTE } from '../contract/validate.ts';
import { readCodeEvidence } from '../evidence/code.ts';
import { createCodeResolver, readUnit } from '../evidence/units.ts';
import { findRun, isContractRun, type ItemRecord, type NewContractRun } from '../ledger/log.ts';
import { redact } from '../ledger/redact.ts';
import { lookupAnswers } from '../ledger/reuse.ts';
import { computeConsensus, type SlotAnswer } from '../lens/consensus.ts';
import { clip } from '../util/text.ts';
import { actorOf, askAll, preflight, record, recordFree, type PlannedCall } from './pay.ts';
import { loadRequest, stopText } from './request.ts';
import { commonNotes, dryRunText, respondText, subjectSide, sweepEntry, sweepNext, wiseRecorded } from './respond.ts';
import { planSweep, recordSweep, runSweep, sweepDryRun } from './sweep.ts';
import type { VerbContext, VerbResult } from './types.ts';

/** A sweep parent's fail/unsure next (Controller ruling): fix the worst item, then re-run this drill — cheap,
 * since sweep.ts reuses every item that didn't change. Never sidewise change: change.ts refuses a sweep parent. */
const REDRILL_NEXT = 'fix it, then run this drill again (unchanged items are reused, so it is nearly free)';

export async function runDrill(text: string, ctx: VerbContext): Promise<VerbResult> {
  const loaded = loadRequest(text, 'drill');
  if (!loaded.ok) return loaded.result;
  const { request } = loaded;

  const parent = findRun(ctx.paths, request.side.parent!);
  if (!parent) return { exit: 2, text: `✖ side.parent: ${request.side.parent} is not in the ledger → check the id` };
  if (!isContractRun(parent)) return { exit: 2, text: `✖ side.parent: ${parent.id} predates the YAML contract → run class or scan again` };

  const oneSubjectNext = (gate: 'pass' | 'fail' | 'unsure'): string =>
    gate === 'pass' ? 'act on it' : `fix it, then sidewise change --parent ${request.side.parent} --compare <before>..<after>`;

  if (parent.items !== null) {
    // The parent was a sweep: from: names one of its items.
    if (!request.side.over) {
      return {
        exit: 2,
        text: `✖ side.over: drilling into a sweep item needs it → add over: with the next layer down (sidewise template drill --parent ${parent.id} --from ${request.side.from})`,
      };
    }
    const itemRec: ItemRecord | undefined = parent.items[request.side.from!];
    if (!itemRec) {
      return {
        exit: 2,
        text: `✖ side.from: "${clip(request.side.from!, 40)}" is not an item ${parent.id} listed → use one of: ${clip(Object.keys(parent.items).join(', '), 80)}`,
      };
    }

    const from = request.side.from!;
    const name = from.includes('/') ? from.slice(from.lastIndexOf('/') + 1) : from;
    const parentId = from.includes('/') ? from.slice(0, from.lastIndexOf('/')) : null;
    let itemText = name; // an idea item's text is its own name (layers.ts), unless it's code (a unit)
    if (itemRec.unit) {
      const read = readUnit(ctx.paths.root, itemRec.unit);
      if (!read.ok) return { exit: 2, text: `✖ side.from: the code has changed since ${parent.id} (${read.error}) → run scan again` };
      itemText = read.text;
    }
    const root: Item = { id: from, layer: itemRec.layer, name, parent: parentId, fill: itemRec.fill, text: itemText, ...(itemRec.unit ? { unit: itemRec.unit } : {}) };

    // An idea item (from loop, or an earlier idea drill) has no unit — nothing for createCodeResolver to
    // dispatch on (units.ts's `parent.unit!.kind` would throw). It also has no code to split with "each": the
    // next layer down has to be a literal list of new ideas, same as loop's own over:, so no resolver runs at
    // all. A string layer under an idea root is incoherent, not a crash — stop and say so.
    if (!itemRec.unit) {
      const badLayer = firstStringLayer(request.side.over!);
      if (badLayer) {
        return {
          exit: 2,
          text: `✖ side.over.${badLayer}: "${clip(from, 40)}" is an idea, not code → give ${badLayer} as a list of items (there is nothing to split with each)`,
        };
      }
    }

    const notes: string[] = [];
    const who = { adapter: ctx.provider.adapter, model: ctx.provider.model };
    const plan = planSweep(request, who, ctx.paths, ctx.dryRun ?? false, itemRec.unit ? { resolve: createCodeResolver(ctx.paths.root, notes), root } : { root });

    if (ctx.dryRun) return sweepDryRun(plan);

    const pre = preflight(ctx);
    if (!pre.ok) return pre.result;

    const swept = await runSweep(ctx, 'drill', plan);
    if (!swept.ok) return swept.result;
    const { answers, costUsd, statusOf } = swept.value;

    const categoriesOf = (layer: string): readonly Category[] => request.side.layers.find((l) => l.name === layer)?.categories ?? [];
    const grades = gradeItems(plan.items, categoriesOf, statusOf, answers);

    const goalAnswer = answers['goal'] as { kind: 'yesno'; p: number };
    const goalGrade = goalGate(goalAnswer.p);
    const gate = sweepGate(goalGrade, grades);

    const graded = [...grades.values()].filter((g) => g.status === 'asked' || g.status === 'reused');
    const worst = worstFirst(grades.values());
    const failing = m(...worst.map((g) => sweepEntry(g)));
    const passing = graded.filter((g) => g.ownGate === 'pass').length;

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

    // Combines sweepNext's own never-drill-a-passing-item edge cases (goal-only-missed, everything skipped)
    // with the Controller ruling: when there IS a worst item to fix, say so and re-run — never drill further.
    const response = (id: string, budget: string): string =>
      respondText(
        m(['id', id], ['gate', gate], ['goal', m(['gate', goalGrade], ['p', goalAnswer.p])], ['failing', failing], ['passing', passing]),
        wiseRecorded(request.wise),
        worst.length ? REDRILL_NEXT : sweepNext(id, gate, worst, graded, 'act on it'),
        commonNotes([...loaded.notes, ...notes], `${calls} call${calls === 1 ? '' : 's'} · ${plan.askedQuestions} question${plan.askedQuestions === 1 ? '' : 's'} · ${budget}`),
      );

    const run: NewContractRun = {
      verb: 'drill',
      actor: actorOf(ctx),
      task: ctx.env.SIDEWISE_TASK?.trim() || null,
      goal: request.side.goal,
      depth: request.side.depth ?? null,
      where: [],
      parent: request.side.parent!,
      from: request.side.from!,
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

    return recordSweep(ctx, calls, costUsd, run);
  }

  // The parent was one subject: from: names one of its categories.
  if (request.side.over) return { exit: 2, text: `✖ side.over: ${parent.id} wasn't a sweep → remove over` };
  if (!parent.ask.categories.some((c) => c.name === request.side.from)) {
    return {
      exit: 2,
      text: `✖ side.from: "${clip(request.side.from!, 40)}" is not a category of ${parent.id} → use one of: ${parent.ask.categories.map((c) => c.name).join(', ')}`,
    };
  }

  const evidence = readCodeEvidence(ctx.paths.root, parent.where);
  if (!evidence.ok) return { exit: 2, text: stopText(evidence.errors) };

  if (ctx.dryRun) {
    const questions = 1 + request.side.categories.flatMap((c) => c.questions).length;
    return { exit: 0, text: dryRunText({ calls: 1, questions }) };
  }

  const pre = preflight(ctx);
  if (!pre.ok) return pre.result;

  const who = { adapter: ctx.provider.adapter, model: ctx.provider.model };
  const evidenceStr = subjectEvidence(evidence.evidence.files);
  const questions = [goalQuestion(request.side.goal), ...subjectQuestions(request.side.categories)];
  const keyed = questions.map((q) => [q, answerKey(evidenceStr, q)] as const);
  const reused = lookupAnswers(ctx.paths, who, keyed.map(([, k]) => k));

  const answers: Record<string, Answer> = {};
  const reusedFrom: Record<string, string> = {};
  const toAsk: (typeof keyed)[number][] = [];
  for (const [q, k] of keyed) {
    const hit = reused.get(k);
    if (hit) {
      answers[q.id] = hit.answer;
      reusedFrom[q.id] = hit.id;
    } else {
      toAsk.push([q, k]);
    }
  }

  let costUsd: number | undefined;
  let calls: number;
  if (toAsk.length === 0) {
    costUsd = 0;
    calls = 0;
  } else {
    const call: PlannedCall = { state: { goal: redact(request.side.goal), code: evidence.evidence.files }, questions: toAsk.map(([q]) => q) };
    const asked = await askAll(ctx, 'drill', [call]);
    if (!asked.ok) return asked.result;
    Object.assign(answers, asked.value.answers);
    costUsd = asked.value.costUsd;
    calls = 1;
  }

  const keys: Record<string, string> = {};
  for (const [q, k] of keyed) keys[q.id] = k;

  const slots: SlotAnswer[] = request.side.categories
    .filter((c) => c.questions[0]?.kind === 'yesno')
    .flatMap((c) => c.questions.map((q) => ({ pos: q.n, reverse: c.pass === 'yes', p: (answers[String(q.n)] as { kind: 'yesno'; p: number }).p })));
  const consensus = computeConsensus(slots).consensus;

  const subject = gradeSubject(request.side.categories, answers);
  const escalate = consensus !== 'STRONG' || request.side.depth === 'thorough' || loaded.notes.some((n) => n.startsWith(IRREVERSIBLE_NOTE));

  const response = (id: string, budget: string): string =>
    respondText(
      subjectSide(id, subject.gate, subject, [
        ['consensus', consensus],
        ['escalate', escalate],
      ]),
      wiseRecorded(request.wise),
      oneSubjectNext(subject.gate),
      commonNotes([...loaded.notes, ...evidence.evidence.notes], budget),
    );

  const run: NewContractRun = {
    verb: 'drill',
    actor: actorOf(ctx),
    task: ctx.env.SIDEWISE_TASK?.trim() || null,
    goal: request.side.goal,
    depth: request.side.depth ?? null,
    where: parent.where,
    parent: request.side.parent!,
    from: request.side.from!,
    compare: null,
    wise: request.wise,
    ask: { categories: request.side.categories, layers: [] },
    over: null,
    items: null,
    answers,
    keys,
    reusedFrom,
    categories: Object.fromEntries(subject.categories.map((c) => [c.name, c.gate])),
    gate: subject.gate,
    goalGate: subject.goal?.gate ?? null,
    goalP: subject.goal?.p ?? null,
    consensus,
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
