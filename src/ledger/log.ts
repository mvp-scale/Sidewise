/**
 * The ledger: .sidewise/log.jsonl, append-only, one record shape for every verb. Runs get SW-#### in order
 * under the lock, plus a ULID. Outcomes are separate appended lines, never edits. Everything is redacted
 * before it is written; identities (run actor, outcome by) keep emails so they stay comparable, but never secrets.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { Consensus } from '../lens/consensus.ts';
import type { Level, Place, Verb } from '../lens/request.ts';
import { formatRunId, ulid } from './ids.ts';
import { withLock } from './lock.ts';
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
  constructor(message: string) {
    super(message);
    this.name = 'LedgerError';
  }
}

export const isRun = (r: LedgerRecord): r is RunRecord => r.kind === 'run';
const iso = (now: number): string => new Date(now).toISOString().replace(/\.\d{3}Z$/, 'Z');

export function readLedger(paths: SidewisePaths): LedgerRecord[] {
  if (!existsSync(paths.log)) return [];
  const shown = path.relative(paths.root, paths.log).split(path.sep).join('/');
  const records: LedgerRecord[] = [];
  readFileSync(paths.log, 'utf8')
    .split('\n')
    .forEach((line, i) => {
      if (!line.trim()) return;
      try {
        records.push(JSON.parse(line) as LedgerRecord);
      } catch {
        throw new LedgerError(`✖ ledger: line ${i + 1} of ${shown} is not valid JSON → fix or remove that line`);
      }
    });
  return records;
}

function appendLine(paths: SidewisePaths, record: LedgerRecord): void {
  mkdirSync(paths.dir, { recursive: true });
  const needsBreak = existsSync(paths.log) && !readFileSync(paths.log, 'utf8').endsWith('\n') && readFileSync(paths.log, 'utf8').length > 0;
  appendFileSync(paths.log, `${needsBreak ? '\n' : ''}${JSON.stringify(record)}\n`);
}

export function appendRun(paths: SidewisePaths, run: NewRun, now: number = Date.now()): RunRecord {
  return withLock(paths.lock, () => {
    const count = readLedger(paths).filter(isRun).length;
    const record: RunRecord = { kind: 'run', id: formatRunId(count + 1), uid: ulid(now), ts: iso(now), ...redactDeep(run), actor: redactSecrets(run.actor) };
    appendLine(paths, record);
    return record;
  });
}

export function appendOutcome(paths: SidewisePaths, of: string, outcome: Outcome, by: string, now: number = Date.now()): OutcomeRecord {
  return withLock(paths.lock, () => {
    const run = readLedger(paths).filter(isRun).find((r) => r.id === of);
    if (!run) throw new LedgerError(`✖ outcome: ${of} is not in the ledger → check the id with "sidewise view ${of}"`);
    const who = redactSecrets(by); // the same transform the run's actor went through: compare like with like
    if (outcome === 'held' && who === run.actor) {
      throw new LedgerError(`✖ outcome: ${who} asked ${of}, so it can't mark it held → another agent or the owner records "held"`);
    }
    const record: OutcomeRecord = { kind: 'outcome', id: `${of}-outcome`, uid: ulid(now), ts: iso(now), of, outcome, by: who };
    appendLine(paths, record);
    return record;
  });
}

export function latestOutcome(records: readonly LedgerRecord[], id: string): Outcome | null {
  let found: Outcome | null = null;
  for (const r of records) if (r.kind === 'outcome' && r.of === id) found = r.outcome;
  return found;
}
