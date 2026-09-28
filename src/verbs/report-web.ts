/**
 * `sidewise report web`: the one view that writes something — a self-contained, read-only
 * `.sidewise/viewer.html`, opened in a browser when one is available. Everything it shows is derived, read-side,
 * from records the other verbs already wrote (readLedger, never the id index — this never touches index.db).
 *
 * The place x concern consensus is a straight port of `lab/research/consensus-proto/proto.py`'s graph: for every
 * (place, concern) pair, every run that judged it is a vote. All votes agreeing is STRONG (>=2 runs) or SINGLE
 * (exactly one); votes disagreeing is CONFLICT. The prototype's `same_checklist` flag survives too (a CONFLICT
 * where every hit asked the same normalized question text is a real reversal; a CONFLICT where the questions
 * differ under a reused category name may just be apples-to-oranges) — proto.py's own three caveats (its
 * report.md "Verdict" section) still apply here: a multi-`where` one-subject run's category gate is attached to
 * every file in that `where` list (it can't say which file drove a `fail`), and question text is matched by
 * crude normalization, not a content-addressed key. The prototype's `session` dimension is dropped: everything
 * here reads one project's own ledger, so "the id index" already gives every run a stable identity as gate-space to
 * agree or disagree in.
 *
 * `fail`→`pass` and `pass`→`fail` arcs come straight out of the same (place, concern) history the consensus
 * above already groups: every hit sorted by its own run's `ts` (never by SW id — ids repeat across a
 * concatenated/multi-session ledger, and even within one ledger, id order and ts order can't be assumed the
 * same), earliest vs latest. Earliest `fail` and latest `pass` is a fix that held; the reverse is a regression;
 * anything else (agreement, or an `unsure` at either end) is neither — this is deliberately a two-point read,
 * not a full walk of every flip in between.
 *
 * A path can be double-counted when the same file was asked about from two different roots (a session run from
 * a project's own root, another from one level up) — `mergePathAliases` folds a longer place into a shorter one
 * already present whenever the longer is exactly the shorter with a `/`-prefixed extra path segment in front (a
 * real project has one root, so this is a same-file suffix match, not a heuristic over file content); the story
 * panel says how many aliases were folded.
 *
 * A card's own colour rolls the place's concerns up to one verdict: `conflict` beats any gate, else the worst
 * gate wins (fail, then unsure, then pass); `none` is a place or a heat-map cell with no runs at all.
 *
 * Security: the embedded data is JSON inside a `<script type="application/json">` block, escaped against `<`,
 * `>`, `&`, U+2028 and U+2029 so nothing in it (a question, a goal, an actor name) can close that tag early or
 * open a new one. The client script only ever reads it with `JSON.parse` and writes ledger text to the page with
 * `textContent`/`className`/`title` — never `innerHTML` — so the same escaping isn't the only thing standing
 * between untrusted ledger text and script execution.
 */
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Category, Gate } from '../contract/types.ts';
import { sweepPlaces, stripLines } from '../ledger/index.ts';
import { isContractRun, isRun, readLedger, type ContractRun, type FailedRecord, type LedgerRecord, type Outcome, type OutcomeRecord } from '../ledger/log.ts';
import { ensureDir, type SidewisePaths } from '../ledger/paths.ts';
import type { Runner } from '../setup/runner.ts';
import type { VerbResult } from './types.ts';

const DAY_MS = 24 * 60 * 60 * 1000;
const LIST_CAP = 12;

/** The five colours a place, a card or a heat-map cell can carry: a real gate, `conflict` (votes disagree), or
 *  `none` (no run ever judged it). */
type Verdict = Gate | 'conflict' | 'none';
/** proto.py's place x concern status, ported: STRONG (>=2 independent runs, same gate), CONFLICT (gates
 *  differ), SINGLE (proto's "single-session", renamed — one ledger has no session dimension, just one run).
 *  'NONE': no run has ever judged this pair (a heat-map cell can be this; a card's own chip never is, since a
 *  chip only exists for a concern the card's place actually has hits for). */
export type PairStatus = 'STRONG' | 'CONFLICT' | 'SINGLE' | 'NONE';

const GATE_RANK: Record<Gate, number> = { fail: 0, unsure: 1, pass: 2 };

interface ConcernChip {
  name: string;
  verdict: Verdict;
}

interface Card {
  place: string;
  verdict: Verdict;
  runCount: number;
  concerns: ConcernChip[];
  tags: string[];
}

interface Layer {
  name: string;
  cards: Card[];
}

interface ConcernRow {
  key: string;
  label: string;
  kind: 'category' | 'tag';
  count: number;
  places: string[];
}

interface HeatCell {
  place: string;
  concern: string;
  verdict: Verdict;
  status: PairStatus;
  runs: number;
  gates: Gate[];
  spread: number | null;
  /** Only meaningful (non-null) on a CONFLICT: did every hit ask the same normalized question set? */
  sameChecklist: boolean | null;
  title: string;
}

/** A (place, concern) pair whose earliest and latest hit (by ts) disagree in one specific direction: fromId is
 *  the earliest hit's run, toId the latest. */
interface Arc {
  place: string;
  concern: string;
  fromId: string;
  toId: string;
}

interface Finding {
  id: string;
  place: string;
  goal: string;
  ts: string;
}

interface SessionStory {
  runs: number;
  paidCalls: number;
  spendUsd: number;
  actors: string[];
  dateFrom: string | null;
  dateTo: string | null;
  fixes: Arc[];
  regressions: Arc[];
  findings: Finding[];
  outcomes: { held: number; overruled: number; failed: number; open: number };
  /** How many place strings were folded into a shorter, already-present one (see mergePathAliases). */
  pathsMerged: number;
}

export interface WindowData {
  layers: Layer[];
  concerns: ConcernRow[];
  heatmap: { places: string[]; concerns: string[]; cells: HeatCell[] };
  story: SessionStory;
}

export interface ViewerData {
  generatedAt: string;
  windows: { all: WindowData; last30: WindowData };
}

/** proto.py's `normalize_question`: lowercase, blank out `{blanks}`, strip anything but letters/digits/space,
 *  collapse whitespace — crude, but it's what tells "the same checklist, reused" from "same category name,
 *  different questions" (the same-checklist flag on a CONFLICT pair). */
function normalizeQuestion(text: string): string {
  return text
    .toLowerCase()
    .replace(/\{[a-z_]+\}/gu, ' ')
    .replace(/[^a-z0-9 ]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

/** One subject's or one sweep item's place text, for an arc/finding row — the same fallback order report.ts's
 *  own (unexported) placesOf uses: a one-subject run's own `where`, else its sweep items' unit paths. */
function placeSummary(rec: ContractRun): string {
  const direct = rec.where.map(stripLines).filter(Boolean);
  if (direct.length) return direct.join(', ');
  const sweep = sweepPlaces(rec)
    .filter((p) => p.kind === 'where')
    .map((p) => p.val);
  return sweep.length ? sweep.join(', ') : '(no place)';
}

function wiseTags(rec: ContractRun): string[] {
  const w = rec.wise;
  if (!w) return [];
  const tags: string[] = [];
  if (w.why) tags.push(`why:${w.why}`);
  if (w.area) tags.push(`area:${w.area}`);
  if (w.stage) tags.push(`stage:${w.stage}`);
  if (w.change) tags.push(`change:${w.change}`);
  if (w.risk) tags.push(`risk:${w.risk}`);
  return tags;
}

function meanP(answers: ContractRun['answers'], ns: readonly number[], prefix: string): number | null {
  const ps: number[] = [];
  for (const n of ns) {
    const a = answers[`${prefix}${n}`];
    if (a && a.kind === 'yesno') ps.push(a.p);
  }
  return ps.length ? ps.reduce((s, v) => s + v, 0) / ps.length : null;
}

function questionFingerprint(cat: Category): string {
  return cat.questions
    .map((q) => normalizeQuestion(q.text))
    .sort()
    .join('|');
}

interface Edge {
  runId: string;
  place: string;
  concern: string;
  gate: Gate;
  p: number | null;
  qtext: string;
  /** The run's own ts (never the SW id) — the only thing arcs are ever ordered by. */
  ts: string;
}

/** Every (run, place, concern) vote in the window: a one-subject run's categories against its `where` places, or
 *  a sweep run's per-item categories against that item's own file — the same two shapes report.ts's `reportHits`
 *  already branches on (`rec.items === null` vs not). */
function collectEdges(runs: readonly ContractRun[]): { edges: Edge[]; runTags: Map<string, string[]> } {
  const edges: Edge[] = [];
  const runTags = new Map<string, string[]>();
  for (const rec of runs) {
    runTags.set(rec.id, wiseTags(rec));
    if (rec.items) {
      const layerCats = new Map<string, Category[]>();
      for (const layer of rec.ask.layers) layerCats.set(layer.name, layer.categories);
      for (const [itemKey, item] of Object.entries(rec.items)) {
        const place = item.unit?.path;
        if (!place) continue;
        for (const cat of layerCats.get(item.layer) ?? []) {
          const gate = item.categories?.[cat.name];
          if (gate === undefined) continue;
          const ns = cat.questions.map((q) => q.n);
          const p = meanP(rec.answers, ns, `${itemKey}#`);
          edges.push({ runId: rec.id, place, concern: cat.name.toLowerCase(), gate, p, qtext: questionFingerprint(cat), ts: rec.ts });
        }
      }
    } else {
      const places = rec.where.map(stripLines).filter(Boolean);
      if (!places.length) continue;
      for (const cat of rec.ask.categories) {
        const gate = rec.categories[cat.name];
        if (gate === undefined) continue;
        const ns = cat.questions.map((q) => q.n);
        const p = meanP(rec.answers, ns, '');
        const qtext = questionFingerprint(cat);
        for (const place of places) edges.push({ runId: rec.id, place, concern: cat.name.toLowerCase(), gate, p, qtext, ts: rec.ts });
      }
    }
  }
  return { edges, runTags };
}

/** conflict beats every gate; otherwise the worst gate wins (fail, then unsure, then pass) — the same priority
 *  GATE_RANK already gives report.ts's own `hits` view. `none`: no concern reached this place at all. */
function rollup(verdicts: readonly Verdict[]): Verdict {
  if (!verdicts.length) return 'none';
  if (verdicts.includes('conflict')) return 'conflict';
  const gates = verdicts.filter((v): v is Gate => v === 'pass' || v === 'fail' || v === 'unsure');
  if (!gates.length) return 'none';
  return [...gates].sort((a, b) => GATE_RANK[a] - GATE_RANK[b])[0]!;
}

function buildOutcomes(runs: readonly ContractRun[], outcomes: readonly OutcomeRecord[]): SessionStory['outcomes'] {
  const latest = new Map<string, Outcome>();
  for (const o of outcomes) latest.set(o.of, o.outcome); // ledger order: later entries overwrite, same as latestOutcome()
  const counts = { held: 0, overruled: 0, failed: 0, open: 0 };
  for (const outcome of latest.values()) counts[outcome]++;
  for (const r of runs) {
    if ((r.gate === 'fail' || r.gate === 'unsure') && !latest.has(r.id)) counts.open++;
  }
  return counts;
}

/** Real precision for a sub-cent sum (e.g. $0.0023 — 2 significant digits) instead of a misleading $0.00; the
 *  same rule wherever a dollar amount appears on the page. Exported so this exact implementation is unit-tested
 *  here, then embedded verbatim into the client script below (`${formatUsd.toString()}`) — one implementation,
 *  never a second hand-copied one that could drift. */
export function formatUsd(n: number): string {
  if (!n) return '$0.00';
  if (n >= 0.01) return `$${n.toFixed(2)}`;
  let s = n.toPrecision(2);
  if (s.includes('e')) s = n.toFixed(6); // far below a cent: toPrecision would go exponential
  return `$${s}`;
}

/** Folds a longer place into a shorter one already present when the longer is exactly the shorter with a
 *  `/`-prefixed path in front (e.g. `stage/NodeGoat/app/routes/x.js` -> `app/routes/x.js`, when the latter is
 *  itself one of this window's places) — the same file, asked about from two different roots. Shortest-first so
 *  a chain of three aliases all collapse onto the one true shortest, never a middle link. Returns the merge map
 *  (longer -> canonical) and the number of aliases folded, for the story panel's "N paths merged". */
function mergePathAliases(places: readonly string[]): { canonicalOf: Map<string, string>; merged: number } {
  const sorted = [...new Set(places)].sort((a, b) => a.length - b.length);
  const canonicalOf = new Map<string, string>();
  for (let i = 0; i < sorted.length; i++) {
    const short = sorted[i]!;
    if (canonicalOf.has(short)) continue; // short is itself an alias of something even shorter — never a target
    for (let j = i + 1; j < sorted.length; j++) {
      const long = sorted[j]!;
      if (!canonicalOf.has(long) && long.endsWith(`/${short}`)) canonicalOf.set(long, short);
    }
  }
  return { canonicalOf, merged: canonicalOf.size };
}

/** Every (place, concern) pair's earliest and latest hit, ordered by the run's own `ts` — never by SW id, which
 *  repeats across a concatenated/multi-session ledger and isn't chronological even within one ledger. Earliest
 *  `fail` -> latest `pass` is a fix that held; the reverse is a regression; anything else (agreement, or an
 *  `unsure` at either end) isn't reported at all — a deliberate two-point read, not a full walk of every flip. */
function buildArcs(pcMap: ReadonlyMap<string, readonly Edge[]>): { fixes: Arc[]; regressions: Arc[] } {
  const fixes: (Arc & { ts: string })[] = [];
  const regressions: (Arc & { ts: string })[] = [];
  for (const [key, hits] of pcMap) {
    if (hits.length < 2) continue;
    const [place, concern] = key.split('\u0000') as [string, string];
    const byTs = [...hits].sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0));
    const first = byTs[0]!;
    const last = byTs[byTs.length - 1]!;
    if (first.gate === 'fail' && last.gate === 'pass') fixes.push({ place, concern, fromId: first.runId, toId: last.runId, ts: last.ts });
    else if (first.gate === 'pass' && last.gate === 'fail') regressions.push({ place, concern, fromId: first.runId, toId: last.runId, ts: last.ts });
  }
  const byNewest = (a: { ts: string }, b: { ts: string }): number => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0);
  const strip = ({ place, concern, fromId, toId }: Arc & { ts: string }): Arc => ({ place, concern, fromId, toId });
  return { fixes: fixes.sort(byNewest).map(strip), regressions: regressions.sort(byNewest).map(strip) };
}

function buildWindow(records: readonly LedgerRecord[]): WindowData {
  const runs = records.filter(isContractRun);
  const legacyRuns = records.filter(isRun);
  const outcomes = records.filter((r): r is OutcomeRecord => r.kind === 'outcome');
  const failed = records.filter((r): r is FailedRecord => r.kind === 'failed');

  const { edges: rawEdges, runTags } = collectEdges(runs);
  const { canonicalOf, merged: pathsMerged } = mergePathAliases(rawEdges.map((e) => e.place));
  const edges = canonicalOf.size ? rawEdges.map((e) => (canonicalOf.has(e.place) ? { ...e, place: canonicalOf.get(e.place)! } : e)) : rawEdges;

  const placeConcerns = new Map<string, Set<string>>();
  const placeRuns = new Map<string, Set<string>>();
  const placeTags = new Map<string, Set<string>>();
  const concernRuns = new Map<string, Set<string>>();
  const concernPlaces = new Map<string, Set<string>>();
  const tagRuns = new Map<string, Set<string>>();
  const tagPlaces = new Map<string, Set<string>>();
  const pcMap = new Map<string, Edge[]>();

  for (const e of edges) {
    if (!placeConcerns.has(e.place)) placeConcerns.set(e.place, new Set());
    placeConcerns.get(e.place)!.add(e.concern);
    if (!placeRuns.has(e.place)) placeRuns.set(e.place, new Set());
    placeRuns.get(e.place)!.add(e.runId);
    if (!concernRuns.has(e.concern)) concernRuns.set(e.concern, new Set());
    concernRuns.get(e.concern)!.add(e.runId);
    if (!concernPlaces.has(e.concern)) concernPlaces.set(e.concern, new Set());
    concernPlaces.get(e.concern)!.add(e.place);
    for (const tag of runTags.get(e.runId) ?? []) {
      if (!placeTags.has(e.place)) placeTags.set(e.place, new Set());
      placeTags.get(e.place)!.add(tag);
      if (!tagRuns.has(tag)) tagRuns.set(tag, new Set());
      tagRuns.get(tag)!.add(e.runId);
      if (!tagPlaces.has(tag)) tagPlaces.set(tag, new Set());
      tagPlaces.get(tag)!.add(e.place);
    }
    const key = `${e.place}\u0000${e.concern}`;
    if (!pcMap.has(key)) pcMap.set(key, []);
    pcMap.get(key)!.push(e);
  }

  interface PairStat {
    status: PairStatus;
    verdict: Verdict;
    spread: number | null;
    sameChecklist: boolean;
    runIds: string[];
    uniqGates: Gate[];
  }
  const pairStats = new Map<string, PairStat>();
  for (const [key, hits] of pcMap) {
    const runIds = [...new Set(hits.map((h) => h.runId))];
    const uniqGates = [...new Set(hits.map((h) => h.gate))];
    const status: PairStatus = uniqGates.length > 1 ? 'CONFLICT' : runIds.length >= 2 ? 'STRONG' : 'SINGLE';
    const verdict: Verdict = uniqGates.length > 1 ? 'conflict' : uniqGates[0]!;
    const ps = hits.map((h) => h.p).filter((p): p is number => p !== null);
    const spread = ps.length ? Math.max(...ps) - Math.min(...ps) : null;
    const sameChecklist = new Set(hits.map((h) => h.qtext)).size <= 1;
    pairStats.set(key, { status, verdict, spread, sameChecklist, runIds, uniqGates });
  }

  const places = [...placeConcerns.keys()].sort();
  const layerNames = new Map<string, string[]>();
  for (const place of places) {
    const dir = path.posix.dirname(place);
    const layer = dir === '.' ? '(root)' : dir;
    if (!layerNames.has(layer)) layerNames.set(layer, []);
    layerNames.get(layer)!.push(place);
  }
  const layers: Layer[] = [...layerNames.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, layerPlaces]) => ({
      name,
      cards: layerPlaces.map((place): Card => {
        const concerns = [...placeConcerns.get(place)!]
          .sort()
          .map((name2): ConcernChip => ({ name: name2, verdict: pairStats.get(`${place}\u0000${name2}`)!.verdict }));
        return {
          place,
          verdict: rollup(concerns.map((c) => c.verdict)),
          runCount: placeRuns.get(place)!.size,
          concerns,
          tags: [...(placeTags.get(place) ?? [])].sort(),
        };
      }),
    }));

  const concerns: ConcernRow[] = [
    ...[...concernRuns.entries()].map(([name, runIds]): ConcernRow => ({ key: name, label: name, kind: 'category', count: runIds.size, places: [...(concernPlaces.get(name) ?? [])].sort() })),
    ...[...tagRuns.entries()].map(([tag, runIds]): ConcernRow => ({ key: tag, label: tag, kind: 'tag', count: runIds.size, places: [...(tagPlaces.get(tag) ?? [])].sort() })),
  ].sort((a, b) => b.count - a.count || (a.kind === b.kind ? a.key.localeCompare(b.key) : a.kind === 'category' ? -1 : 1));

  const concernNames = [...concernRuns.keys()].sort();
  const cells: HeatCell[] = [];
  for (const place of places) {
    for (const concern of concernNames) {
      const stat = pairStats.get(`${place}\u0000${concern}`);
      if (!stat) {
        cells.push({ place, concern, verdict: 'none', status: 'NONE', runs: 0, gates: [], spread: null, sameChecklist: null, title: `${place} · ${concern} · no runs` });
        continue;
      }
      const spreadText = stat.spread === null ? 'n/a' : stat.spread.toFixed(2);
      const sameChecklist = stat.status === 'CONFLICT' ? stat.sameChecklist : null;
      const checklistNote =
        sameChecklist === null ? '' : sameChecklist ? ' · same checklist reused, verdict moved — real signal' : ' · different questions asked under this name — may not be comparable';
      cells.push({
        place,
        concern,
        verdict: stat.verdict,
        status: stat.status,
        runs: stat.runIds.length,
        gates: stat.uniqGates,
        spread: stat.spread,
        sameChecklist,
        title: `${place} · ${concern} · ${stat.status} · runs ${stat.runIds.length} · gate ${stat.uniqGates.join('/')} · P(yes) spread ${spreadText}${checklistNote}`,
      });
    }
  }

  const { fixes, regressions } = buildArcs(pcMap);
  const canonicalPlace = (p: string): string => canonicalOf.get(p) ?? p;
  const findings: Finding[] = runs
    .filter((r) => r.gate === 'fail')
    .sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0))
    .slice(0, LIST_CAP)
    .map((r) => ({ id: r.id, place: placeSummary(r).split(', ').map(canonicalPlace).join(', '), goal: r.goal, ts: r.ts }));

  const actors = new Set<string>();
  for (const r of runs) actors.add(r.actor);
  for (const r of legacyRuns) actors.add(r.actor);
  let paidCalls = 0;
  let spendUsd = 0;
  for (const r of runs) {
    paidCalls += r.calls;
    if (r.costUsd) spendUsd += r.costUsd;
  }
  for (const r of legacyRuns) {
    if (r.costUsd) {
      spendUsd += r.costUsd;
      paidCalls += 1;
    }
  }
  for (const f of failed) if (f.costUsd) spendUsd += f.costUsd;
  let dateFrom: string | null = null;
  let dateTo: string | null = null;
  for (const r of records) {
    if (dateFrom === null || r.ts < dateFrom) dateFrom = r.ts;
    if (dateTo === null || r.ts > dateTo) dateTo = r.ts;
  }

  const story: SessionStory = {
    runs: runs.length + legacyRuns.length,
    paidCalls,
    spendUsd,
    actors: [...actors].sort(),
    dateFrom,
    dateTo,
    fixes: fixes.slice(0, LIST_CAP),
    regressions: regressions.slice(0, LIST_CAP),
    findings,
    outcomes: buildOutcomes(runs, outcomes),
    pathsMerged,
  };

  return { layers, concerns, heatmap: { places, concerns: concernNames, cells }, story };
}

/** Builds both windows ('all' — every record — and 'last30' — the trailing 30 days by each record's own `ts`) up
 *  front, so the page's toggle is a pure client-side swap between two already-computed views: no recomputation,
 *  no second read of the ledger. */
export function buildViewerData(records: readonly LedgerRecord[], nowMs: number = Date.now()): ViewerData {
  const cutoff = nowMs - 30 * DAY_MS;
  const recent = records.filter((r) => new Date(r.ts).getTime() >= cutoff);
  return { generatedAt: new Date(nowMs).toISOString(), windows: { all: buildWindow(records), last30: buildWindow(recent) } };
}

/** Makes a JSON string safe inside `<script type="application/json">`: `<`/`>`/`&` can never form `</script>` or
 *  a stray tag, and U+2028/U+2029 (valid inside a JSON string, but a line terminator to a JS parser) can't reach
 *  any context that would matter if this were ever read as a script instead of parsed as data. */
export function escapeForInlineJson(json: string): string {
  return json
    .replace(/&/gu, '\\u0026')
    .replace(/</gu, '\\u003c')
    .replace(/>/gu, '\\u003e')
    .replace(/\u2028/gu, '\\u2028')
    .replace(/\u2029/gu, '\\u2029');
}

const CSS = `
:root {
  --bg:#f5f3ef; --surface:#ffffff; --surface2:#efece6; --surface3:#e6e2da;
  --border:#e2ded6; --border2:#c9c4ba;
  --text:#151412; --muted:#6b6862; --faint:#a09c94;
  --accent:#d4531e; --accent-bg:rgba(212,83,30,.12);
  --run:#2f8a5b; --run-bg:rgba(47,138,91,.12);
  --wait:#a8781a; --wait-bg:rgba(168,120,26,.14);
  --park:#2f6fc4; --park-bg:rgba(47,111,196,.12);
  --done:#8a877f; --done-bg:rgba(138,135,127,.16);
  --font-ui: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  --font-mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
  --r-control:5px; --r-card:6px;
  color-scheme: light;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --bg:#0c0c0c; --surface:#121212; --surface2:#1a1a1a; --surface3:#222222;
    --border:#262626; --border2:#383838;
    --text:#f2efe9; --muted:#8f8c86; --faint:#5c5a56;
    --accent:#e5622b; --accent-bg:rgba(229,98,43,.14);
    --run:#5ea87f; --run-bg:rgba(94,168,127,.14);
    --wait:#d4a54a; --wait-bg:rgba(212,165,74,.14);
    --park:#6b9bd8; --park-bg:rgba(107,155,216,.14);
    --done:#6b6b66; --done-bg:rgba(107,107,102,.18);
    color-scheme: dark;
  }
}
:root[data-theme="dark"] {
  --bg:#0c0c0c; --surface:#121212; --surface2:#1a1a1a; --surface3:#222222;
  --border:#262626; --border2:#383838;
  --text:#f2efe9; --muted:#8f8c86; --faint:#5c5a56;
  --accent:#e5622b; --accent-bg:rgba(229,98,43,.14);
  --run:#5ea87f; --run-bg:rgba(94,168,127,.14);
  --wait:#d4a54a; --wait-bg:rgba(212,165,74,.14);
  --park:#6b9bd8; --park-bg:rgba(107,155,216,.14);
  --done:#6b6b66; --done-bg:rgba(107,107,102,.18);
  color-scheme: dark;
}
* { box-sizing: border-box; }
html, body { margin:0; padding:0; background:var(--bg); color:var(--text); }
body { font-family:var(--font-ui); font-size:13px; line-height:1.5; }
.label { font-family:var(--font-mono); font-size:10px; letter-spacing:.1em; text-transform:uppercase; color:var(--muted); font-weight:600; }
button { font-family:inherit; font-size:inherit; color:inherit; background:none; border:none; cursor:pointer; }
h1,h2,h3,p,ul { margin:0; }

.topbar { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:10px 16px; border-bottom:1px solid var(--border); background:var(--surface); flex-wrap:wrap; }
.topbar-left { display:flex; align-items:center; gap:14px; }
.brand { font-weight:700; letter-spacing:.03em; font-size:12px; }
.tabs { display:flex; gap:4px; }
.tab-btn { padding:6px 12px; border-radius:var(--r-control); color:var(--muted); }
.tab-btn[aria-selected="true"] { background:var(--surface2); color:var(--text); font-weight:600; }
.topbar-right { display:flex; align-items:center; gap:8px; }
.range-group { display:flex; border:1px solid var(--border2); border-radius:var(--r-control); overflow:hidden; }
.range-btn { padding:5px 10px; color:var(--muted); }
.range-btn[aria-pressed="true"] { background:var(--surface2); color:var(--text); font-weight:600; }
.icon-btn { border:1px solid var(--border2); border-radius:var(--r-control); padding:5px 10px; }

.layout { display:grid; grid-template-columns: 220px 1fr 300px; align-items:start; }
.rail { padding:14px; }
.rail-left { border-right:1px solid var(--border); position:sticky; top:0; }
.rail-right { border-left:1px solid var(--border); background:var(--surface); }
.center { padding:16px; min-width:0; }

.concern-row { display:flex; width:100%; justify-content:space-between; align-items:center; gap:8px; padding:6px 8px; border-radius:var(--r-control); margin-bottom:2px; text-align:left; }
.concern-row:hover { background:var(--surface2); }
.concern-row.active { background:var(--accent-bg); color:var(--accent); font-weight:600; }
.concern-name { font-family:var(--font-mono); font-size:11.5px; overflow-wrap:anywhere; }
.concern-count { font-family:var(--font-mono); color:var(--muted); font-size:11px; }

.layer { margin-bottom:22px; }
.layer-head { display:flex; align-items:baseline; gap:8px; margin-bottom:8px; }
.layer-num { font-family:var(--font-mono); font-size:11px; color:var(--muted); border:1px solid var(--border2); border-radius:3px; padding:1px 6px; }
.layer-name { font-family:var(--font-mono); font-weight:700; font-size:12.5px; }
.card-grid { display:flex; flex-wrap:wrap; gap:10px; }
.card { width:220px; border:1px solid var(--border2); border-left-width:4px; border-radius:var(--r-card); background:var(--surface); padding:10px; transition:opacity .15s; }
.card.dim { opacity:.25; }
.card.hl { outline:2px solid var(--accent); outline-offset:1px; }
.card-title { font-family:var(--font-mono); font-size:11.5px; overflow-wrap:anywhere; margin-bottom:4px; }
.card-meta { color:var(--muted); font-size:11px; margin-bottom:6px; }
.chip-row { display:flex; flex-wrap:wrap; gap:4px; }
.chip { font-family:var(--font-mono); font-size:9.5px; text-transform:uppercase; letter-spacing:.05em; padding:2px 6px; border-radius:3px; border:1px solid var(--border2); }

.v-pass { border-left-color:var(--run); } .chip.v-pass, .heat-cell.v-pass { background:var(--run-bg); color:var(--run); }
.v-fail { border-left-color:var(--accent); } .chip.v-fail, .heat-cell.v-fail { background:var(--accent-bg); color:var(--accent); }
.v-unsure { border-left-color:var(--wait); } .chip.v-unsure, .heat-cell.v-unsure { background:var(--wait-bg); color:var(--wait); }
.v-conflict { border-left-color:var(--park); } .chip.v-conflict, .heat-cell.v-conflict { background:var(--park-bg); color:var(--park); }
.v-none { border-left-color:var(--done); } .chip.v-none, .heat-cell.v-none { background:var(--done-bg); color:var(--muted); }

.heat-table-wrap { overflow:auto; max-width:100%; }
.heat-table { border-collapse:collapse; font-size:12px; }
.heat-table th, .heat-table td { border:1px solid var(--border); padding:0; }
.heat-table th.col-label { padding:6px 4px; font-family:var(--font-mono); font-size:9.5px; text-transform:uppercase; letter-spacing:.04em; color:var(--muted); white-space:nowrap; }
.heat-table th.row-label { text-align:left; padding:4px 8px; font-family:var(--font-mono); font-size:11px; white-space:nowrap; background:var(--surface); }
.heat-table th.corner { background:var(--surface); }
.heat-cell { width:26px; height:22px; }

.story-section { margin-bottom:18px; }
.story-section .label { display:block; margin-bottom:6px; }
.stat-row { display:flex; justify-content:space-between; gap:8px; margin-bottom:4px; font-size:12px; }
.stat-row .k { color:var(--muted); }
ul.story-list { list-style:none; font-family:var(--font-mono); font-size:11px; }
ul.story-list li { padding:3px 0; border-bottom:1px solid var(--border); overflow-wrap:anywhere; }
.muted { color:var(--muted); }

.viewer-footer { text-align:center; padding:14px; color:var(--faint); font-size:11px; border-top:1px solid var(--border); }

@media (max-width: 900px) {
  .layout { grid-template-columns: 1fr; }
  .rail-left, .rail-right { border:none; border-top:1px solid var(--border); position:static; }
}
`;

const BODY = `
<header class="topbar">
  <div class="topbar-left">
    <span class="brand">SIDEWISE</span>
    <nav class="tabs" role="tablist">
      <button class="tab-btn" type="button" data-tab="map" aria-selected="true" role="tab">Map</button>
      <button class="tab-btn" type="button" data-tab="heat" aria-selected="false" role="tab">Heat map</button>
    </nav>
  </div>
  <div class="topbar-right">
    <div class="range-group" role="group" aria-label="time range">
      <button class="range-btn" type="button" data-range="all" aria-pressed="true">All</button>
      <button class="range-btn" type="button" data-range="last30" aria-pressed="false">Last 30 days</button>
    </div>
    <button class="icon-btn" type="button" id="theme-btn" title="Toggle light/dark">Theme</button>
  </div>
</header>
<div class="layout">
  <aside class="rail rail-left">
    <span class="label">Concerns</span>
    <div id="rail-concerns"></div>
  </aside>
  <main class="center">
    <section id="tab-map" class="tab-panel">
      <div id="map-layers"></div>
    </section>
    <section id="tab-heat" class="tab-panel" hidden>
      <div class="heat-table-wrap" id="heat-host"></div>
    </section>
  </main>
  <aside class="rail rail-right">
    <span class="label">Session story</span>
    <div class="story-section">
      <div class="stat-row"><span class="k">Runs</span><span id="story-runs"></span></div>
      <div class="stat-row"><span class="k">Paid calls</span><span id="story-calls"></span></div>
      <div class="stat-row"><span class="k">Spend</span><span id="story-spend"></span></div>
      <div class="stat-row"><span class="k">Actors</span><span id="story-actors"></span></div>
      <div class="stat-row"><span class="k">Range</span><span id="story-range"></span></div>
      <div class="stat-row"><span class="k">Paths merged</span><span id="story-merged"></span></div>
    </div>
    <div class="story-section">
      <span class="label">Fixes held</span>
      <ul class="story-list" id="story-fixes"></ul>
    </div>
    <div class="story-section">
      <span class="label">Regressions</span>
      <ul class="story-list" id="story-regressions"></ul>
    </div>
    <div class="story-section">
      <span class="label">Latest findings</span>
      <ul class="story-list" id="story-findings"></ul>
    </div>
    <div class="story-section">
      <span class="label">Outcomes</span>
      <div id="story-outcomes" class="muted"></div>
    </div>
  </aside>
</div>
<footer class="viewer-footer">A System One needs a Knowledge One. · Sidewise</footer>
`;

// Vanilla JS, no dependencies: reads #viewer-data with JSON.parse (never eval), and writes every piece of
// ledger-derived text to the page with textContent/className/title — never innerHTML — so escapeForInlineJson
// above is defense in depth, not the only thing standing between untrusted ledger text and script execution.
const CLIENT_JS = `
(function () {
  'use strict';
  var raw = document.getElementById('viewer-data').textContent;
  var data = JSON.parse(raw);
  var state = { range: 'all', tab: 'map', highlight: null };

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined && text !== null) e.textContent = text;
    return e;
  }
  function setText(id, text) {
    var e = document.getElementById(id);
    if (e) e.textContent = text;
  }
  function currentWindow() { return data.windows[state.range]; }
  function verdictClass(v) { return 'v-' + v; }

  function renderConcerns() {
    var host = document.getElementById('rail-concerns');
    host.textContent = '';
    var w = currentWindow();
    if (!w.concerns.length) { host.appendChild(el('p', 'muted', 'none yet')); return; }
    w.concerns.forEach(function (c) {
      var row = el('button', 'concern-row');
      row.type = 'button';
      if (state.highlight === c.key) row.classList.add('active');
      row.appendChild(el('span', 'concern-name', c.label));
      row.appendChild(el('span', 'concern-count', String(c.count)));
      row.addEventListener('click', function () {
        state.highlight = state.highlight === c.key ? null : c.key;
        render();
      });
      host.appendChild(row);
    });
  }

  function renderMap() {
    var host = document.getElementById('map-layers');
    host.textContent = '';
    var w = currentWindow();
    if (!w.layers.length) { host.appendChild(el('p', 'muted', 'No runs recorded yet.')); return; }
    w.layers.forEach(function (layer, i) {
      var sec = el('section', 'layer');
      var head = el('div', 'layer-head');
      head.appendChild(el('span', 'layer-num', String(i + 1)));
      head.appendChild(el('span', 'layer-name', layer.name));
      sec.appendChild(head);
      var grid = el('div', 'card-grid');
      layer.cards.forEach(function (card) {
        var concernNames = card.concerns.map(function (x) { return x.name; });
        var c = el('article', 'card ' + verdictClass(card.verdict));
        if (state.highlight) {
          var hit = concernNames.indexOf(state.highlight) !== -1 || card.tags.indexOf(state.highlight) !== -1;
          c.classList.add(hit ? 'hl' : 'dim');
        }
        c.appendChild(el('div', 'card-title', card.place));
        c.appendChild(el('div', 'card-meta', card.runCount + (card.runCount === 1 ? ' run' : ' runs')));
        var chips = el('div', 'chip-row');
        card.concerns.forEach(function (cc) { chips.appendChild(el('span', 'chip ' + verdictClass(cc.verdict), cc.name)); });
        c.appendChild(chips);
        grid.appendChild(c);
      });
      sec.appendChild(grid);
      host.appendChild(sec);
    });
  }

  function renderHeat() {
    var host = document.getElementById('heat-host');
    host.textContent = '';
    var w = currentWindow();
    if (!w.heatmap.places.length || !w.heatmap.concerns.length) { host.appendChild(el('p', 'muted', 'No runs recorded yet.')); return; }
    var table = el('table', 'heat-table');
    var thead = el('thead');
    var hr = el('tr');
    hr.appendChild(el('th', 'corner'));
    w.heatmap.concerns.forEach(function (cn) { hr.appendChild(el('th', 'col-label', cn)); });
    thead.appendChild(hr);
    table.appendChild(thead);
    var tbody = el('tbody');
    var cellMap = {};
    w.heatmap.cells.forEach(function (cell) { cellMap[cell.place + '\\u0000' + cell.concern] = cell; });
    w.heatmap.places.forEach(function (place) {
      var row = el('tr');
      row.appendChild(el('th', 'row-label', place));
      w.heatmap.concerns.forEach(function (cn) {
        var cell = cellMap[place + '\\u0000' + cn];
        var td = el('td', 'heat-cell ' + verdictClass(cell.verdict));
        td.title = cell.title;
        row.appendChild(td);
      });
      tbody.appendChild(row);
    });
    table.appendChild(tbody);
    host.appendChild(table);
  }

  function renderList(id, items, fmt, emptyText) {
    var host = document.getElementById(id);
    host.textContent = '';
    if (!items.length) { host.appendChild(el('li', 'muted', emptyText)); return; }
    items.forEach(function (it) { host.appendChild(el('li', null, fmt(it))); });
  }

  // The exact same formatUsd implementation tested in report-web.test.ts, embedded verbatim — never a second,
  // hand-copied one that could drift from it.
  ${formatUsd.toString()}

  function renderStory() {
    var s = currentWindow().story;
    setText('story-runs', String(s.runs));
    setText('story-calls', String(s.paidCalls));
    setText('story-spend', formatUsd(s.spendUsd));
    setText('story-actors', s.actors.length ? s.actors.join(', ') : 'none');
    setText('story-range', (s.dateFrom ? s.dateFrom.slice(0, 10) : '—') + ' → ' + (s.dateTo ? s.dateTo.slice(0, 10) : '—'));
    setText('story-merged', String(s.pathsMerged));
    var arcText = function (f) { return f.place + ' · ' + f.concern + ' · ' + f.fromId + ' → ' + f.toId; };
    renderList('story-fixes', s.fixes, arcText, 'none yet');
    renderList('story-regressions', s.regressions, arcText, 'none');
    renderList('story-findings', s.findings, function (f) { return f.id + ' · ' + f.place + ' · ' + f.goal; }, 'none');
    setText('story-outcomes', 'held ' + s.outcomes.held + ' · overruled ' + s.outcomes.overruled + ' · failed ' + s.outcomes.failed + ' · open ' + s.outcomes.open);
  }

  function render() {
    renderConcerns();
    renderMap();
    renderHeat();
    renderStory();
    document.getElementById('tab-map').hidden = state.tab !== 'map';
    document.getElementById('tab-heat').hidden = state.tab !== 'heat';
    Array.prototype.forEach.call(document.querySelectorAll('.tab-btn'), function (b) { b.setAttribute('aria-selected', b.dataset.tab === state.tab ? 'true' : 'false'); });
    Array.prototype.forEach.call(document.querySelectorAll('.range-btn'), function (b) { b.setAttribute('aria-pressed', b.dataset.range === state.range ? 'true' : 'false'); });
  }

  Array.prototype.forEach.call(document.querySelectorAll('.tab-btn'), function (b) {
    b.addEventListener('click', function () { state.tab = b.dataset.tab; render(); });
  });
  Array.prototype.forEach.call(document.querySelectorAll('.range-btn'), function (b) {
    b.addEventListener('click', function () { state.range = b.dataset.range; render(); });
  });

  var themeBtn = document.getElementById('theme-btn');
  function applyTheme(t) {
    if (t) document.documentElement.setAttribute('data-theme', t);
    else document.documentElement.removeAttribute('data-theme');
  }
  var saved = null;
  try { saved = localStorage.getItem('sidewise-viewer-theme'); } catch (e) { saved = null; }
  if (saved === 'light' || saved === 'dark') applyTheme(saved);
  themeBtn.addEventListener('click', function () {
    var current = document.documentElement.getAttribute('data-theme');
    var prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    var next = current === 'dark' ? 'light' : current === 'light' ? null : (prefersDark ? 'light' : 'dark');
    applyTheme(next);
    try {
      if (next) localStorage.setItem('sidewise-viewer-theme', next);
      else localStorage.removeItem('sidewise-viewer-theme');
    } catch (e) { /* per-viewer convenience only; a blocked store just means the toggle doesn't persist */ }
  });

  render();
})();
`;

export function renderViewerHtml(data: ViewerData): string {
  const json = escapeForInlineJson(JSON.stringify(data));
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sidewise ledger viewer</title>
<style>${CSS}</style>
</head>
<body>
${BODY}
<script type="application/json" id="viewer-data">${json}</script>
<script>${CLIENT_JS}</script>
</body>
</html>
`;
}

export interface ReportWebContext {
  paths: SidewisePaths;
  env: Record<string, string | undefined>;
  runner: Runner;
  platform: NodeJS.Platform;
  now?: () => number;
}

/** Best-effort only: on Linux with no display, or when the command itself fails or is missing, this returns
 *  false and the caller prints the path instead — never a stop, never a nonzero exit (mechanics: "if that
 *  fails or there's no display, just print the path"). */
function tryOpen(filePath: string, platform: NodeJS.Platform, runner: Runner, env: Record<string, string | undefined>): boolean {
  if (platform === 'linux' && !env.DISPLAY?.trim() && !env.WAYLAND_DISPLAY?.trim()) return false;
  const [cmd, args]: [string, string[]] = platform === 'darwin' ? ['open', [filePath]] : platform === 'win32' ? ['cmd', ['/c', 'start', '', filePath]] : ['xdg-open', [filePath]];
  try {
    return runner(cmd, args).status === 0;
  } catch {
    return false;
  }
}

/** Free and read-only on the ledger: readLedger only (never withIndex — this never touches index.db), then one
 *  write, `.sidewise/viewer.html`, and a best-effort open. Always prints the file's path, opened or not. */
export function runReportWeb(ctx: ReportWebContext): VerbResult {
  const records = readLedger(ctx.paths, { partialTail: true });
  const data = buildViewerData(records, ctx.now ? ctx.now() : Date.now());
  const html = renderViewerHtml(data);
  ensureDir(ctx.paths);
  const viewerPath = path.join(ctx.paths.dir, 'viewer.html');
  writeFileSync(viewerPath, html);
  const shown = path.relative(ctx.paths.root, viewerPath).split(path.sep).join('/');
  const opened = tryOpen(viewerPath, ctx.platform, ctx.runner, ctx.env);
  const runCount = data.windows.all.story.runs;
  const placeCount = data.windows.all.layers.reduce((n, l) => n + l.cards.length, 0);
  const summary = `sidewise report web · wrote ${shown} (${runCount} run${runCount === 1 ? '' : 's'}, ${placeCount} place${placeCount === 1 ? '' : 's'})`;
  return { exit: 0, text: opened ? `${summary} → opened in your browser` : `${summary} → open it yourself, no browser available` };
}
