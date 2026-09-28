/**
 * Answer reuse: the same question on the same evidence, answered before by the same provider and model, comes
 * back from the ledger with no call. Keys are answerKey hashes (contract/translate.ts).
 * A run whose latest outcome is overruled or failed is never reused, nor is an answer that came from one.
 *
 * Reads the id index (ledger/index.ts — SQLite, self-healing, or its in-memory linear fallback) instead of a
 * linear readLedger scan.
 *
 * lookupAnswers has an O(1) fast path per requested key through `IndexHandle.reuseKeyHit`: the *origin* run that
 * currently holds the newest answer for that key (the index's answer_keys table, self-compacting — one row per
 * distinct (who, key) ever asked). It's safe to use the returned `offset` as long as that origin itself checks
 * out unblocked (`hit.blocked`) — if it's blocked, this falls back to the scan below rather than guessing, so
 * the "older still-valid holder" case (next paragraph) is never missed. What it deliberately does NOT do is
 * trust the stored `qid`: that's the *reusing* run's own qid for the key, which can legitimately differ from
 * the origin's own qid for the same key (they're numbered per-request) — reading `origin.answers[stored qid]`
 * on a mismatch reads the wrong slot, or none. Instead it re-reads the origin's own record and finds the
 * origin's own qid for the key locally (a 1-3 entry scan of its own `keys`), then reads the origin's own
 * `answers` at that qid — the same value a reusing run would have copied from it verbatim, so this is exactly
 * the answer a plain linear scan would have found from that origin's own, independent appearance in the
 * ledger (see the exactReuse comment below for why this same trick does not carry over to it).
 *
 * exactReuse, and any key lookupAnswers' fast path can't safely resolve, walk `handle.candidates(adapter,
 * model)` — every UNBLOCKED contract run for this adapter+model, newest first, with its offset, from a single
 * query — reading each candidate with one `readRecordAt(paths.log, offset)` against the SAME handle the caller
 * already opened once at the top of the call (never `findRun`, which opens the index itself — doing that per
 * candidate inside a scan would reopen/re-check the index once per candidate instead of once per call). This is
 * a newest-to-oldest walk over the whole ledger, scoped to the matching provider and backed by offsets instead
 * of an in-memory array — including reading the answer from the CANDIDATE run's own `answers[qid]`, for the
 * same reason the fast path above re-derives the qid rather than trusting a stored one. The reuse index's
 * single "current holder" row per key has a second gap beyond the qid mismatch: it's overwritten
 * unconditionally on every apply, so if the newest run to touch a key is later overruled, it has no memory of
 * the older, still-valid run that held the same key before it — exactly the case a plain linear scan handles
 * correctly (skip the blocked run, let the earlier one's answer stand). Walking candidates newest-first and
 * skipping blocked ones reproduces that behavior exactly.
 *
 * exactReuse can't use the same O(1) shortcut lookupAnswers does: it must return the id of the *matching run
 * itself* (the candidate being examined — not its reuse origin), but the reuse index only remembers a key's
 * origin, discarding the identity of whichever run most recently touched it if that run itself was a reuse
 * (its own id is never stored anywhere once overwritten). Answering from it here would silently return the
 * wrong run whenever the latest toucher reused rather than asked fresh — worse, one that would go undetected
 * by the synthetic test generator, since it never populates `reusedFrom` at all (every generated run is its
 * own origin), so a real ledger with actual reuse chains is exactly where
 * the bug would first surface. Kept as the full scan; see docs/evidence/ledger-scale.md for the measured cost
 * and why it wasn't chased further.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import type { Answer } from '../contract/types.ts';
import { readRecordAt, withIndex, type IndexHandle } from './index.ts';
import { findRun, isContractRun, type ContractRun, type TelemetryEntry } from './log.ts';
import { onStore } from './lock.ts';
import type { SidewisePaths } from './paths.ts';

export interface Who {
  adapter: string;
  model: string;
}

/** plan 2c B3: caps beyond which a reused answer is treated as stale and skipped (falling through to an
 *  older still-valid holder, or a fresh ask). Either bound omitted = no cap on that dimension (today's
 *  behavior) — see `.sidewise/config.yaml`'s `reuse: {maxAgeDays, maxCommits}` (src/config/defaults.ts). */
export interface ReuseLimits {
  maxAgeDays?: number;
  maxCommits?: number;
}

export interface Reusable {
  /** The run that first answered it. */
  id: string;
  answer: Answer;
  /** The origin run's own timestamp, commit and where — carried through for age/commits-since display
   *  (reuseAge below) and for the maxAgeDays/maxCommits staleness check. `commit` is null when the origin
   *  couldn't resolve one (not a repo, git absent) — never guessed. */
  ts: string;
  commit: string | null;
  where: string[];
}

/** How many commits separate `sha` from HEAD, in the git repo that actually contains `wherePaths` — the same
 *  "repo that contains the run's own where files" rule evidence/git.ts's resolveRefSha/currentCommitSha use,
 *  duplicated here in miniature (this module doesn't own evidence/git.ts, so it can't add a rev-list export
 *  there this round; a future cleanup could hoist one shared helper). null when git, the sha, or the repo
 *  aren't available — never a fake 0, so a caller can't mistake "unknown" for "no drift". Never throws: a
 *  missing git binary or an unresolvable path both just mean "can't tell". */
function commitsSince(root: string, sha: string | null, wherePaths: readonly string[]): number | null {
  if (!sha) return null;
  try {
    const first = wherePaths[0];
    const dir = first ? path.dirname(path.resolve(root, first.split(':')[0]!)) : root;
    const top = spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd: dir, encoding: 'utf8' });
    const gitRoot = top.status === 0 ? top.stdout.trim() : '';
    if (!gitRoot) return null;
    const count = spawnSync('git', ['rev-list', '--count', `${sha}..HEAD`], { cwd: gitRoot, encoding: 'utf8' });
    if (count.status !== 0) return null;
    const n = Number(count.stdout.trim());
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

/** {ts, commit, where} -> how stale a reused answer actually is, for display (view.ts) or a staleness check
 *  (isStale below). `ageDays` floors at 0 (a clock skew or same-instant reuse never reads as negative). */
export interface ReuseAge {
  ageDays: number;
  commitsSince: number | null;
}
export function reuseAge(paths: SidewisePaths, r: Pick<Reusable, 'ts' | 'commit' | 'where'>, now: number = Date.now()): ReuseAge {
  const parsed = Date.parse(r.ts);
  const ageDays = Number.isFinite(parsed) ? Math.max(0, Math.floor((now - parsed) / 86_400_000)) : 0;
  return { ageDays, commitsSince: commitsSince(paths.root, r.commit, r.where) };
}

/** plan 2c B, item 5: every verb that reuses answers shows each reused run's age/commits-since, not just
 *  view's own exact-reuse (which already renders it structurally as reuseAge:). This is the smaller-format-change
 *  option the plan allows for the other verbs (class/drill/replay/sweeps): their existing `reused: [ids]` list
 *  stays exactly as it was: one extra notes: line names each distinct id's own age, so nothing that already reads
 *  that field breaks. Capped at MAX_REUSED_AGE_NOTES ids (a big sweep can reuse from many distinct origins); empty
 *  when `ids` is empty. */
const MAX_REUSED_AGE_NOTES = 5;
export function reusedAgeNotes(paths: SidewisePaths, ids: readonly string[]): string[] {
  if (!ids.length) return [];
  const shown = ids.slice(0, MAX_REUSED_AGE_NOTES);
  const parts = shown.map((id) => {
    const run = findRun(paths, id);
    if (!run || !isContractRun(run)) return `${id} (age unknown)`;
    const age = reuseAge(paths, { ts: run.ts, commit: run.commit ?? null, where: run.where });
    const commits = age.commitsSince !== null ? `, ${age.commitsSince} commit${age.commitsSince === 1 ? '' : 's'}` : '';
    return `${id} (${age.ageDays}d${commits})`;
  });
  const more = ids.length > shown.length ? `, +${ids.length - shown.length} more` : '';
  return [`reused: ${parts.join(', ')}${more}`];
}

/** Whether `r` is too old/too far behind to reuse under `limits` — either bound only applies when it's
 *  actually set; `commitsSince` returning null (can't tell) never counts as stale on its own. */
function isStale(paths: SidewisePaths, r: Pick<Reusable, 'ts' | 'commit' | 'where'>, limits: ReuseLimits | undefined, now: number): boolean {
  if (!limits || (limits.maxAgeDays === undefined && limits.maxCommits === undefined)) return false;
  const { ageDays, commitsSince: since } = reuseAge(paths, r, now);
  if (limits.maxAgeDays !== undefined && ageDays > limits.maxAgeDays) return true;
  if (limits.maxCommits !== undefined && since !== null && since > limits.maxCommits) return true;
  return false;
}

/** The record at `offset`, if it's a contract run for `who` — a defensive re-check (the index already scopes
 *  by adapter/model server-side, so this should always hold; readRecordAt never throws for a stale offset). */
function readCandidate(paths: SidewisePaths, offset: number, who: Who): ContractRun | undefined {
  const run = readRecordAt(paths.log, offset);
  return run && isContractRun(run) && run.adapter === who.adapter && run.model === who.model ? run : undefined;
}

/** The fast path for one key: the reuse index's current holder, re-read from its own record (never the stored
 *  qid — see the file header). undefined when the slot is empty, its holder is blocked, too stale under
 *  `limits` (plan 2c B3 D2 — the caller then falls back to the scan, which can find an older still-valid
 *  holder), or anything about it doesn't check out (a stale offset, a shape that no longer matches). */
function fastReuse(paths: SidewisePaths, handle: IndexHandle, who: Who, key: string, limits: ReuseLimits | undefined, now: number): Reusable | undefined {
  const hit = handle.reuseKeyHit(who.adapter, who.model, key);
  if (!hit || hit.blocked) return undefined;
  const origin = readCandidate(paths, hit.offset, who);
  if (!origin) return undefined;
  const originQid = Object.entries(origin.keys).find(([, k]) => k === key)?.[0];
  if (originQid === undefined) return undefined;
  const answer = origin.answers[originQid];
  if (!answer) return undefined;
  const reusable: Reusable = { id: origin.id, answer, ts: origin.ts, commit: origin.commit ?? null, where: origin.where };
  return isStale(paths, reusable, limits, now) ? undefined : reusable;
}

/** Key → the newest reusable answer for it, for the keys asked about. The fast path (above) resolves most keys
 *  in O(1); whatever it can't, the fallback walks candidates newest first, so a key whose newest holder is now
 *  blocked still correctly falls back further to an older still-valid holder of the same key. Before that walk,
 *  `everHeld` drops any key that NO run has ever held at all (the answer_keys table proves it conclusively) —
 *  the common "genuinely new question" reuse MISS, which used to pay for walking every candidate run for the
 *  provider only to confirm what a single missing row already proved. `opts.readOnly`: threaded through to
 *  withIndex for callers that must never persist a catch-up/rebuild here (a sweep verb's --dry-run planning,
 *  which still needs to know what WOULD reuse: a dry run writes nothing).
 *  `out` is built INSIDE the withIndex callback (never captured from outside it): withIndex retries `fn` from
 *  scratch against the in-memory fallback if the SQL attempt throws partway through, so a partially-filled `out`
 *  from that aborted attempt must never survive into the retry — building it fresh per `fn` invocation is what
 *  guarantees that. Wrapped in onStore: once a verb resolves reuse BEFORE preflight, this
 *  is the first read to touch `.sidewise/` at all on some paths — a structurally broken log.jsonl (e.g. a
 *  directory where the file should be) must come back as preflight's own clean StoreError, never a raw errno
 *  escaping unwrapped just because this call now sometimes runs first. */
/** The record `origin` names (an id, not an offset) if it's a contract run for `who` — used only when a
 *  candidate's own `reusedFrom[qid]` points past it to a deeper origin, so that origin's OWN ts/commit/where
 *  (not the candidate's) drive age/commits-since and staleness (plan 2c B3). `handle.findOffset` is the same
 *  id -> offset lookup `view.ts`'s lineage walk already relies on. */
function readOrigin(paths: SidewisePaths, handle: IndexHandle, origin: string, who: Who): ContractRun | undefined {
  const offset = handle.findOffset(origin);
  return offset === undefined ? undefined : readCandidate(paths, offset, who);
}

export function lookupAnswers(
  paths: SidewisePaths,
  who: Who,
  keys: readonly string[],
  opts: { readOnly?: boolean; reuse?: ReuseLimits; now?: number } = {},
): Map<string, Reusable> {
  const want = new Set(keys);
  if (!want.size) return new Map();
  const now = opts.now ?? Date.now();
  return onStore(paths.log, 'read', () =>
    withIndex(
      paths,
      (handle) => {
        const out = new Map<string, Reusable>();
        const remaining = new Set<string>();
        for (const key of want) {
          const hit = fastReuse(paths, handle, who, key, opts.reuse, now);
          if (hit) {
            out.set(key, hit);
            continue;
          }
          if (handle.everHeld(who.adapter, who.model, key)) remaining.add(key); // else: nobody ever held it — a walk could never find it either
        }
        if (remaining.size) {
          for (const { offset } of handle.candidates(who.adapter, who.model)) {
            if (!remaining.size) break;
            const run = readCandidate(paths, offset, who);
            if (!run) continue;
            for (const [qid, key] of Object.entries(run.keys)) {
              if (!remaining.has(key)) continue;
              const answer = run.answers[qid];
              const origin = run.reusedFrom[qid] ?? run.id;
              if (!answer || handle.isBlocked(origin)) continue;
              const originRec = origin === run.id ? run : (readOrigin(paths, handle, origin, who) ?? run);
              const reusable: Reusable = { id: origin, answer, ts: originRec.ts, commit: originRec.commit ?? null, where: originRec.where };
              if (isStale(paths, reusable, opts.reuse, now)) continue; // keep walking: an older holder may still be valid
              out.set(key, reusable);
              remaining.delete(key);
            }
          }
        }
        return out;
      },
      { readOnly: opts.readOnly ?? false },
    ),
  );
}

/**
 * The newest run (same provider and model) that holds every key, none of them traced back (through reusedFrom)
 * to a run that is now overruled or failed: its answer can be reused whole. Always readOnly: exactReuse's only
 * caller (view's request mode) is a free, read-only verb — it must never persist a catch-up/rebuild.
 * If ANY requested key was never held by any run at all (everHeld false), no single run could possibly hold
 * every one of them — that's provable without a walk, the same reuse-MISS shortcut lookupAnswers uses.
 * Wrapped in onStore for the same reason as lookupAnswers above: a structurally broken log.jsonl must surface
 * as the usual clean StoreError, never a raw errno.
 */
export function exactReuse(paths: SidewisePaths, who: Who, keys: readonly string[], opts: { reuse?: ReuseLimits; now?: number } = {}): string | undefined {
  if (!keys.length) return undefined;
  const now = opts.now ?? Date.now();
  return onStore(paths.log, 'read', () =>
    withIndex(
      paths,
      (handle) => {
        if (keys.some((k) => !handle.everHeld(who.adapter, who.model, k))) return undefined;
        for (const { offset } of handle.candidates(who.adapter, who.model)) {
          const run = readCandidate(paths, offset, who);
          if (!run) continue;
          if (isStale(paths, { ts: run.ts, commit: run.commit ?? null, where: run.where }, opts.reuse, now)) continue; // plan 2c B3 D2: too old/far behind — keep walking
          const qidOf = new Map(Object.entries(run.keys).map(([qid, key]) => [key, qid]));
          const holds = keys.every((k) => {
            const qid = qidOf.get(k);
            if (qid === undefined) return false;
            const origin = run.reusedFrom[qid] ?? run.id;
            return !handle.isBlocked(origin);
          });
          if (holds) return run.id;
        }
        return undefined;
      },
      { readOnly: true },
    ),
  );
}

/** plan 2c B2/B, item 6: one `source: 'cache'` telemetry entry per distinct origin run this run reused
 *  ANYTHING from — `questions` is how many of THIS run's own questions came from that origin, `original` is
 *  that origin's own provider spend prorated down to that same fraction. `estimated` is true whenever that's a
 *  genuine proration (this run reused only PART of what the origin itself paid for); an origin whose entire
 *  paid call was reused whole (fraction === 1) gets its exact figures back, not an estimate. Tokens are
 *  omitted from `original` when the origin has no provider telemetry of its own to prorate from at all (a
 *  pre-telemetry run, or one that was itself entirely free) — cost then can't be prorated either, so the whole
 *  entry carries no `original`/`savedUsd`, just the count and `estimated: true` (nothing to base a number on). */
function cacheEntryFor(paths: SidewisePaths, from: string, questions: number): TelemetryEntry {
  const origin = findRun(paths, from);
  const providerCalls = origin && isContractRun(origin) ? (origin.telemetry ?? []).filter((t): t is Extract<TelemetryEntry, { source: 'provider' }> => t.source === 'provider') : [];
  const originQuestions = providerCalls.reduce((n, t) => n + t.questions, 0);
  if (originQuestions === 0) return { source: 'cache', from, questions, original: {}, estimated: true };

  const fraction = Math.min(1, questions / originQuestions);
  const hasTokens = providerCalls.length > 0 && providerCalls.every((t) => t.inputTokens !== undefined);
  const totalInputTokens = hasTokens ? providerCalls.reduce((n, t) => n + (t.inputTokens ?? 0), 0) : undefined;
  // The origin RUN's own reported spend (isContractRun already checked above via originQuestions > 0), summed
  // across every call it made — a more robust cost base than re-summing each call's own optional costUsd
  // (a rehearsal adapter reports none at all).
  const totalCostUsd = origin && isContractRun(origin) ? (origin.costUsd ?? undefined) : undefined;
  const original: { inputTokens?: number; costUsd?: number } = {
    ...(totalInputTokens !== undefined ? { inputTokens: Math.round(totalInputTokens * fraction) } : {}),
    ...(totalCostUsd !== undefined ? { costUsd: totalCostUsd * fraction } : {}),
  };
  return {
    source: 'cache',
    from,
    questions,
    original,
    ...(totalCostUsd !== undefined ? { savedUsd: totalCostUsd * fraction } : {}),
    estimated: fraction < 1,
  };
}

/** Every distinct origin this run reused from, each as one cache telemetry entry — `reusedFrom` is a run's own
 *  question-id → origin-run-id map (ContractRun.reusedFrom, or a sweep's `Object.fromEntries(plan.reusedFrom)`).
 *  Empty when nothing was reused. Callers append this to whatever provider telemetry askAll/runSweep already
 *  produced (`[...providerTelemetry, ...cacheTelemetry(ctx.paths, reusedFrom)]`) — never a replacement. */
export function cacheTelemetry(paths: SidewisePaths, reusedFrom: Record<string, string>): TelemetryEntry[] {
  const counts = new Map<string, number>();
  for (const from of Object.values(reusedFrom)) counts.set(from, (counts.get(from) ?? 0) + 1);
  return [...counts].map(([from, questions]) => cacheEntryFor(paths, from, questions));
}
