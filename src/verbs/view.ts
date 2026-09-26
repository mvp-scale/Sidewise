/**
 * view: "what do we already know here?" Free and read-only (no classifier call, no budget, no ledger write).
 * Three modes on one input string: a `side:`/JSON draft is request mode (the contract's own cache check —
 * runs, per-category record, and `reuse` when the exact question set was asked before); otherwise the raw
 * string is a place (a folder or tag, showing the newest 10/20/30 runs with outcome counts) or a run id
 * (showing its lineage up and down). Rehearsal-adapter runs (fake, chaos) are labelled and counted apart.
 * The hot cache (Plan 2) replaces the linear reads without changing the output.
 */
import path from 'node:path';
import { providerIdentity } from '../classifier/select.ts';
import { isRehearsal } from '../classifier/port.ts';
import { m, type Value } from '../contract/emit.ts';
import { answerKey, goalQuestion, subjectEvidence, subjectQuestions } from '../contract/translate.ts';
import { readCodeEvidence } from '../evidence/code.ts';
import { RUN_ID } from '../ledger/ids.ts';
import { readRecordAt, stripLines, withIndex } from '../ledger/index.ts';
import { isContractRun, isRun, latestOutcome, readLedger, type ContractRun, type Outcome, type RunRecord } from '../ledger/log.ts';
import type { SidewisePaths } from '../ledger/paths.ts';
import { exactReuse } from '../ledger/reuse.ts';
import type { Level } from '../lens/request.ts';
import { clip, hasControlChars } from '../util/text.ts';
import { loadRequest, stopText } from './request.ts';
import { respondText, wiseRecorded } from './respond.ts';
import type { VerbResult } from './types.ts';

/** view never spends and never picks a live provider: just enough of VerbContext to read the ledger and evidence. */
export interface ViewContext {
  paths: SidewisePaths;
  env: Record<string, string | undefined>;
}

type AnyRun = RunRecord | ContractRun;

const REQUEST_MODE = /^side\s*:/mu;

function runLine(r: AnyRun, outcome: Outcome | 'open'): string {
  const rehearsal = isRehearsal(r.adapter) ? ' · rehearsal' : '';
  const line = isRun(r)
    ? `${r.id} ${r.ts.slice(0, 10)} ${r.verb} L${r.level} ${r.consensus} ${r.verdict} "${clip(r.focus, 48)}" · ${outcome}`
    : `${r.id} ${r.ts.slice(0, 10)} ${r.verb} ${r.depth ?? '-'} ${r.gate} "${clip(r.goal, 48)}" · ${outcome}`;
  return `${clip(line, 120 - rehearsal.length)}${rehearsal}`;
}

const tagsMatch = (r: AnyRun, place: string): boolean => isRun(r) && r.tags.includes(place);

function whereMatches(r: AnyRun, place: string): boolean {
  if (isRun(r)) return r.where.some((w) => w.path === place || w.path.startsWith(`${place}/`));
  return r.where.some((w) => {
    const p = stripLines(w);
    return p === place || p.startsWith(`${place}/`);
  });
}

/** A folder, a tag or a path as a project-relative place; an absolute path inside the project is fine. */
function toPlace(target: string, root: string): { place: string } | { stop: string } {
  if (hasControlChars(target)) return { stop: '✖ view: the target has control characters → use a folder, a tag, or SW-####' };
  if (!path.isAbsolute(target) && !target.split(/[\\/]/).includes('..')) return { place: target.replace(/^\.\//, '').replace(/\/+$/, '') || '.' };
  const rel = path.relative(root, path.resolve(root, target));
  if (rel.startsWith('..') || path.isAbsolute(rel)) return { stop: `✖ view: "${clip(target, 60)}" is outside the project → use a folder inside it, a tag, or SW-####` };
  return { place: rel.split(path.sep).join('/') || '.' };
}

/** Renders byPlace's response for `hits`, already in ledger append order (oldest first) — shared by the
 *  full-scan path ('.') and the index-backed path, which differ only in how `hits` and `outcomeOf` were built. */
function renderPlace(place: string, hits: readonly AnyRun[], outcomeOf: (id: string) => Outcome | undefined, limit: number): VerbResult {
  if (!hits.length) return { exit: 0, text: `sidewise view ${clip(place, 60)} · no runs yet → "sidewise class <request>" starts one` };
  const counts = { held: 0, overruled: 0, failed: 0, open: 0 };
  let rehearsal = 0;
  for (const r of hits) {
    if (isRehearsal(r.adapter)) rehearsal += 1;
    else counts[outcomeOf(r.id) ?? 'open'] += 1;
  }
  const head = `sidewise view ${clip(place, 60)} · ${hits.length} run${hits.length === 1 ? '' : 's'} · held ${counts.held} · overruled ${counts.overruled} · failed ${counts.failed} · open ${counts.open}${rehearsal ? ` · rehearsal ${rehearsal}` : ''}`;
  const shown = hits.slice(-limit).reverse();
  const older = hits.length - shown.length;
  return {
    exit: 0,
    text: [head, ...shown.map((r) => runLine(r, outcomeOf(r.id) ?? 'open')), ...(older ? [`… ${older} older → raise the level to see more`] : [])].join('\n'),
  };
}

/** place mode, the full-scan way: every run in the ledger, filtered by whereMatches/tagsMatch. Used for '.'
 *  (every run — the index's place table has nothing narrower to offer there) and as byPlaceIndexed's own
 *  fallback if the index can't be used for some reason (paths.log missing is handled the same way either path). */
function byPlaceFullScan(place: string, paths: SidewisePaths, limit: number): VerbResult {
  const records = readLedger(paths, { partialTail: true });
  const runs = records.filter((r): r is AnyRun => isRun(r) || isContractRun(r));
  const hits = runs.filter((r) => place === '.' || tagsMatch(r, place) || whereMatches(r, place));
  return renderPlace(place, hits, (id) => latestOutcome(records, id) ?? undefined, limit);
}

/**
 * place mode, index-backed (design binding: "place history via the index"): `placeCandidates` narrows to the
 * ids whose where/tag entries could match `place` (oldest first, by offset), each pread by offset instead of
 * streaming the whole log. Every candidate is still re-checked against the real record with the EXACT same
 * whereMatches/tagsMatch predicate byPlaceFullScan uses — the index is a candidate generator, never the final
 * word — so a stale offset, a missed escape, or any other index quirk can only cost a wasted pread, never a
 * wrong answer. `outcomesFor` replaces the old per-hit `latestOutcome(records, id)` rescan (O(hits × records))
 * with one batched query over just the hit ids.
 */
function byPlaceIndexed(place: string, paths: SidewisePaths, limit: number): VerbResult {
  // readOnly: view is free and read-only (design binding "dry runs and free reads write nothing") — it must
  // never be the thing that persists a catch-up or rebuild of index.db to disk.
  return withIndex(
    paths,
    (handle) => {
      const hits: AnyRun[] = [];
      for (const { offset } of handle.placeCandidates(place)) {
        const rec = readRecordAt(paths.log, offset);
        if (rec && (isRun(rec) || isContractRun(rec)) && (tagsMatch(rec, place) || whereMatches(rec, place))) hits.push(rec);
      }
      const outcomes = handle.outcomesFor(hits.map((r) => r.id));
      return renderPlace(place, hits, (id) => outcomes.get(id), limit);
    },
    { readOnly: true },
  );
}

function byPlace(place: string, paths: SidewisePaths, limit: number): VerbResult {
  return place === '.' ? byPlaceFullScan(place, paths, limit) : byPlaceIndexed(place, paths, limit);
}

function byId(id: string, paths: SidewisePaths, limit: number): VerbResult {
  const records = readLedger(paths, { partialTail: true }); // never blocks on, or fails over, an append in progress
  const runs = records.filter((r): r is AnyRun => isRun(r) || isContractRun(r));
  const index = new Map(runs.map((r) => [r.id, r]));
  const self = index.get(id);
  if (!self) return { exit: 2, text: `✖ view: ${id} is not in the ledger → "sidewise view <folder>" lists recent runs` };
  const up: AnyRun[] = [];
  let cursor = self.parent ? index.get(self.parent) : undefined;
  while (cursor && up.length < limit) {
    up.unshift(cursor);
    cursor = cursor.parent ? index.get(cursor.parent) : undefined;
  }
  const down: AnyRun[] = [];
  const queue = [id];
  while (queue.length && down.length < limit) {
    const parent = queue.shift()!;
    for (const r of runs) {
      if (r.parent === parent && down.length < limit) {
        down.push(r);
        queue.push(r.id);
      }
    }
  }
  const outcomeOf = (r: AnyRun): Outcome | 'open' => latestOutcome(records, r.id) ?? 'open';
  return {
    exit: 0,
    text: [
      `sidewise view ${id} · lineage ${up.length} up · ${down.length} down`,
      ...up.map((r) => `↑ ${runLine(r, outcomeOf(r))}`),
      `▶ ${runLine(self, outcomeOf(self))}`,
      ...down.map((r) => `↓ ${runLine(r, outcomeOf(r))}`),
    ].join('\n'),
  };
}

/** One category's record here: `{runs: 0}` when it's never been asked, else counts and the newest run holding it. */
function categoryEntry(name: string, runsHere: readonly ContractRun[]): [string, Value] {
  let runs = 0;
  let pass = 0;
  let fail = 0;
  let last: string | undefined;
  for (const r of runsHere) {
    const gate = r.categories[name];
    if (gate === undefined) continue;
    runs += 1;
    if (gate === 'pass') pass += 1;
    else if (gate === 'fail') fail += 1;
    last = r.id; // ledger order is append order, so the last match seen is the newest
  }
  return [name, runs ? m(['runs', runs], ['pass', pass], ['fail', fail], ['last', last!]) : m(['runs', 0])];
}

/** Request mode: the contract's own view shape. loadRequest and readCodeEvidence stop it exactly as class does. */
function runRequestMode(text: string, ctx: ViewContext): VerbResult {
  const loaded = loadRequest(text, 'view');
  if (!loaded.ok) return loaded.result;
  const { request } = loaded;

  const evidence = readCodeEvidence(ctx.paths.root, request.side.where);
  if (!evidence.ok) return { exit: 2, text: stopText(evidence.errors) };

  const places = request.side.where.map(stripLines);
  const allRuns = readLedger(ctx.paths, { partialTail: true }).filter(isContractRun);
  const runsHere = allRuns.filter((r) => places.some((place) => whereMatches(r, place)));

  const categoryNames = request.side.categories.length
    ? request.side.categories.map((c) => c.name)
    : [...new Set(runsHere.flatMap((r) => Object.keys(r.categories)))];

  let reuse: string | undefined;
  if (request.side.categories.length > 0) {
    const questions = [goalQuestion(request.side.goal), ...subjectQuestions(request.side.categories)];
    const evidenceStr = subjectEvidence(evidence.evidence.files);
    const keys = questions.map((q) => answerKey(evidenceStr, q));
    const who = providerIdentity(ctx.env);
    reuse = exactReuse(ctx.paths, who, keys);
  }

  const next = reuse ? `sidewise view ${reuse}` : 'sidewise class';
  const side = m(
    ['view', request.side.where.join(', ')],
    ...(reuse ? [['reuse', reuse] as [string, Value]] : []),
    ['runs', runsHere.length],
    ['categories', m(...categoryNames.map((name) => categoryEntry(name, runsHere)))],
  );
  return { exit: 0, text: respondText(side, wiseRecorded(null), next, ['free']) };
}

export function runView(input: string, level: Level, ctx: ViewContext): VerbResult {
  const trimmed = input.trim();
  if (REQUEST_MODE.test(trimmed) || trimmed.startsWith('{')) return runRequestMode(input, ctx);

  const at = RUN_ID.test(input) ? undefined : toPlace(input, ctx.paths.root);
  if (at && 'stop' in at) return { exit: 2, text: at.stop };
  const limit = level * 10;
  return at ? byPlace(at.place, ctx.paths, limit) : byId(input, ctx.paths, limit);
}
