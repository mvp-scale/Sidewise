/**
 * `sidewise report [hits|patterns|history]`: the one way knowledge leaves the
 * ledger besides a run's own response — free, read-only, never calls a provider, no options beyond the view
 * name (`hits` default). Every read goes through `withIndex(..., {readOnly:true})`, exactly like `view.ts`, so
 * it works unchanged on the linear-fallback path too (no on-disk index, or Node < 22.13's own test hook).
 *   hits     — the newest run's own gate per place x category, worst first, flagging a one-subject answer
 *              whose code has since changed (re-derived live, on the bounded set of rows actually shown —
 *              never a full-ledger scan; see isStale below).
 *   patterns — every question-set fingerprint (ledger/index.ts's patternFingerprint) ever run, with its
 *              pass/fail/unsure split, places touched, and outcomes.
 *   history  — a merged, newest-first feed of `change` results (fixed/regressed, derived from the change run's
 *              own before/after answers — never a new ledger write) and recorded outcomes.
 */
import { answerKey, subjectEvidence, subjectQuestions } from '../contract/translate.ts';
import { readCodeEvidence } from '../evidence/code.ts';
import { readRecordAt, stripLines, sweepPlaces, withIndex, type PatternRow } from '../ledger/index.ts';
import { isContractRun, isRun, type ContractRun, type LedgerRecord } from '../ledger/log.ts';
import type { SidewisePaths } from '../ledger/paths.ts';
import { clip, hasControlChars } from '../util/text.ts';
import { gradeChange } from './change.ts';
import type { VerbResult } from './types.ts';

export interface ReportContext {
  paths: SidewisePaths;
}

const VIEWS = ['hits', 'patterns', 'history'] as const;
type ReportView = (typeof VIEWS)[number];
const isView = (s: string): s is ReportView => (VIEWS as readonly string[]).includes(s);

const ROW_LIMIT = 30;

/** Every view caps its rows the same way: show up to `ROW_LIMIT`, worst/newest first,
 *  and say plainly how many more exist rather than silently dropping them. */
function withCap(lines: readonly string[], total: number): string[] {
  const shown = lines.slice(0, ROW_LIMIT);
  return total > shown.length ? [...shown, `… ${total - shown.length} more not shown`] : [...shown];
}

const heading = (view: ReportView, n: number, noun: string): string => `sidewise report ${view} · ${n} ${noun}${n === 1 ? '' : 's'}`;

/** A one-subject run's category answer is stale when the code at its own `where` has changed since: re-derive
 *  the current evidence key for one of that category's questions (the same way class.ts computed it originally)
 *  and compare to the run's own stored key. A sweep item's evidence isn't reconstructed here (its own text
 *  isn't just "the file" — evidence/units.ts builds it) — out of scope this round, always reported as fresh. */
function isStale(root: string, rec: ContractRun, categoryName: string): boolean {
  const cat = rec.ask.categories.find((c) => c.name === categoryName);
  if (!cat || !cat.questions.length) return false;
  const [q] = subjectQuestions([cat]);
  const evidence = readCodeEvidence(root, rec.where);
  if (!evidence.ok) return true; // the code this run read can't even be re-read the same way any more
  const key = answerKey(subjectEvidence(evidence.evidence.files), q!);
  return rec.keys[q!.id] !== key;
}

interface HitRow {
  place: string;
  category: string;
  gate: string;
  runId: string;
  goal: string;
  stale: boolean;
}

const GATE_RANK: Record<string, number> = { fail: 0, unsure: 1, pass: 2 };

function reportHits(paths: SidewisePaths): VerbResult {
  const rows = withIndex(
    paths,
    (handle) => {
      const out: HitRow[] = [];
      const places = handle.distinctPlaces().filter((p) => p.kind === 'where');
      for (const { val: place } of places) {
        const newest = handle.placeCandidates(place).at(-1); // oldest-first: the last one is the newest
        if (!newest) continue;
        const rec = readRecordAt(paths.log, newest.offset);
        if (!rec || !isContractRun(rec)) continue;
        if (rec.items === null) {
          for (const [category, gate] of Object.entries(rec.categories)) {
            out.push({ place, category, gate, runId: rec.id, goal: rec.goal, stale: isStale(paths.root, rec, category) });
          }
        } else {
          for (const item of Object.values(rec.items)) {
            if (item.unit?.path !== place) continue;
            for (const [category, gate] of Object.entries(item.categories)) out.push({ place, category, gate, runId: rec.id, goal: rec.goal, stale: false });
          }
        }
      }
      return out;
    },
    { readOnly: true },
  );
  if (!rows.length) return { exit: 0, text: 'sidewise report hits · no runs yet → "sidewise class <request>" starts one' };
  rows.sort((a, b) => GATE_RANK[a.gate]! - GATE_RANK[b.gate]! || a.place.localeCompare(b.place) || a.category.localeCompare(b.category));
  const lines = rows.map((r) => `${clip(r.place, 50)} · ${r.category} ${r.gate} · ${r.runId} "${clip(r.goal, 40)}"${r.stale ? ' · stale' : ''}`);
  return { exit: 0, text: [heading('hits', rows.length, 'row'), ...withCap(lines, rows.length)].join('\n') };
}

function reportPatterns(paths: SidewisePaths): VerbResult {
  const rows: PatternRow[] = withIndex(paths, (h) => h.patternCounts(), { readOnly: true });
  if (!rows.length) return { exit: 0, text: 'sidewise report patterns · no runs yet → "sidewise class <request>" starts one' };
  const lines = rows.map(
    (r) =>
      `${r.pattern} · runs ${r.runs} · places ${r.places} · pass ${r.pass} fail ${r.fail} unsure ${r.unsure} · ` +
      `held ${r.outcomes.held} overruled ${r.outcomes.overruled} failed ${r.outcomes.failed} open ${r.outcomes.open}`,
  );
  return { exit: 0, text: [heading('patterns', rows.length, 'pattern'), ...withCap(lines, rows.length)].join('\n') };
}

/** Every place a run (of either shape) touched, for one display line — the same sources view.ts's own place
 *  matching reads from, just joined rather than matched against one target. */
function placesOf(rec: LedgerRecord | undefined): string {
  if (!rec) return '(unknown place)';
  if (isRun(rec)) return rec.where.map((w) => w.path).join(', ') || '(no place)';
  if (!isContractRun(rec)) return '(unknown place)';
  const ws = rec.where.map(stripLines);
  if (ws.length) return ws.join(', ');
  const sweep = sweepPlaces(rec)
    .filter((p) => p.kind === 'where')
    .map((p) => p.val);
  return sweep.length ? sweep.join(', ') : '(no place)';
}

/** `change` results turn into 'fixed'/'regressed' from the run's OWN before/after answers — `change.ts`'s
 *  `gradeChange`, shared rather than copied, is the same regression call `change` itself already made (any
 *  regression anywhere wins over any fix). Never the parent's stored gate, which can be stale by the time this
 *  reads it. A run that changed nothing worth naming (every category held steady) yields no row at all. */
function changeStatus(rec: ContractRun): 'fixed' | 'regressed' | undefined {
  const graded = gradeChange(rec.ask.categories, rec.answers);
  if (graded.regressed.length) return 'regressed';
  return graded.categories.some((c) => c.before !== 'pass' && c.after === 'pass') ? 'fixed' : undefined;
}

function reportHistory(paths: SidewisePaths): VerbResult {
  const rows = withIndex(
    paths,
    (handle) => {
      const out: { ts: string; text: string }[] = [];
      for (const { offset } of handle.recentChanges(ROW_LIMIT)) {
        const rec = readRecordAt(paths.log, offset);
        if (!rec || !isContractRun(rec)) continue;
        const status = changeStatus(rec);
        if (!status) continue;
        out.push({ ts: rec.ts, text: `${placesOf(rec)} · ${rec.id} change · ${status}` });
      }
      for (const o of handle.recentOutcomes(ROW_LIMIT)) {
        const runOffset = handle.findOffset(o.runId);
        const rec = runOffset === undefined ? undefined : readRecordAt(paths.log, runOffset);
        out.push({ ts: o.ts, text: `${placesOf(rec)} · ${o.runId} · ${o.outcome} by ${o.by}` });
      }
      return out;
    },
    { readOnly: true },
  );
  if (!rows.length) return { exit: 0, text: 'sidewise report history · nothing yet → run "change" or "outcome" to start one' };
  rows.sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0));
  return { exit: 0, text: [heading('history', rows.length, 'event'), ...withCap(rows.map((r) => r.text), rows.length)].join('\n') };
}

export function runReport(view: string | undefined, ctx: ReportContext): VerbResult {
  const target = view?.trim() || 'hits';
  if (hasControlChars(target)) return { exit: 2, text: '✖ report: the view name has control characters → use hits, patterns or history' };
  if (!isView(target)) return { exit: 2, text: `✖ report: "${clip(target, 40)}" is not a view → use hits, patterns or history` };
  if (target === 'hits') return reportHits(ctx.paths);
  if (target === 'patterns') return reportPatterns(ctx.paths);
  return reportHistory(ctx.paths);
}
