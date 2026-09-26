/**
 * The ledger: .sidewise/log.jsonl, append-only, one record shape for every verb. Runs get SW-#### in order
 * under the lock, plus a ULID. Outcomes are separate appended lines, never edits. Everything is redacted
 * before it is written; identities (run actor, outcome by) keep emails so they stay comparable, but never secrets.
 * Two run shapes: contract runs (`v: 2`, written by every verb) and Plan 1's text-format runs (no `v`, read only).
 * Both count toward SW ids.
 */
import { accessSync, appendFileSync, constants, existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { ItemStatus } from '../contract/grade.ts';
import type { UnitRef } from '../contract/layers.ts';
import type { Answer, Category, Depth, Gate, Layer, Wise } from '../contract/types.ts';
import type { Consensus } from '../lens/consensus.ts';
import type { Level, Place, Verb } from '../lens/request.ts';
import { formatRunId, ulid } from './ids.ts';
// A deliberate two-way import with index.ts: log.ts calls loadIndex/readRecordAt (only inside function bodies,
// never at module load time), and index.ts calls back into isRecord/LedgerError/shownLog the same way. Safe in
// ESM as long as neither side touches the other's exports before both modules finish loading, which holds here.
import { loadIndex, readRecordAt } from './index.ts';
import { onStore, withLock } from './lock.ts';
import type { SidewisePaths } from './paths.ts';
import { redact, redactDeep, redactSecrets } from './redact.ts';

export type Outcome = 'held' | 'overruled' | 'failed';

export interface LoggedSlot {
  pos: number;
  text: string;
  reverse: boolean;
  p: number;
}

export type LoggedPrimitive =
  | { kind: 'bool'; text: string; p: number }
  | { kind: 'scale' | 'direction'; text: string; options: string[]; distribution: Record<string, number> };

export interface RunRecord {
  kind: 'run';
  id: string;
  uid: string;
  ts: string;
  verb: Verb;
  level: Level;
  actor: string;
  perspective: string;
  where: Place[];
  problem: string;
  tags: string[];
  focus: string;
  parent?: string;
  slots: LoggedSlot[];
  primitives: LoggedPrimitive[];
  consensus: Consensus;
  verdict: 'concern' | 'clear';
  lean?: { option: string; p: number };
  notes: string[];
  adapter: string;
  model: string;
  costUsd: number | null;
  task: string | null;
}

export type NewRun = Omit<RunRecord, 'kind' | 'id' | 'uid' | 'ts'>;

export interface ItemRecord {
  layer: string;
  fill: Record<string, string>;
  unit?: UnitRef;
  status: ItemStatus;
  /** Rolled up (its own categories and its children). */
  gate: Gate;
  /** Its own categories' gates. */
  categories: Record<string, Gate>;
}

/** One run of any verb under the YAML contract v1. */
export interface ContractRun {
  kind: 'run';
  v: 2;
  id: string;
  uid: string;
  ts: string;
  verb: Verb;
  actor: string;
  task: string | null;
  goal: string;
  depth: Depth | null;
  where: string[];
  parent: string | null;
  from: string | null;
  compare: { before: string; after: string } | null;
  wise: Wise | null;
  /** The questions asked: categories (one subject) or layers (a sweep). change stores its parent's. */
  ask: { categories: Category[]; layers: Layer[] };
  over: Record<string, unknown> | null;
  items: Record<string, ItemRecord> | null;
  /** Question id ("3", "goal", "payments/refunds#3", "before:3") → the checked answer. */
  answers: Record<string, Answer>;
  /** Question id → answer key (translate.ts answerKey): what makes an answer reusable. */
  keys: Record<string, string>;
  /** Question id → the run whose answer was reused for it. */
  reusedFrom: Record<string, string>;
  /** One subject: category → gate (change: the "after" gates). */
  categories: Record<string, Gate>;
  gate: Gate;
  goalGate: Gate | null;
  goalP: number | null;
  consensus: Consensus | null;
  /** The YAML the agent was sent. */
  response: string;
  notes: string[];
  adapter: string;
  model: string;
  costUsd: number | null;
  /** HTTP calls made (0 when every answer was reused). */
  calls: number;
}

/** What a verb hands the ledger: the response is built inside the lock, once the id and the budget are known. */
export type NewContractRun = Omit<ContractRun, 'kind' | 'v' | 'id' | 'uid' | 'ts' | 'response'> & {
  response: (id: string, budget: string) => string;
};

export interface OutcomeRecord {
  kind: 'outcome';
  id: string;
  uid: string;
  ts: string;
  of: string;
  outcome: Outcome;
  by: string;
}

/**
 * A paid call whose answer could not be used (junk, missing answers, probabilities outside 0..1). It carries no
 * SW id (run ids stay gap-free) but is counted in the budget, so budget runs == run records + failed records.
 */
export interface FailedRecord {
  kind: 'failed';
  /** The record's ulid (a failed call has no SW-#### id). */
  id: string;
  uid: string;
  ts: string;
  verb: Verb;
  actor: string;
  adapter: string;
  model: string;
  costUsd: number | null;
  reason: string;
}

export type NewFailed = Omit<FailedRecord, 'kind' | 'id' | 'uid' | 'ts'>;

export type LedgerRecord = RunRecord | ContractRun | OutcomeRecord | FailedRecord;

export class LedgerError extends Error {
  /** 1: the ledger itself is the problem · 2: the caller asked for something the ledger doesn't hold. */
  readonly exit: 1 | 2;
  constructor(message: string, exit: 1 | 2 = 1) {
    super(message);
    this.name = 'LedgerError';
    this.exit = exit;
  }
}

/** A Plan 1 text-format run (read only). */
export const isRun = (r: LedgerRecord): r is RunRecord => r.kind === 'run' && !('v' in r);
export const isContractRun = (r: LedgerRecord): r is ContractRun => r.kind === 'run' && (r as ContractRun).v === 2;
const iso = (now: number): string => new Date(now).toISOString().replace(/\.\d{3}Z$/, 'Z');

const isText = (v: unknown): boolean => typeof v === 'string';
const isObj = (v: unknown): boolean => !!v && typeof v === 'object' && !Array.isArray(v);

/**
 * Just enough shape for every reader (view, outcome, id counting) to use a record without crashing. Exported
 * so ledger/index.ts's line parser can reuse it verbatim: the index and readLedger must never disagree about
 * what counts as a valid record, or the index could silently hide corruption readLedger would catch.
 */
export function isRecord(v: unknown): v is LedgerRecord {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  const r = v as Record<string, unknown>;
  if (r.kind === 'outcome') return [r.id, r.of, r.outcome, r.by, r.ts].every(isText);
  if (r.kind === 'failed') return [r.id, r.ts, r.verb, r.actor, r.adapter, r.model, r.reason].every(isText);
  if (r.kind !== 'run') return false;
  if (r.v === 2) {
    return (
      [r.id, r.uid, r.ts, r.verb, r.goal, r.gate, r.adapter, r.model, r.actor, r.response].every(isText) &&
      Array.isArray(r.where) &&
      r.where.every(isText) &&
      isObj(r.answers) &&
      isObj(r.keys) &&
      isObj(r.categories)
    );
  }
  return (
    [r.id, r.ts, r.verb, r.focus, r.consensus, r.verdict, r.adapter].every(isText) &&
    typeof r.level === 'number' &&
    Array.isArray(r.tags) &&
    r.tags.every(isText) &&
    Array.isArray(r.where) &&
    r.where.every((w: unknown) => !!w && typeof w === 'object' && isText((w as Record<string, unknown>).path))
  );
}

/** The ledger's path, shown relative to the project root (never absolute — AGENTS.md: no machine paths in output
 *  or errors). Shared with ledger/index.ts so a line's error text always names the file the same way readLedger does. */
export const shownLog = (paths: SidewisePaths): string => path.relative(paths.root, paths.log).split(path.sep).join('/');

/**
 * Every record, in order. A line that isn't a record refuses the whole read (fail closed): ids are counted from it.
 * `partialTail` (readers that don't hold the lock, like view): a bad last line with no trailing newline is skipped,
 * since it may be an append in progress. Writers always read strictly, under the lock.
 */
export function readLedger(paths: SidewisePaths, opts: { partialTail?: boolean } = {}): LedgerRecord[] {
  const text = onStore(paths.log, 'read', () => (existsSync(paths.log) ? readFileSync(paths.log, 'utf8') : ''));
  const shown = shownLog(paths);
  const records: LedgerRecord[] = [];
  const lines = text.split('\n');
  lines.forEach((line, i) => {
    if (!line.trim()) return;
    const inProgress = opts.partialTail === true && i === lines.length - 1; // the last segment has no newline after it
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch {
      if (inProgress) return;
      throw new LedgerError(`✖ ledger: line ${i + 1} of ${shown} is not valid JSON → fix or remove that line`);
    }
    if (!isRecord(value)) {
      if (inProgress) return;
      throw new LedgerError(`✖ ledger: line ${i + 1} of ${shown} is not a ledger record → fix or remove that line`);
    }
    records.push(value);
  });
  return records;
}

/** Before a paid call: the ledger reads cleanly and can be appended to, so a run we pay for can be logged. */
export function checkLedger(paths: SidewisePaths): void {
  withLock(paths.lock, () => {
    readLedger(paths);
    if (existsSync(paths.log)) onStore(paths.log, 'write', () => accessSync(paths.log, constants.W_OK));
  });
}

function appendLine(paths: SidewisePaths, record: LedgerRecord): void {
  onStore(paths.log, 'write', () => {
    mkdirSync(paths.dir, { recursive: true });
    const current = existsSync(paths.log) ? readFileSync(paths.log, 'utf8') : '';
    const needsBreak = current.length > 0 && !current.endsWith('\n');
    appendFileSync(paths.log, `${needsBreak ? '\n' : ''}${JSON.stringify(record)}\n`);
  });
}

/** The next SW number, from the id index (ledger/index.ts) instead of a linear scan. The caller holds the lock. */
export function nextRunNumber(paths: SidewisePaths): number {
  return loadIndex(paths).runCount + 1;
}

/** A run of either shape by SW id, or undefined: one index lookup plus one line read, never a full scan. */
export function findRun(paths: SidewisePaths, id: string): RunRecord | ContractRun | undefined {
  const at = loadIndex(paths).runOffset[id];
  return at === undefined ? undefined : (readRecordAt(paths.log, at) as RunRecord | ContractRun);
}

/** Appends a run with the next SW id. The caller holds the lock (see appendRun, and recordCall in record.ts). */
export function appendRunLocked(paths: SidewisePaths, run: NewRun, now: number = Date.now()): RunRecord {
  const record: RunRecord = { kind: 'run', id: formatRunId(nextRunNumber(paths)), uid: ulid(now), ts: iso(now), ...redactDeep(run), actor: redactSecrets(run.actor) };
  appendLine(paths, record);
  return record;
}

/** Appends a contract run with the next SW id. The caller holds the lock (recordCall, or appendContractRun). */
export function appendContractRunLocked(paths: SidewisePaths, run: NewContractRun, now: number, budget: string): ContractRun {
  const id = formatRunId(nextRunNumber(paths));
  const { response, ...rest } = run;
  const record: ContractRun = {
    kind: 'run',
    v: 2,
    id,
    uid: ulid(now),
    ts: iso(now),
    ...redactDeep(rest),
    actor: redactSecrets(run.actor),
    response: redact(response(id, budget)),
  };
  appendLine(paths, record);
  return record;
}

/** A run that made no paid call (every answer reused): logged under the lock, not counted against the budget. */
export function appendContractRun(paths: SidewisePaths, run: NewContractRun, now: number, budget: string): ContractRun {
  return withLock(paths.lock, () => appendContractRunLocked(paths, run, now, budget));
}

/** Appends a failed call. The caller holds the lock. The ledger is read first, so a corrupt one refuses here too. */
export function appendFailedLocked(paths: SidewisePaths, failed: NewFailed, now: number = Date.now()): FailedRecord {
  readLedger(paths);
  const uid = ulid(now);
  const record: FailedRecord = { kind: 'failed', id: uid, uid, ts: iso(now), ...redactDeep(failed), actor: redactSecrets(failed.actor) };
  appendLine(paths, record);
  return record;
}

export function appendRun(paths: SidewisePaths, run: NewRun, now: number = Date.now()): RunRecord {
  return withLock(paths.lock, () => appendRunLocked(paths, run, now));
}

/**
 * Appends an outcome for a logged run. The run's latest outcome again, by the same actor, is not appended (an
 * agent retrying is a no-op): `repeat` is true and `record` is the one already there. Another actor's is appended.
 */
export function appendOutcome(paths: SidewisePaths, of: string, outcome: Outcome, by: string, now: number = Date.now()): { record: OutcomeRecord; repeat: boolean } {
  return withLock(paths.lock, () => {
    const records = readLedger(paths);
    const run = records.find((r): r is RunRecord | ContractRun => r.kind === 'run' && r.id === of);
    if (!run) throw new LedgerError(`✖ outcome: ${of} is not in the ledger → check the id with "sidewise view ${of}"`, 2);
    const who = redactSecrets(by); // the same transform the run's actor went through: compare like with like
    if (outcome === 'held' && who === run.actor) {
      throw new LedgerError(`✖ outcome: ${who} asked ${of}, so it can't mark it held → another agent or the owner records "held"`);
    }
    const latest = records.filter((r): r is OutcomeRecord => r.kind === 'outcome' && r.of === of).at(-1);
    if (latest?.outcome === outcome && latest.by === who) return { record: latest, repeat: true };
    const record: OutcomeRecord = { kind: 'outcome', id: `${of}-outcome`, uid: ulid(now), ts: iso(now), of, outcome, by: who };
    appendLine(paths, record);
    return { record, repeat: false };
  });
}

export function latestOutcome(records: readonly LedgerRecord[], id: string): Outcome | null {
  let found: Outcome | null = null;
  for (const r of records) if (r.kind === 'outcome' && r.of === id) found = r.outcome;
  return found;
}
