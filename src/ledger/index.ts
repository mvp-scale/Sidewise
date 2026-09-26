/**
 * The id index: .sidewise/index.json, a disposable sidecar mapping SW id -> byte offset in log.jsonl. The log
 * stays the source of truth (AGENTS.md): this file is never written to except here, nothing here ever rewrites
 * log.jsonl, and a missing or corrupt index.json just costs the next call a rebuild, never a wrong answer.
 * `nextRunNumber`/`findRun` (log.ts) are the only callers; no verb reads this file directly.
 *
 * Read-side, lock-free, lazy: loadIndex is refreshed only when called, never on append. Catch-up is a byte-range
 * read (openSync + readSync from index.upto to the log's current size), not a re-read of the whole file, so an
 * append-heavy ledger stays cheap to query. A full rebuild (missing/corrupt/wrong-version index, or a log shorter
 * than the index's upto — truncated, replaced, or a fresh ledger reusing an old temp dir) streams the log in
 * bounded chunks so a very large ledger never sits in memory as one string; it is written as the same line-by-line
 * pass catchUpIndex uses, starting from an empty index, so there is exactly one place that turns a line into index
 * state. Every append already goes through nextRunNumber under the ledger lock, or is itself a lock-free read
 * (findRun) exactly like readLedger's partialTail behavior — so no new call sites and no new locking are needed.
 */
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { isRecord, LedgerError, shownLog, type LedgerRecord } from './log.ts';
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
}

const EMPTY_INDEX: LedgerIndex = { v: 1, upto: 0, lineCount: 0, runCount: 0, runOffset: {}, blocked: {}, reuseKey: {} };

/** A chunk size that keeps rebuildIndex's memory use bounded regardless of log.jsonl's size (hundreds of MB at 1M runs). */
const CHUNK_BYTES = 1 << 20; // 1 MiB

export const whoKey = (who: { adapter: string; model: string }): string => `${who.adapter}|${who.model}`;

const isPlainObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Just enough shape-checking to trust a stored index.json; anything else is treated as "missing" (disposable). */
function isLedgerIndexShape(v: unknown): v is LedgerIndex {
  if (!isPlainObject(v)) return false;
  return (
    v.v === 1 &&
    typeof v.upto === 'number' &&
    typeof v.lineCount === 'number' &&
    typeof v.runCount === 'number' &&
    isPlainObject(v.runOffset) &&
    isPlainObject(v.blocked) &&
    isPlainObject(v.reuseKey)
  );
}

function cloneIndex(index: LedgerIndex): LedgerIndex {
  return { ...index, runOffset: { ...index.runOffset }, blocked: { ...index.blocked }, reuseKey: { ...index.reuseKey } };
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

/** Folds one already-validated line into the index: a run records its offset; an outcome updates `blocked`
 *  (held clears it, overruled/failed sets it — later outcomes for the same id always win, matching "latest"). */
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

/** tmp-then-rename, like budget.ts's write — but the index is disposable, so a failed write (index.json is a
 *  directory, disk full, permission denied) is swallowed: it only costs the next call a rebuild, never a failure. */
export function saveIndex(paths: SidewisePaths, index: LedgerIndex): void {
  const tmp = `${paths.index}.tmp`;
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

/** Reads index.json, catches it up, or rebuilds it as needed — whichever is required, always persists the result. */
export function loadIndex(paths: SidewisePaths): LedgerIndex {
  const existing = readStoredIndex(paths);
  return existing ? catchUpIndex(paths, existing) : rebuildIndex(paths);
}

/** Reads one line of log.jsonl starting at `offset` (to the next \n, or EOF) and parses it. Grows its read
 *  window exponentially from 4 KiB so a normal-sized line costs one small read, not one read of the whole file. */
export function readRecordAt(logPath: string, offset: number): LedgerRecord {
  const fd = openSync(logPath, 'r');
  try {
    const size = statSync(logPath).size;
    let chunkSize = Math.min(4096, Math.max(1, size - offset));
    for (;;) {
      const buf = Buffer.alloc(chunkSize);
      const got = readSync(fd, buf, 0, chunkSize, offset);
      const nl = buf.subarray(0, got).indexOf(0x0a);
      if (nl !== -1) return JSON.parse(buf.toString('utf8', 0, nl)) as LedgerRecord;
      if (offset + got >= size) return JSON.parse(buf.toString('utf8', 0, got)) as LedgerRecord; // EOF, no trailing \n
      chunkSize = Math.min(chunkSize * 2, size - offset);
    }
  } finally {
    closeSync(fd);
  }
}
