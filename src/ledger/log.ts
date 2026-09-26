/**
 * The ledger: .sidewise/log.jsonl, append-only, one record shape for every verb. Runs get SW-#### in order
 * under the lock, plus a ULID. Outcomes are separate appended lines, never edits. Everything is redacted
 * before it is written; identities (run actor, outcome by) keep emails so they stay comparable, but never secrets.
 */
import { accessSync, appendFileSync, constants, existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { Consensus } from '../lens/consensus.ts';
import type { Level, Place, Verb } from '../lens/request.ts';
import { formatRunId, ulid } from './ids.ts';
import { onStore, withLock } from './lock.ts';
import type { SidewisePaths } from './paths.ts';
import { redactDeep, redactSecrets } from './redact.ts';

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

export interface OutcomeRecord {
  kind: 'outcome';
  id: string;
  uid: string;
  ts: string;
  of: string;
  outcome: Outcome;
  by: string;
}

export type LedgerRecord = RunRecord | OutcomeRecord;

export class LedgerError extends Error {
  /** 1: the ledger itself is the problem · 2: the caller asked for something the ledger doesn't hold. */
  readonly exit: 1 | 2;
  constructor(message: string, exit: 1 | 2 = 1) {
    super(message);
    this.name = 'LedgerError';
    this.exit = exit;
  }
}

export const isRun = (r: LedgerRecord): r is RunRecord => r.kind === 'run';
const iso = (now: number): string => new Date(now).toISOString().replace(/\.\d{3}Z$/, 'Z');

const isText = (v: unknown): boolean => typeof v === 'string';

/** Just enough shape for every reader (view, outcome, id counting) to use a record without crashing. */
function isRecord(v: unknown): v is LedgerRecord {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  const r = v as Record<string, unknown>;
  if (r.kind === 'outcome') return [r.id, r.of, r.outcome, r.by, r.ts].every(isText);
  if (r.kind !== 'run') return false;
  return (
    [r.id, r.ts, r.verb, r.focus, r.consensus, r.verdict, r.adapter].every(isText) &&
    typeof r.level === 'number' &&
    Array.isArray(r.tags) &&
    r.tags.every(isText) &&
    Array.isArray(r.where) &&
    r.where.every((w: unknown) => !!w && typeof w === 'object' && isText((w as Record<string, unknown>).path))
  );
}

/** Every record, in order. A line that isn't a record refuses the whole read (fail closed): ids are counted from it. */
export function readLedger(paths: SidewisePaths): LedgerRecord[] {
  const text = onStore(paths.log, 'read', () => (existsSync(paths.log) ? readFileSync(paths.log, 'utf8') : ''));
  const shown = path.relative(paths.root, paths.log).split(path.sep).join('/');
  const records: LedgerRecord[] = [];
  text.split('\n').forEach((line, i) => {
    if (!line.trim()) return;
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch {
      throw new LedgerError(`✖ ledger: line ${i + 1} of ${shown} is not valid JSON → fix or remove that line`);
    }
    if (!isRecord(value)) throw new LedgerError(`✖ ledger: line ${i + 1} of ${shown} is not a ledger record → fix or remove that line`);
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

export function appendRun(paths: SidewisePaths, run: NewRun, now: number = Date.now()): RunRecord {
  return withLock(paths.lock, () => {
    const count = readLedger(paths).filter(isRun).length;
    const record: RunRecord = { kind: 'run', id: formatRunId(count + 1), uid: ulid(now), ts: iso(now), ...redactDeep(run), actor: redactSecrets(run.actor) };
    appendLine(paths, record);
    return record;
  });
}

/**
 * Appends an outcome for a logged run. The same outcome as the run's latest is not appended again (an agent
 * retrying is a no-op): `repeat` is true and `record` is the one already there.
 */
export function appendOutcome(paths: SidewisePaths, of: string, outcome: Outcome, by: string, now: number = Date.now()): { record: OutcomeRecord; repeat: boolean } {
  return withLock(paths.lock, () => {
    const records = readLedger(paths);
    const run = records.filter(isRun).find((r) => r.id === of);
    if (!run) throw new LedgerError(`✖ outcome: ${of} is not in the ledger → check the id with "sidewise view ${of}"`, 2);
    const who = redactSecrets(by); // the same transform the run's actor went through: compare like with like
    if (outcome === 'held' && who === run.actor) {
      throw new LedgerError(`✖ outcome: ${who} asked ${of}, so it can't mark it held → another agent or the owner records "held"`);
    }
    const latest = records.filter((r): r is OutcomeRecord => r.kind === 'outcome' && r.of === of).at(-1);
    if (latest?.outcome === outcome) return { record: latest, repeat: true };
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
