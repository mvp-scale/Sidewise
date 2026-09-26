/**
 * The id index: .sidewise/index.json, a disposable sidecar mapping SW id -> byte offset in log.jsonl. The log
 * stays the source of truth (AGENTS.md): this file is never written to except here, nothing here ever rewrites
 * log.jsonl, and a missing or corrupt index.json just costs the next call a rebuild, never a wrong answer.
 * `nextRunNumber`/`findRun`/`checkLedger`/`appendOutcome`/`appendFailedLocked` (log.ts) and `lookupAnswers`/
 * `exactReuse` (reuse.ts) are the only callers; no verb reads this file directly.
 *
 * Read-side, lock-free, lazy: loadIndex is refreshed only when called, never on append. Catch-up is a byte-range
 * read (openSync + readSync from index.upto to the log's current size), not a re-read of the whole file, so an
 * append-heavy ledger stays cheap to query. A full rebuild (missing/corrupt/wrong-version index, or a log shorter
 * than the index's upto — truncated, replaced, or a fresh ledger reusing an old temp dir) streams the log in
 * bounded chunks so a very large ledger never sits in memory as one string; it is written as the same line-by-line
 * pass catchUpIndex uses, starting from an empty index, so there is exactly one place that turns a line into index
 * state. Every append already goes through nextRunNumber under the ledger lock, or is itself a lock-free read
 * (findRun) exactly like readLedger's partialTail behavior — so no new call sites and no new locking are needed.
 *
 * v: 2 (Task 29) adds two reuse-serving fields, both populated only for v2 ContractRun lines (legacy RunRecords
 * carry no keys and are never reusable):
 *   - reuseKey: "<adapter>|<model>" -> answerKey -> { runId, qid } of the newest run to touch that key, `runId`
 *     already resolved through reusedFrom to the *origin* that actually holds the answer. Every application of a
 *     v2 line overwrites this unconditionally — that overwrite is the self-compaction the plan describes: the
 *     table never grows past one entry per distinct (who, key) ever asked, regardless of how many times it's
 *     re-asked. It is populated (satisfying the documented interface and giving any future direct-lookup caller
 *     an O(1) path) but reuse.ts does NOT read it as the primary path for lookupAnswers/exactReuse — see the
 *     comment on runIdsNewestFirst for why a single compacted slot per key isn't sufficient on its own.
 *   - runIdsNewestFirst: "<adapter>|<model>" -> every v2 ContractRun id for that pair, newest first (unshifted
 *     on apply). This does NOT self-compact (same reasoning as runOffset/blocked: any historical id can still be
 *     asked for). It exists because reuseKey's single "current holder" slot per key is provably insufficient for
 *     two things Task 11's linear scan actually does: (1) exactReuse needs the newest run whose OWN r.keys covers
 *     a whole *set* of requested keys together — reuseKey only remembers the latest single-key holder, not which
 *     runs asked which keys together, so it can't answer a multi-key query. (2) When a key's newest holder is
 *     later blocked (overruled/failed), the linear scan falls back to an OLDER still-valid holder of the same
 *     key (it just skips the blocked run and lets the earlier one's map entry stand); reuseKey's unconditional
 *     overwrite discards that older holder's identity entirely, so a naive "check reuseKey, then check blocked"
 *     read can silently miss a still-good answer that the linear oracle would have found. runIdsNewestFirst lets
 *     lookupAnswers/exactReuse walk candidates newest-to-oldest exactly like the linear scan does, using O(1)
 *     findRun per candidate instead of holding the whole ledger in memory, with an early exit once every
 *     requested key is found (or, for exactReuse, once one candidate holds them all).
 */
import { randomBytes } from 'node:crypto';
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { isContractRun, isRecord, LedgerError, shownLog, type LedgerRecord } from './log.ts';
import type { SidewisePaths } from './paths.ts';

export interface LedgerIndex {
  v: 1 | 2;
  /** Byte offset into log.jsonl already reflected here. */
  upto: number;
  /** 1-based line count already reflected here (so a corrupt line's error names the right line number). */
  lineCount: number;
  /** Count of every kind:'run' record seen (legacy RunRecord + v2 ContractRun). */
  runCount: number;
  /** SW id -> byte offset where its line starts. */
  runOffset: Record<string, number>;
  /** Run id -> its latest outcome is overruled|failed (absent, or removed again once a later outcome is held). */
  blocked: Record<string, true>;
  /** v2 only (Task 29 populates this): "<adapter>|<model>" -> answerKey -> newest holder. Always {} at v: 1. */
  reuseKey: Record<string, Record<string, { runId: string; qid: string }>>;
  /** v2 only (Task 29 populates this): "<adapter>|<model>" -> every contract run id for that pair, newest first. */
  runIdsNewestFirst: Record<string, string[]>;
}

const EMPTY_INDEX: LedgerIndex = { v: 2, upto: 0, lineCount: 0, runCount: 0, runOffset: {}, blocked: {}, reuseKey: {}, runIdsNewestFirst: {} };

/** Rebuild instead of patch once index.json exceeds this share of log.jsonl's size. The real bench (10k/100k,
 *  docs/evidence/ledger-scale.md) measured indexBytes/logBytes ≈ 0.0292 at n = 10,000 and ≈ 0.0306 at n = 100,000
 *  (the largest size measured) — 0.05 is the smallest round number (multiples of 0.05) at or above that. */
export const REBUILD_SIZE_RATIO = 0.05;

/** A chunk size that keeps rebuildIndex's memory use bounded regardless of log.jsonl's size (hundreds of MB at 1M runs). */
const CHUNK_BYTES = 1 << 20; // 1 MiB

export const whoKey = (who: { adapter: string; model: string }): string => `${who.adapter}|${who.model}`;

const isPlainObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Just enough shape-checking to trust a stored index.json; anything else is treated as "missing" (disposable).
 *  v !== 2 (a v: 1 index from before Task 29, which never populated reuseKey/runIdsNewestFirst) is treated as
 *  missing too: it can't be trusted for reuse, so loadIndex rebuilds unconditionally rather than trusting it. */
function isLedgerIndexShape(v: unknown): v is LedgerIndex {
  if (!isPlainObject(v)) return false;
  return (
    v.v === 2 &&
    typeof v.upto === 'number' &&
    typeof v.lineCount === 'number' &&
    typeof v.runCount === 'number' &&
    isPlainObject(v.runOffset) &&
    isPlainObject(v.blocked) &&
    isPlainObject(v.reuseKey) &&
    isPlainObject(v.runIdsNewestFirst)
  );
}

/** A real (two-level-deep, where it matters) copy: applyLine mutates the per-who nested reuseKey table and
 *  pushes onto the per-who runIdsNewestFirst array in place, so a shallow `{...index.reuseKey}` would leave
 *  clone and original sharing (and corrupting each other's view of) the same nested objects/arrays. */
function cloneIndex(index: LedgerIndex): LedgerIndex {
  return {
    ...index,
    runOffset: { ...index.runOffset },
    blocked: { ...index.blocked },
    reuseKey: Object.fromEntries(Object.entries(index.reuseKey).map(([wk, table]) => [wk, { ...table }])),
    runIdsNewestFirst: Object.fromEntries(Object.entries(index.runIdsNewestFirst).map(([wk, ids]) => [wk, [...ids]])),
  };
}

/**
 * Parses one ledger line exactly as readLedger does (same isRecord check, same error wording), so the index can
 * never disagree with readLedger about what's a valid record, or hide corruption readLedger would catch.
 */
function parseLedgerLine(raw: string, lineNo: number, shown: string): LedgerRecord {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new LedgerError(`✖ ledger: line ${lineNo} of ${shown} is not valid JSON → fix or remove that line`);
  }
  if (!isRecord(value)) {
    throw new LedgerError(`✖ ledger: line ${lineNo} of ${shown} is not a ledger record → fix or remove that line`);
  }
  return value;
}

/** Folds one already-validated line into the index: a run records its offset (a v2 ContractRun also its keys,
 *  see the header comment for reuseKey/runIdsNewestFirst); an outcome updates `blocked` (held clears it,
 *  overruled/failed sets it — later outcomes for the same id always win, matching "latest"). */
function applyLine(next: LedgerIndex, raw: string, startByte: number, lineNo: number, shown: string): void {
  const value = parseLedgerLine(raw, lineNo, shown);
  if (value.kind === 'outcome') {
    if (value.outcome === 'held') delete next.blocked[value.of];
    else next.blocked[value.of] = true;
    return;
  }
  if (value.kind !== 'run') return; // 'failed': counted in the budget, not in the id index
  next.runCount += 1;
  next.runOffset[value.id] = startByte;
  if (!isContractRun(value)) return; // legacy runs carry no keys and are never reusable
  const wk = whoKey({ adapter: value.adapter, model: value.model });
  (next.runIdsNewestFirst[wk] ??= []).unshift(value.id);
  const table = (next.reuseKey[wk] ??= {});
  for (const [qid, key] of Object.entries(value.keys)) table[key] = { runId: value.reusedFrom[qid] ?? value.id, qid };
}

/**
 * Scans [from, to) of an open fd in bounded chunks, applying each complete `\n`-terminated line to `next`.
 * Works on raw bytes (not decoded strings) until a line is found, so a chunk boundary can never split a
 * multi-byte UTF-8 character: 0x0A (\n) cannot appear as a UTF-8 continuation byte, so decoding only the span
 * between two \n bytes (or start/EOF) is always a valid boundary, no matter where the chunk itself was cut.
 * The final partial line (no trailing \n) is left unconsumed: next.upto/lineCount stop just before it, matching
 * readLedger's partialTail behavior, so an append in progress is picked up on the next call once it completes.
 */
function scanRange(fd: number, from: number, to: number, next: LedgerIndex, shown: string): void {
  let at = next.upto;
  let line = next.lineCount;
  let pos = from;
  let carry = Buffer.alloc(0); // raw bytes since the last \n, not yet a complete line
  const buf = Buffer.alloc(Math.min(CHUNK_BYTES, Math.max(1, to - from)));
  while (pos < to) {
    const want = Math.min(buf.length, to - pos);
    const got = readSync(fd, buf, 0, want, pos);
    if (got <= 0) break;
    pos += got;
    const chunk = carry.length ? Buffer.concat([carry, buf.subarray(0, got)]) : Buffer.from(buf.subarray(0, got));
    let lineStart = 0;
    for (let i = 0; i < chunk.length; i++) {
      if (chunk[i] !== 0x0a) continue;
      const raw = chunk.toString('utf8', lineStart, i); // \n-aligned on both ends: always a valid utf8 boundary
      const startByte = at;
      at += i - lineStart + 1;
      line += 1;
      if (raw.trim()) applyLine(next, raw, startByte, line, shown);
      lineStart = i + 1;
    }
    carry = Buffer.from(chunk.subarray(lineStart));
  }
  // Whatever is left in `carry` at `to` is an in-progress tail: never applied, never counted.
  next.upto = at;
  next.lineCount = line;
}

/**
 * tmp-then-rename, like budget.ts's write — but budget.ts can get away with one fixed tmp name because every
 * budget write happens under the ledger lock (one writer at a time, by construction). Index writes are
 * lock-free by design (this file's header: "no new locking"), so two readers can call saveIndex at the same
 * moment. A shared tmp name would let one writer's in-progress tmp file be overwritten by the other before
 * either renames it, corrupting whichever version gets renamed into place — exactly the half-written state
 * tmp-then-rename exists to prevent. Each call gets its own tmp name (pid + random bytes), so concurrent
 * writers never touch each other's file; whichever finishes its rename last simply wins with an equally
 * correct result (both computed the same catch-up from the same immutable already-written log bytes).
 * The index is disposable either way, so a failed write (index.json is a directory, disk full, permission
 * denied) is swallowed: it only costs the next call a rebuild, never a failure.
 */
export function saveIndex(paths: SidewisePaths, index: LedgerIndex): void {
  const tmp = `${paths.index}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;
  try {
    mkdirSync(paths.dir, { recursive: true });
    writeFileSync(tmp, JSON.stringify(index));
    renameSync(tmp, paths.index);
  } catch {
    try {
      rmSync(tmp, { force: true });
    } catch {
      /* best effort cleanup */
    }
  }
}

/** Full streaming rescan, from an empty index. Never readFileSyncs the whole file: see scanRange. */
export function rebuildIndex(paths: SidewisePaths): LedgerIndex {
  const next = cloneIndex(EMPTY_INDEX);
  const size = existsSync(paths.log) ? statSync(paths.log).size : 0;
  if (size > 0) {
    const fd = openSync(paths.log, 'r');
    try {
      scanRange(fd, 0, size, next, shownLog(paths));
    } finally {
      closeSync(fd);
    }
  }
  saveIndex(paths, next);
  return next;
}

/** Catches up `index` to the log's current size: a byte-range read of only the new bytes, not a re-read.
 *  A log shorter than `index.upto` (truncated, replaced, or a fresh ledger under a reused temp dir) is stale —
 *  a full rebuild, never trusting stale offsets. */
export function catchUpIndex(paths: SidewisePaths, index: LedgerIndex): LedgerIndex {
  const size = existsSync(paths.log) ? statSync(paths.log).size : 0;
  if (size < index.upto) return rebuildIndex(paths);
  if (size === index.upto) return index;
  const next = cloneIndex(index);
  const fd = openSync(paths.log, 'r');
  try {
    scanRange(fd, index.upto, size, next, shownLog(paths));
  } finally {
    closeSync(fd);
  }
  saveIndex(paths, next);
  return next;
}

function readStoredIndex(paths: SidewisePaths): LedgerIndex | undefined {
  let text: string;
  try {
    text = readFileSync(paths.index, 'utf8');
  } catch {
    return undefined; // missing, a directory, or unreadable: the index is disposable — rebuild silently
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return undefined;
  }
  return isLedgerIndexShape(value) ? value : undefined;
}

/** Reads index.json, catches it up, or rebuilds it as needed — whichever is required, always persists the result.
 *  A stored index that's grown past REBUILD_SIZE_RATIO of the log's size is rebuilt from scratch instead of
 *  patched: still correct either way (a rebuild and a catch-up converge on the same state), but a full rebuild
 *  is a few lines and one linear pass, while incrementally garbage-collecting a map that only ever grows
 *  (runOffset/blocked/runIdsNewestFirst: see the header comment for why those can't self-compact) isn't worth
 *  building for a file that's disposable by design. The two statSync calls this needs are cheap next to either
 *  path it's choosing between. */
export function loadIndex(paths: SidewisePaths): LedgerIndex {
  const existing = readStoredIndex(paths);
  if (!existing) return rebuildIndex(paths);
  const logBytes = existsSync(paths.log) ? statSync(paths.log).size : 0;
  const indexBytes = existsSync(paths.index) ? statSync(paths.index).size : 0;
  if (logBytes > 0 && indexBytes > REBUILD_SIZE_RATIO * logBytes) return rebuildIndex(paths);
  return catchUpIndex(paths, existing);
}

/**
 * Reads one line of log.jsonl starting at `offset` (to the next \n, or EOF) and parses it, or returns undefined
 * if it can't: `offset` at or past the log's current size, or the bytes there don't parse as JSON. This is
 * never an error on its own — a stale `runOffset` (a bad entry, or the log changed between loadIndex reading
 * it and this call) is exactly the situation findRun's rebuild-and-retry is for, never a raw crash. Grows its
 * read window exponentially from 4 KiB so a normal-sized line costs one small read, not one read of the whole
 * file. Any filesystem hiccup mid-read (the log disappeared, a permission change) gets the same treatment:
 * "couldn't read a record here," not a thrown error — the caller already knows how to recover from that.
 */
export function readRecordAt(logPath: string, offset: number): LedgerRecord | undefined {
  if (offset < 0) return undefined;
  let fd: number;
  try {
    fd = openSync(logPath, 'r');
  } catch {
    return undefined;
  }
  try {
    const size = statSync(logPath).size;
    if (offset >= size) return undefined; // a stale offset: the log is shorter than the index claims
    let chunkSize = Math.min(4096, size - offset);
    for (;;) {
      const buf = Buffer.alloc(chunkSize);
      const got = readSync(fd, buf, 0, chunkSize, offset);
      if (got <= 0) return undefined; // shouldn't happen given the bounds check above, but never trust it blindly
      const nl = buf.subarray(0, got).indexOf(0x0a);
      const complete = nl !== -1 ? buf.toString('utf8', 0, nl) : offset + got >= size ? buf.toString('utf8', 0, got) : null;
      if (complete !== null) {
        try {
          return JSON.parse(complete) as LedgerRecord;
        } catch {
          return undefined; // garbled at this offset: stale, not a crash
        }
      }
      chunkSize = Math.min(chunkSize * 2, size - offset);
    }
  } catch {
    return undefined;
  } finally {
    closeSync(fd);
  }
}
