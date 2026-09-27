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
import type { Answer } from '../contract/types.ts';
import { readRecordAt, withIndex, type IndexHandle } from './index.ts';
import { isContractRun, type ContractRun } from './log.ts';
import { onStore } from './lock.ts';
import type { SidewisePaths } from './paths.ts';

export interface Who {
  adapter: string;
  model: string;
}

export interface Reusable {
  /** The run that first answered it. */
  id: string;
  answer: Answer;
}

/** The record at `offset`, if it's a contract run for `who` — a defensive re-check (the index already scopes
 *  by adapter/model server-side, so this should always hold; readRecordAt never throws for a stale offset). */
function readCandidate(paths: SidewisePaths, offset: number, who: Who): ContractRun | undefined {
  const run = readRecordAt(paths.log, offset);
  return run && isContractRun(run) && run.adapter === who.adapter && run.model === who.model ? run : undefined;
}

/** The fast path for one key: the reuse index's current holder, re-read from its own record (never the stored
 *  qid — see the file header). undefined when the slot is empty, its holder is blocked, or anything about it
 *  doesn't check out (a stale offset, a shape that no longer matches) — any of which falls back to the scan. */
function fastReuse(paths: SidewisePaths, handle: IndexHandle, who: Who, key: string): Reusable | undefined {
  const hit = handle.reuseKeyHit(who.adapter, who.model, key);
  if (!hit || hit.blocked) return undefined;
  const origin = readCandidate(paths, hit.offset, who);
  if (!origin) return undefined;
  const originQid = Object.entries(origin.keys).find(([, k]) => k === key)?.[0];
  if (originQid === undefined) return undefined;
  const answer = origin.answers[originQid];
  return answer ? { id: origin.id, answer } : undefined;
}

/** Key → the newest reusable answer for it, for the keys asked about. The fast path (above) resolves most keys
 *  in O(1); whatever it can't, the fallback walks candidates newest first, so a key whose newest holder is now
 *  blocked still correctly falls back further to an older still-valid holder of the same key. Before that walk,
 *  `everHeld` drops any key that NO run has ever held at all (the answer_keys table proves it conclusively) —
 *  the common "genuinely new question" reuse MISS, which used to pay for walking every candidate run for the
 *  provider only to confirm what a single missing row already proved. `opts.readOnly`: threaded through to
 *  withIndex for callers that must never persist a catch-up/rebuild here (a sweep verb's --dry-run planning,
 *  which still needs to know what WOULD reuse — design binding "dry runs... write nothing").
 *  `out` is built INSIDE the withIndex callback (never captured from outside it): withIndex retries `fn` from
 *  scratch against the in-memory fallback if the SQL attempt throws partway through, so a partially-filled `out`
 *  from that aborted attempt must never survive into the retry — building it fresh per `fn` invocation is what
 *  guarantees that. Wrapped in onStore: once a verb resolves reuse BEFORE preflight, this
 *  is the first read to touch `.sidewise/` at all on some paths — a structurally broken log.jsonl (e.g. a
 *  directory where the file should be) must come back as preflight's own clean StoreError, never a raw errno
 *  escaping unwrapped just because this call now sometimes runs first. */
export function lookupAnswers(paths: SidewisePaths, who: Who, keys: readonly string[], opts: { readOnly?: boolean } = {}): Map<string, Reusable> {
  const want = new Set(keys);
  if (!want.size) return new Map();
  return onStore(paths.log, 'read', () =>
    withIndex(
      paths,
      (handle) => {
        const out = new Map<string, Reusable>();
        const remaining = new Set<string>();
        for (const key of want) {
          const hit = fastReuse(paths, handle, who, key);
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
              if (answer && !handle.isBlocked(origin)) {
                out.set(key, { id: origin, answer });
                remaining.delete(key);
              }
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
export function exactReuse(paths: SidewisePaths, who: Who, keys: readonly string[]): string | undefined {
  if (!keys.length) return undefined;
  return onStore(paths.log, 'read', () =>
    withIndex(
      paths,
      (handle) => {
        if (keys.some((k) => !handle.everHeld(who.adapter, who.model, k))) return undefined;
        for (const { offset } of handle.candidates(who.adapter, who.model)) {
          const run = readCandidate(paths, offset, who);
          if (!run) continue;
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
