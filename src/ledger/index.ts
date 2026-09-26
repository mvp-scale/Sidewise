/**
 * The id index: .sidewise/index.db, a disposable SQLite sidecar (node:sqlite, lazy dynamic import) speeding up
 * every read log.ts/reuse.ts/view.ts do against log.jsonl. The log stays the source of truth (AGENTS.md): this
 * file never rewrites log.jsonl, and a missing/corrupt/stale index just costs the next call a rebuild — never a
 * wrong answer. Task 29 (revised): replaces the JSON sidecar (index.json) built in ff5f3e8 with this module,
 * evidence in lab/research/2026-09-26-sqlite-spike.md and lab/research/2026-09-26-ledger-lookup-comparison.md.
 *
 * Two engines behind one `withIndex` entry point, both fed by ONE line-interpretation (`applyLine`/`Sink`), so
 * they can never disagree about what a line means — only about where the answer is stored:
 *   - SQLite (node:sqlite `DatabaseSync`): self-healing on open (rebuild on missing/corrupt/wrong-schema/shorter
 *     log/fingerprint mismatch; catch-up on pure growth), persisted to .sidewise/index.db under the ledger lock
 *     (skipped when this process already holds it — see withLockIfNeeded).
 *   - Linear fallback (in-memory only, never persisted): used when node:sqlite can't be imported (Node < 22.13,
 *     e.g. this repo's Node 20 host) or ANY SQLite call throws. Slower (a full scan every call), always correct.
 * A project with no ledger yet (log.jsonl missing or empty) never touches disk here at all — no .sidewise/, no
 * index.db — for either engine: dry runs, `view`, and any command before the first write must create nothing
 * (design binding #7). Once a real write happens, log.jsonl exists first (appendLine's own mkdir), so the next
 * index build has something to persist against.
 *
 * Schema (slim — no full JSON copy; bodies are read back from the ledger by offset, `readRecordAt`):
 *   meta(key,value): schema_version, upto (bytes indexed), line_count, fp_start + fingerprint (sha256 of the
 *     line ending at upto, for a same-size-or-larger swap statSync's size check alone would miss).
 *   runs(id PK, offset, adapter, model, verb, ts, gate, blocked, wise): `wise` is a small JSON blob — the wise
 *     object plus category names — so a future Wise query can `json_extract` it; nothing bulky (answers,
 *     response, items) is copied here.
 *   answer_keys(adapter, model, key PK, run_id, qid): the newest holder's *origin* (resolved through
 *     reusedFrom), self-compacting — one row per (who, key) ever asked, overwritten on every later touch.
 *   outcomes(run_id PK, outcome, ts, by): latest outcome per run.
 *   places(kind, val, run_id): one row per `where` entry (kind 'where') or legacy tag (kind 'tag'), literal
 *     values only (no prefix expansion at write time — `placeCandidates` below does a LIKE-prefix read instead).
 */
import { createHash, randomBytes } from 'node:crypto';
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readSync, renameSync, rmSync, statSync } from 'node:fs';
import { isContractRun, isRecord, LedgerError, shownLog, type ContractRun, type LedgerRecord, type OutcomeRecord, type RunRecord } from './log.ts';
import { withLock } from './lock.ts';
import type { SidewisePaths } from './paths.ts';

export const whoKey = (who: { adapter: string; model: string }): string => `${who.adapter}|${who.model}`;

/** Strips a trailing ":start" or ":start-end" from a v2 `where` entry — the same shape evidence/code.ts and
 *  view.ts parse. Shared here (rather than duplicated in view.ts) so the index and view agree on what a place
 *  string is. */
export const stripLines = (entry: string): string => entry.replace(/:(\d+(?:-\d+)?)$/u, '');

export interface ReuseHit {
  runId: string;
  qid: string;
  offset: number;
  blocked: boolean;
}

export type Candidate = { id: string; offset: number };

/** What log.ts/reuse.ts/view.ts can ask the index, regardless of which engine answered it. Every method is a
 *  point read or a small bounded query — never a full-ledger scan on the SQLite path. */
export interface IndexHandle {
  findOffset(id: string): number | undefined;
  runCount(): number;
  /** Bytes of the log already reflected here — checkLedger's targeted tail read starts here. */
  upto(): number;
  /** 1-based line count already reflected here (so checkTail's tail can name the right line number). */
  lineCount(): number;
  isBlocked(id: string): boolean;
  /** The fast O(1) reuse path: a key's newest origin holder (already resolved through reusedFrom). */
  reuseKeyHit(adapter: string, model: string, key: string): ReuseHit | undefined;
  /** Every UNBLOCKED contract run for (adapter, model), newest first, with its offset. */
  candidates(adapter: string, model: string): Candidate[];
  /** Runs whose recorded where/tag entries could match `place` (exact, or a descendant path), oldest first (log
   *  append order, by offset) — matching the order view.ts's byPlace has always shown its "newest N" from. A
   *  candidate SET ONLY — callers still verify against the real record, so a false positive here is harmless. */
  placeCandidates(place: string): Candidate[];
  /** run id -> its latest outcome, for a small batch of ids (view's outcome counts). */
  outcomesFor(ids: readonly string[]): Map<string, OutcomeRecord['outcome']>;
}

// ---------------------------------------------------------------------------------------------------------------
// Shared line interpretation: the one place a JSONL line becomes index state, fed to either engine's Sink.
// ---------------------------------------------------------------------------------------------------------------

interface Sink {
  run(rec: RunRecord | ContractRun, offset: number): void;
  outcome(rec: OutcomeRecord): void;
}

const CHUNK_BYTES = 1 << 20; // 1 MiB: bounds memory during a scan regardless of log.jsonl's size.

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

/** Applies one line to `sink`, and reports whether it was a 'run' line — scanRange tracks `runsSeen` from this,
 *  independent of whatever the sink itself does with `runs.id PK`. That independence matters: the SQL sink's
 *  `runs` table is keyed by id (INSERT OR REPLACE — a colliding id, which a real ledger's own id-assignment
 *  invariant never produces, replaces a row rather than adding one), so `SELECT COUNT(*) FROM runs` alone would
 *  silently under-count in a corrupt/hand-edited ledger with duplicate ids. nextRunNumber must count LINES, the
 *  same way readLedger's own linear scan always has, on both engines, matching either way in every real case
 *  and staying honest (not silently wrong) in a corrupt one. */
function applyLine(sink: Sink, raw: string, startByte: number, lineNo: number, shown: string): boolean {
  const value = parseLedgerLine(raw, lineNo, shown);
  if (value.kind === 'outcome') {
    sink.outcome(value);
    return false;
  }
  if (value.kind !== 'run') return false; // 'failed': counted in the budget, not in the id index
  sink.run(value, startByte);
  return true;
}

interface ScanResult {
  upto: number;
  lineCount: number;
  /** Count of 'run' lines applied during THIS call only (a delta, not a running total — see writeMetaStateFull/
   *  writeMetaStateCatchUp, which add it to the previously stored run_count). */
  runsSeen: number;
  /** Start byte of the last COMPLETE line actually applied during this call (unchanged from the input when no
   *  new complete line was found — e.g. only a partial in-progress tail was added). */
  lastLineStart: number;
  /** Raw text of that same last complete line ('' when nothing changed), for the fingerprint. */
  lastLineRaw: string;
}

/** Scans [from, to) of an open fd in bounded chunks, applying each complete `\n`-terminated line to `sink`.
 *  Works on raw bytes until a line is found, so a chunk boundary can never split a multi-byte UTF-8 character.
 *  The final partial line (no trailing \n) is left unconsumed — an append in progress is picked up next time. */
function scanRange(fd: number, from: number, to: number, sink: Sink, shown: string, startUpto: number, startLineCount: number): ScanResult {
  let at = startUpto;
  let line = startLineCount;
  let runsSeen = 0;
  let lastLineStart = startUpto;
  let lastLineRaw = '';
  let pos = from;
  let carry = Buffer.alloc(0);
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
      const raw = chunk.toString('utf8', lineStart, i);
      const startByte = at;
      at += i - lineStart + 1;
      line += 1;
      lastLineStart = startByte;
      lastLineRaw = raw;
      if (raw.trim() && applyLine(sink, raw, startByte, line, shown)) runsSeen += 1;
      lineStart = i + 1;
    }
    carry = Buffer.from(chunk.subarray(lineStart));
  }
  return { upto: at, lineCount: line, runsSeen, lastLineStart, lastLineRaw };
}

const sha256hex = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');

/** Targeted read of the log's CURRENT bytes [from, to) — never the whole file — for verifying a stored
 *  fingerprint against what's on disk right now (self-heal's own check, before trusting a stored `upto`). */
function hashLogRange(logPath: string, from: number, to: number): string {
  if (to <= from) return sha256hex('');
  const fd = openSync(logPath, 'r');
  try {
    const buf = Buffer.alloc(to - from);
    let got = 0;
    while (got < buf.length) {
      const n = readSync(fd, buf, got, buf.length - got, from + got);
      if (n <= 0) break;
      got += n;
    }
    return sha256hex(buf.subarray(0, got).toString('utf8'));
  } finally {
    closeSync(fd);
  }
}

/**
 * Reads one line of log.jsonl starting at `offset` (to the next \n, or EOF) and parses it, or returns undefined
 * if it can't: `offset` at or past the log's current size, or the bytes there don't parse as JSON. Never an
 * error on its own — a stale offset (a bad entry, or the log changing between the index read and this call) is
 * exactly the situation findRun's rebuild-and-retry is for, never a raw crash. Grows its read window
 * exponentially from 4 KiB so a normal-sized line costs one small read, not one read of the whole file.
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

// ---------------------------------------------------------------------------------------------------------------
// Linear fallback: in-memory only, never persisted. The oracle — one full scan, always correct, just slower.
// ---------------------------------------------------------------------------------------------------------------

interface MemoryState {
  runOffset: Map<string, number>;
  blocked: Set<string>;
  reuseKey: Map<string, Map<string, { runId: string; qid: string }>>;
  candidatesByWho: Map<string, Candidate[]>;
  places: { kind: 'where' | 'tag'; val: string; runId: string }[];
  outcomes: Map<string, OutcomeRecord['outcome']>;
  runCount: number;
  upto: number;
  lineCount: number;
}

function emptyMemoryState(): MemoryState {
  return { runOffset: new Map(), blocked: new Set(), reuseKey: new Map(), candidatesByWho: new Map(), places: [], outcomes: new Map(), runCount: 0, upto: 0, lineCount: 0 };
}

function memorySink(state: MemoryState): Sink {
  return {
    run(rec, offset) {
      state.runCount += 1;
      state.runOffset.set(rec.id, offset);
      if (isContractRun(rec)) {
        const wk = whoKey({ adapter: rec.adapter, model: rec.model });
        if (!state.candidatesByWho.has(wk)) state.candidatesByWho.set(wk, []);
        state.candidatesByWho.get(wk)!.unshift({ id: rec.id, offset });
        if (!state.reuseKey.has(wk)) state.reuseKey.set(wk, new Map());
        const table = state.reuseKey.get(wk)!;
        for (const [qid, key] of Object.entries(rec.keys)) table.set(key, { runId: rec.reusedFrom[qid] ?? rec.id, qid });
        for (const w of rec.where) state.places.push({ kind: 'where', val: stripLines(w), runId: rec.id });
      } else {
        for (const w of rec.where) state.places.push({ kind: 'where', val: w.path, runId: rec.id });
        for (const t of rec.tags) state.places.push({ kind: 'tag', val: t, runId: rec.id });
      }
    },
    outcome(rec) {
      if (rec.outcome === 'held') state.blocked.delete(rec.of);
      else state.blocked.add(rec.of);
      state.outcomes.set(rec.of, rec.outcome);
    },
  };
}

function handleFromMemory(state: MemoryState): IndexHandle {
  return {
    findOffset: (id) => state.runOffset.get(id),
    runCount: () => state.runCount,
    upto: () => state.upto,
    lineCount: () => state.lineCount,
    isBlocked: (id) => state.blocked.has(id),
    reuseKeyHit: (adapter, model, key) => {
      const hit = state.reuseKey.get(whoKey({ adapter, model }))?.get(key);
      if (!hit) return undefined;
      const offset = state.runOffset.get(hit.runId);
      return offset === undefined ? undefined : { ...hit, offset, blocked: state.blocked.has(hit.runId) };
    },
    candidates: (adapter, model) => (state.candidatesByWho.get(whoKey({ adapter, model })) ?? []).filter((c) => !state.blocked.has(c.id)),
    placeCandidates: (place) => {
      const prefix = `${place}/`;
      const ids = new Set<string>();
      for (const p of state.places) {
        const hit = p.kind === 'tag' ? p.val === place : p.val === place || p.val.startsWith(prefix);
        if (hit) ids.add(p.runId);
      }
      return [...ids]
        .map((id) => ({ id, offset: state.runOffset.get(id) }))
        .filter((c): c is Candidate => c.offset !== undefined)
        .sort((a, b) => a.offset - b.offset);
    },
    outcomesFor: (ids) => {
      const want = new Set(ids);
      const out = new Map<string, OutcomeRecord['outcome']>();
      for (const [id, outcome] of state.outcomes) if (want.has(id)) out.set(id, outcome);
      return out;
    },
  };
}

/** A full linear scan, in memory, never written to disk. The oracle for the SQLite path, and Node 20's only path. */
/**
 * A one-slot, in-process-only cache of the last full scan: this fallback has no persisted store of its own (a
 * project with no real SQLite already loses the point of a disposable disk index — Node 20's whole story is "one
 * correct, in-memory rescan"), so without this, every single withIndex call — checkLedger, lookupAnswers,
 * nextRunNumber, all three per paid verb — would each rescan the whole log from scratch. Keyed on the log's own
 * size + mtime, which any real append always changes; never persisted, never shared across processes, so it can
 * only ever be *too eager to rescan*, never stale in a way that returns a wrong answer (worst case: a same-size,
 * same-millisecond-mtime content swap inside one process goes undetected — not a real-ledger scenario, since a
 * ledger only ever grows by appending).
 */
let memoryCache: { logPath: string; size: number; mtimeMs: number; state: MemoryState } | undefined;

function buildMemoryHandle(paths: SidewisePaths): IndexHandle {
  const st = existsSync(paths.log) ? statSync(paths.log) : undefined;
  const size = st?.size ?? 0;
  const mtimeMs = st ? Math.round(st.mtimeMs) : 0;
  if (memoryCache && memoryCache.logPath === paths.log && memoryCache.size === size && memoryCache.mtimeMs === mtimeMs) {
    return handleFromMemory(memoryCache.state);
  }
  const state = emptyMemoryState();
  if (size > 0) {
    const fd = openSync(paths.log, 'r');
    try {
      const result = scanRange(fd, 0, size, memorySink(state), shownLog(paths), 0, 0);
      state.upto = result.upto;
      state.lineCount = result.lineCount;
    } finally {
      closeSync(fd);
    }
  }
  memoryCache = { logPath: paths.log, size, mtimeMs, state };
  return handleFromMemory(state);
}

// ---------------------------------------------------------------------------------------------------------------
// SQLite engine.
// ---------------------------------------------------------------------------------------------------------------

const SCHEMA_VERSION = 1;

const SCHEMA_SQL = `
CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE runs (
  id TEXT PRIMARY KEY,
  offset INTEGER NOT NULL,
  adapter TEXT NOT NULL,
  model TEXT NOT NULL,
  verb TEXT NOT NULL,
  ts TEXT NOT NULL,
  gate TEXT,
  blocked INTEGER NOT NULL DEFAULT 0,
  wise TEXT
);
CREATE INDEX idx_runs_adapter_model ON runs(adapter, model, blocked);
CREATE TABLE answer_keys (
  adapter TEXT NOT NULL,
  model TEXT NOT NULL,
  key TEXT NOT NULL,
  run_id TEXT NOT NULL,
  qid TEXT NOT NULL,
  PRIMARY KEY (adapter, model, key)
);
CREATE TABLE outcomes (
  run_id TEXT PRIMARY KEY,
  outcome TEXT NOT NULL,
  ts TEXT NOT NULL,
  by TEXT NOT NULL
);
CREATE TABLE places (
  kind TEXT NOT NULL,
  val TEXT NOT NULL,
  run_id TEXT NOT NULL,
  PRIMARY KEY (kind, val, run_id)
);
CREATE INDEX idx_places_val ON places(kind, val);
`;

// Minimal surface used from node:sqlite (see node-sqlite.d.ts): kept as a structural type so the fallback path
// never has to import the module eagerly, and a test can hand in a fake for fault injection.
interface SqliteStatement {
  run(...params: unknown[]): unknown;
  get(...params: unknown[]): Record<string, unknown> | undefined;
  all(...params: unknown[]): Record<string, unknown>[];
}
interface SqliteDb {
  exec(sql: string): void;
  prepare(sql: string): SqliteStatement;
  close(): void;
}
type DatabaseSyncCtor = new (location: string) => SqliteDb;

/** Test-only fault injection: forces every withIndex call to take the fallback path, to prove it gives the same
 *  answers as SQLite without needing a corrupt Node build. Never set outside a test. */
export const __testOnly = { forceFallback: false };

/** True for the one warning node:sqlite prints (once per process) on Node 22/24: an ExperimentalWarning naming
 *  SQLite. Every other warning (including a differently-worded ExperimentalWarning) is left alone — matched by
 *  name AND message, not silenced wholesale. Exported so it's independently testable (a pure function, no
 *  process.on side effect). */
export function isSqliteExperimentalWarning(w: { name?: string; message?: string }): boolean {
  return w.name === 'ExperimentalWarning' && /sqlite/iu.test(w.message ?? '');
}

// An emitWarning wrapper, not a process.on('warning', ...) listener: Node still prints the ORIGINAL default
// text for a warning even when a 'warning' listener is attached (verified directly — that event does not
// suppress the default console output for this one, unlike what the Node docs imply for a plain
// process.emitWarning() call; node:sqlite's own experimental-feature warning apparently doesn't honor it).
// Wrapping emitWarning itself intercepts BEFORE Node's own default handling ever runs, so the swallowed case
// prints nothing and everything else still goes through the original emitWarning unchanged.
// Installed here — BEFORE the dynamic import below, in the same module, same synchronous top-level run — rather
// than in cli.ts: ESM evaluates an imported module's own top-level code (this whole file) BEFORE the importing
// module's (cli.ts's) subsequent statements run, so wrapping emitWarning from cli.ts would still be too late to
// catch a warning this module's own top-level await triggers below.
const originalEmitWarning = process.emitWarning.bind(process);
process.emitWarning = ((warning: string | Error, ...rest: unknown[]) => {
  const message = typeof warning === 'string' ? warning : warning.message;
  const type = typeof rest[0] === 'string' ? rest[0] : ((rest[0] as { type?: string } | undefined)?.type ?? '');
  if (isSqliteExperimentalWarning({ name: type, message })) return;
  return (originalEmitWarning as (...args: unknown[]) => void)(warning, ...rest);
}) as typeof process.emitWarning;

/**
 * node:sqlite, loaded lazily with a dynamic import — but resolved via a top-level await, not on first use inside
 * withIndex. Every ledger call in this codebase (nextRunNumber, findRun, checkLedger, lookupAnswers, exactReuse,
 * appendOutcome, …) is synchronous, called from synchronous code throughout ledger/ and verbs/; making them async
 * to await a per-call dynamic import would cascade `await` through pay.ts and every verb, well past "keep
 * exported ledger function signatures the same so verb code changes stay minimal." A top-level await here still
 * imports it lazily (only this module, only once, never a static top-of-file import that would hard-fail the
 * whole module graph on Node < 22.13) — but ESM module evaluation order means every importer of this module
 * (log.ts, reuse.ts, and everything downstream) waits for it to settle before their own top-level code runs, so
 * by the time any withIndex call happens, `sqliteCtor` is already whichever it's going to be. A built-in module
 * needs no disk I/O to resolve, so this costs a couple of microtasks at process start, not a real async wait.
 */
let sqliteCtor: DatabaseSyncCtor | null = null;
try {
  const mod = await import('node:sqlite');
  sqliteCtor = mod.DatabaseSync as unknown as DatabaseSyncCtor;
} catch {
  sqliteCtor = null; // Node < 22.13, or any other import failure: every call falls back from here on.
}

function getMeta(db: SqliteDb, key: string): string | undefined {
  const row = db.prepare('SELECT value FROM meta WHERE key = ?').get(key);
  return row ? String(row.value) : undefined;
}

function setMeta(db: SqliteDb, key: string, value: string): void {
  db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)').run(key, value);
}

interface SqlStatements {
  insertRun: SqliteStatement;
  insertKey: SqliteStatement;
  insertOutcome: SqliteStatement;
  insertPlace: SqliteStatement;
  updateBlocked: SqliteStatement;
}

function prepStatements(db: SqliteDb): SqlStatements {
  return {
    insertRun: db.prepare('INSERT OR REPLACE INTO runs (id, offset, adapter, model, verb, ts, gate, blocked, wise) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)'),
    insertKey: db.prepare('INSERT OR REPLACE INTO answer_keys (adapter, model, key, run_id, qid) VALUES (?, ?, ?, ?, ?)'),
    insertOutcome: db.prepare('INSERT OR REPLACE INTO outcomes (run_id, outcome, ts, by) VALUES (?, ?, ?, ?)'),
    insertPlace: db.prepare('INSERT OR IGNORE INTO places (kind, val, run_id) VALUES (?, ?, ?)'),
    updateBlocked: db.prepare('UPDATE runs SET blocked = ? WHERE id = ?'),
  };
}

/** Only the small searchable subtree the schema asks for: wise + the run's category names — never answers,
 *  response or items. json_extract($.wise.area) etc. can group/filter on this without a full-ledger scan. */
function wiseJson(rec: RunRecord | ContractRun): string | null {
  if (!isContractRun(rec)) return null;
  const categories = Object.keys(rec.categories ?? {});
  if (rec.wise === null && categories.length === 0) return null;
  return JSON.stringify({ wise: rec.wise, categories });
}

function sqlSink(stmts: SqlStatements): Sink {
  return {
    run(rec, offset) {
      const gate = 'gate' in rec ? (rec.gate ?? null) : null;
      stmts.insertRun.run(rec.id, offset, rec.adapter, rec.model, rec.verb, rec.ts, gate, wiseJson(rec));
      if (isContractRun(rec)) {
        for (const [qid, key] of Object.entries(rec.keys)) stmts.insertKey.run(rec.adapter, rec.model, key, rec.reusedFrom[qid] ?? rec.id, qid);
        for (const w of rec.where) stmts.insertPlace.run('where', stripLines(w), rec.id);
      } else {
        for (const w of rec.where) stmts.insertPlace.run('where', w.path, rec.id);
        for (const t of rec.tags) stmts.insertPlace.run('tag', t, rec.id);
      }
    },
    outcome(rec) {
      stmts.insertOutcome.run(rec.of, rec.outcome, rec.ts, rec.by);
      stmts.updateBlocked.run(rec.outcome === 'held' ? 0 : 1, rec.of);
    },
  };
}

function readMetaState(db: SqliteDb): { upto: number; lineCount: number; runCount: number } {
  return { upto: Number(getMeta(db, 'upto') ?? '0'), lineCount: Number(getMeta(db, 'line_count') ?? '0'), runCount: Number(getMeta(db, 'run_count') ?? '0') };
}

/** The fingerprint is always a fresh targeted read of the file at [from, to) (never the in-memory `lastLineRaw`
 *  scanRange also returns) — that range INCLUDES the line's trailing \n (upto is "one past the newline"), while
 *  `lastLineRaw` deliberately excludes it (readLedger/JSON.parse never want the newline). Hashing the in-memory
 *  string directly would hash a different byte range than tryOpenAndCheck's later verify-time hashLogRange call
 *  reads, so the two would never agree — a real bug caught here: every open looked "mismatched" and rebuilt from
 *  scratch, every single time. Going through hashLogRange on both sides guarantees they hash identical bytes. */
function fingerprintNow(logPath: string, from: number, to: number): string {
  return hashLogRange(logPath, from, to);
}

/** Rebuild only: `result` always starts from byte 0, so it's authoritative even when the log is empty or has no
 *  complete line yet — an empty fingerprint (sha256 of '') is a well-defined "nothing indexed" state, not a gap.
 *  run_count is stored separately from `SELECT COUNT(*) FROM runs` on purpose — see applyLine's comment: a
 *  rebuild's `result.runsSeen` is already the whole-log total (startLineCount was 0), so it's stored as-is. */
function writeMetaStateFull(db: SqliteDb, logPath: string, result: ScanResult): void {
  setMeta(db, 'upto', String(result.upto));
  setMeta(db, 'line_count', String(result.lineCount));
  setMeta(db, 'run_count', String(result.runsSeen));
  setMeta(db, 'fp_start', String(result.lastLineStart));
  setMeta(db, 'fingerprint', fingerprintNow(logPath, result.lastLineStart, result.upto));
}

/** Catch-up only: `result` may have found zero new COMPLETE lines (only a partial in-progress tail was added
 *  since last time) — in that case upto/lineCount/fp_start/fingerprint all still describe the last REAL line
 *  correctly and must be left untouched, not overwritten with scanRange's "nothing new yet" starting values.
 *  `result.runsSeen` is only this call's delta (scanRange starts counting from 0 every call), so it's ADDED to
 *  the previously stored run_count, not written over it. */
function writeMetaStateCatchUp(db: SqliteDb, logPath: string, before: { upto: number; lineCount: number; runCount: number }, result: ScanResult): void {
  if (result.upto === before.upto) return; // no complete new line: nothing to persist
  setMeta(db, 'upto', String(result.upto));
  setMeta(db, 'line_count', String(result.lineCount));
  setMeta(db, 'run_count', String(before.runCount + result.runsSeen));
  setMeta(db, 'fp_start', String(result.lastLineStart));
  setMeta(db, 'fingerprint', fingerprintNow(logPath, result.lastLineStart, result.upto));
}

/** Escapes a place for a LIKE pattern (the value itself, not a wildcard): `%`, `_` and the escape char itself. */
function escapeLike(s: string): string {
  return s.replace(/[\\%_]/gu, (c) => `\\${c}`);
}

function handleFromSql(db: SqliteDb): IndexHandle {
  const stFindOffset = db.prepare('SELECT offset FROM runs WHERE id = ?');
  const stIsBlocked = db.prepare('SELECT blocked FROM runs WHERE id = ?');
  const stReuseHit = db.prepare(
    'SELECT ak.run_id AS runId, ak.qid AS qid, r.offset AS offset, r.blocked AS blocked FROM answer_keys ak JOIN runs r ON r.id = ak.run_id WHERE ak.adapter = ? AND ak.model = ? AND ak.key = ?',
  );
  const stCandidates = db.prepare('SELECT id, offset FROM runs WHERE adapter = ? AND model = ? AND blocked = 0 ORDER BY rowid DESC');
  const stPlaces = db.prepare(
    `SELECT DISTINCT r.id AS id, r.offset AS offset FROM places p JOIN runs r ON r.id = p.run_id ` +
      `WHERE (p.kind = 'where' AND (p.val = ? OR p.val LIKE ? ESCAPE '\\')) OR (p.kind = 'tag' AND p.val = ?) ORDER BY r.offset ASC`,
  );

  return {
    findOffset: (id) => {
      const row = stFindOffset.get(id);
      return row ? Number(row.offset) : undefined;
    },
    // A line count (run_count in meta), not SELECT COUNT(*) FROM runs — see applyLine's comment: `runs.id` is a
    // PK (INSERT OR REPLACE), which a real ledger's id-assignment invariant never collides, but nextRunNumber
    // must still count LINES the way readLedger's own linear scan always has, matching the fallback exactly.
    runCount: () => Number(getMeta(db, 'run_count') ?? '0'),
    upto: () => Number(getMeta(db, 'upto') ?? '0'),
    lineCount: () => Number(getMeta(db, 'line_count') ?? '0'),
    isBlocked: (id) => {
      const row = stIsBlocked.get(id);
      return !!row && Number(row.blocked) !== 0;
    },
    reuseKeyHit: (adapter, model, key) => {
      const row = stReuseHit.get(adapter, model, key);
      return row ? { runId: String(row.runId), qid: String(row.qid), offset: Number(row.offset), blocked: Number(row.blocked) !== 0 } : undefined;
    },
    candidates: (adapter, model) => stCandidates.all(adapter, model).map((r) => ({ id: String(r.id), offset: Number(r.offset) })),
    placeCandidates: (place) => stPlaces.all(place, `${escapeLike(place)}/%`, place).map((r) => ({ id: String(r.id), offset: Number(r.offset) })),
    outcomesFor: (ids) => {
      const out = new Map<string, OutcomeRecord['outcome']>();
      if (!ids.length) return out;
      const stmt = db.prepare(`SELECT run_id AS runId, outcome FROM outcomes WHERE run_id IN (${ids.map(() => '?').join(',')})`);
      for (const row of stmt.all(...ids)) out.set(String(row.runId), row.outcome as OutcomeRecord['outcome']);
      return out;
    },
  };
}

/** Runs `fn` under paths.lock, unless this process already holds it (the lock file's body is our own pid) — a
 *  reentrant caller (checkLedger already holds it; nextRunNumber/findRun run inside appendRunLocked's caller's
 *  lock) would otherwise deadlock against itself waiting for a lock it is already holding. */
function withLockIfNeeded<T>(lockPath: string, fn: () => T): T {
  let heldByUs = false;
  try {
    heldByUs = Number.parseInt(readFileSync(lockPath, 'utf8').trim(), 10) === process.pid;
  } catch {
    /* no lock file, or unreadable: not held by us */
  }
  return heldByUs ? fn() : withLock(lockPath, fn);
}

function tmpDbPath(dbPath: string): string {
  return `${dbPath}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;
}

function rmDbFiles(dbPath: string): void {
  for (const f of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) {
    if (existsSync(f)) rmSync(f, { force: true });
  }
}

/** Full rebuild: fresh tables, one transaction, streamed from byte 0. Written to a tmp file in the same dir,
 *  then renamed into place — a reader can never observe a half-built index.db. Must run under paths.lock. */
function rebuildToDisk(paths: SidewisePaths, Db: DatabaseSyncCtor): SqliteDb {
  const dir = paths.dir;
  mkdirSync(dir, { recursive: true });
  const tmp = tmpDbPath(paths.index);
  rmDbFiles(tmp);
  const db = new Db(tmp);
  try {
    db.exec('PRAGMA journal_mode = WAL');
    db.exec(SCHEMA_SQL);
    const stmts = prepStatements(db);
    const size = existsSync(paths.log) ? statSync(paths.log).size : 0;
    db.exec('BEGIN');
    let result: ScanResult;
    if (size > 0) {
      const fd = openSync(paths.log, 'r');
      try {
        result = scanRange(fd, 0, size, sqlSink(stmts), shownLog(paths), 0, 0);
      } finally {
        closeSync(fd);
      }
    } else {
      result = { upto: 0, lineCount: 0, runsSeen: 0, lastLineStart: 0, lastLineRaw: '' };
    }
    setMeta(db, 'schema_version', String(SCHEMA_VERSION));
    writeMetaStateFull(db, paths.log, result);
    db.exec('COMMIT');
  } catch (e) {
    db.close();
    rmDbFiles(tmp);
    throw e;
  }
  db.close();
  rmDbFiles(paths.index); // drop any existing final file (+ its -wal/-shm) before the rename replaces it
  renameSync(tmp, paths.index);
  return new Db(paths.index);
}

/** Catches an already-open db up to the log's current size (only the new bytes). Must run under paths.lock. */
function catchUpInPlace(db: SqliteDb, paths: SidewisePaths): void {
  const stmts = prepStatements(db);
  const before = readMetaState(db);
  const size = existsSync(paths.log) ? statSync(paths.log).size : 0;
  if (size <= before.upto) return; // caught up already (another process got there first), or nothing new
  db.exec('BEGIN');
  try {
    const fd = openSync(paths.log, 'r');
    let result: ScanResult;
    try {
      result = scanRange(fd, before.upto, size, sqlSink(stmts), shownLog(paths), before.upto, before.lineCount);
    } finally {
      closeSync(fd);
    }
    writeMetaStateCatchUp(db, paths.log, before, result);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

type OpenCheck = { ok: true; db: SqliteDb; fresh: boolean } | { ok: false; db?: SqliteDb };

/** Opens index.db and checks it against the live log, WITHOUT taking the lock (a pure read): missing, an open
 *  failure, a failed quick_check, a schema mismatch, a log shorter than `upto`, or a fingerprint mismatch all
 *  come back not-ok (needs a rebuild); a log that's merely grown comes back ok/not-fresh (needs a catch-up). */
function tryOpenAndCheck(paths: SidewisePaths, Db: DatabaseSyncCtor): OpenCheck {
  if (!existsSync(paths.index)) return { ok: false };
  let db: SqliteDb;
  try {
    db = new Db(paths.index);
  } catch {
    return { ok: false };
  }
  try {
    const quick = db.prepare('PRAGMA quick_check').get();
    if (!quick || quick.quick_check !== 'ok') return { ok: false, db };
    if (getMeta(db, 'schema_version') !== String(SCHEMA_VERSION)) return { ok: false, db };
    const { upto } = readMetaState(db);
    const size = existsSync(paths.log) ? statSync(paths.log).size : 0;
    if (size < upto) return { ok: false, db };
    const fpStart = Number(getMeta(db, 'fp_start') ?? '0');
    const storedFp = getMeta(db, 'fingerprint') ?? '';
    if (hashLogRange(paths.log, fpStart, upto) !== storedFp) return { ok: false, db };
    return { ok: true, db, fresh: size === upto };
  } catch {
    return { ok: false, db };
  }
}

function safeClose(db: SqliteDb): void {
  try {
    db.close();
  } catch {
    /* already unusable */
  }
}

function ensureFreshDb(paths: SidewisePaths, Db: DatabaseSyncCtor, forceRebuild: boolean): SqliteDb {
  if (!forceRebuild) {
    const check = tryOpenAndCheck(paths, Db);
    if (check.ok) {
      if (check.fresh) return check.db;
      return withLockIfNeeded(paths.lock, () => {
        catchUpInPlace(check.db, paths);
        return check.db;
      });
    }
    if (check.db) safeClose(check.db);
  }
  return withLockIfNeeded(paths.lock, () => rebuildToDisk(paths, Db));
}

// ---------------------------------------------------------------------------------------------------------------
// Entry point.
// ---------------------------------------------------------------------------------------------------------------

/**
 * Opens (self-healing) the index, calls `fn` with an IndexHandle, closes it, and returns fn's result. A project
 * with no ledger yet (log.jsonl missing or empty) never touches disk: `fn` sees a handle over an empty in-memory
 * index (design binding #7 — dry runs, view, and any command before the first write create nothing). Otherwise
 * tries node:sqlite first; if it can't be imported or ANY call in this whole attempt throws (open, self-heal,
 * catch-up/rebuild, or a query inside `fn`), falls back to a full linear scan, in memory, never persisted — the
 * next WRITE path (an actual append) is what rebuilds the on-disk index, not this read.
 * `forceRebuild`: skip the freshness check and always rebuild — findRun's retry when a specific offset it
 * already has doesn't check out (the log changed between one call and the next, in a lock-free read).
 */
export function withIndex<T>(paths: SidewisePaths, fn: (h: IndexHandle) => T, opts: { forceRebuild?: boolean } = {}): T {
  const logStat = existsSync(paths.log) ? statSync(paths.log) : undefined;
  if (!logStat || logStat.size === 0) return fn(handleFromMemory(emptyMemoryState()));

  return runSqlite(paths, fn, opts.forceRebuild ?? false);
}

function runSqlite<T>(paths: SidewisePaths, fn: (h: IndexHandle) => T, forceRebuild: boolean): T {
  try {
    if (__testOnly.forceFallback || !sqliteCtor) throw new Error('node:sqlite unavailable');
    const db = ensureFreshDb(paths, sqliteCtor, forceRebuild);
    try {
      return fn(handleFromSql(db));
    } finally {
      safeClose(db);
    }
  } catch {
    return fn(buildMemoryHandle(paths));
  }
}
