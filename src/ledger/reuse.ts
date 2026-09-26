/**
 * Answer reuse (BRIEF §5 "Exact reuse"): the same question on the same evidence, answered before by the same
 * provider and model, comes back from the ledger with no call. Keys are answerKey hashes (contract/translate.ts).
 * A run whose latest outcome is overruled or failed is never reused, nor is an answer that came from one.
 * Linear over the ledger for now; the index (Task 29) replaces the lookup behind the same signatures.
 */
import type { Answer } from '../contract/types.ts';
import { isContractRun, readLedger, type ContractRun, type LedgerRecord } from './log.ts';
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

function blockedRuns(records: readonly LedgerRecord[]): Set<string> {
  const latest = new Map<string, string>();
  for (const r of records) if (r.kind === 'outcome') latest.set(r.of, r.outcome);
  return new Set([...latest].filter(([, o]) => o !== 'held').map(([id]) => id));
}

/** A contract run worth looking at at all: right shape, same provider and model, and not itself blocked. */
function isCandidate(r: LedgerRecord, who: Who, blocked: ReadonlySet<string>): r is ContractRun {
  return isContractRun(r) && r.adapter === who.adapter && r.model === who.model && !blocked.has(r.id);
}

/** Key → the newest reusable answer for it, for the keys asked about. */
export function lookupAnswers(paths: SidewisePaths, who: Who, keys: readonly string[]): Map<string, Reusable> {
  const want = new Set(keys);
  const out = new Map<string, Reusable>();
  if (!want.size) return out;
  const records = readLedger(paths, { partialTail: true });
  const blocked = blockedRuns(records);
  for (const r of records) {
    if (!isCandidate(r, who, blocked)) continue;
    for (const [qid, key] of Object.entries(r.keys)) {
      const answer = r.answers[qid];
      const id = r.reusedFrom[qid] ?? r.id;
      if (answer && want.has(key) && !blocked.has(id)) out.set(key, { id, answer });
    }
  }
  return out;
}

/**
 * The newest run (same provider and model) that holds every key, none of them traced back (through reusedFrom)
 * to a run that is now overruled or failed: its answer can be reused whole.
 */
export function exactReuse(paths: SidewisePaths, who: Who, keys: readonly string[]): string | undefined {
  if (!keys.length) return undefined;
  const records = readLedger(paths, { partialTail: true });
  const blocked = blockedRuns(records);
  for (let i = records.length - 1; i >= 0; i--) {
    const r = records[i]!;
    if (!isCandidate(r, who, blocked)) continue;
    const qidOf = new Map(Object.entries(r.keys).map(([qid, key]) => [key, qid]));
    const holds = keys.every((k) => {
      const qid = qidOf.get(k);
      if (qid === undefined) return false;
      const origin = r.reusedFrom[qid] ?? r.id;
      return !blocked.has(origin);
    });
    if (holds) return r.id;
  }
  return undefined;
}
