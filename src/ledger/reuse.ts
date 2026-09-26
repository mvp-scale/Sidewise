/**
 * Answer reuse (BRIEF §5 "Exact reuse"): the same question on the same evidence, answered before by the same
 * provider and model, comes back from the ledger with no call. Keys are answerKey hashes (contract/translate.ts).
 * A run whose latest outcome is overruled or failed is never reused, nor is an answer that came from one.
 * Linear over the ledger for now; the index (Task 29) replaces the lookup behind the same signatures.
 */
import type { Answer } from '../contract/types.ts';
import { isContractRun, readLedger, type LedgerRecord } from './log.ts';
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

/** Key → the newest reusable answer for it, for the keys asked about. */
export function lookupAnswers(paths: SidewisePaths, who: Who, keys: readonly string[]): Map<string, Reusable> {
  const want = new Set(keys);
  const out = new Map<string, Reusable>();
  if (!want.size) return out;
  const records = readLedger(paths, { partialTail: true });
  const blocked = blockedRuns(records);
  for (const r of records) {
    if (!isContractRun(r) || r.adapter !== who.adapter || r.model !== who.model || blocked.has(r.id)) continue;
    for (const [qid, key] of Object.entries(r.keys)) {
      const answer = r.answers[qid];
      const id = r.reusedFrom[qid] ?? r.id;
      if (answer && want.has(key) && !blocked.has(id)) out.set(key, { id, answer });
    }
  }
  return out;
}

/** The newest run (same provider and model, not overruled or failed) that holds every key: its answer can be reused whole. */
export function exactReuse(paths: SidewisePaths, who: Who, keys: readonly string[]): string | undefined {
  if (!keys.length) return undefined;
  const records = readLedger(paths, { partialTail: true });
  const blocked = blockedRuns(records);
  for (let i = records.length - 1; i >= 0; i--) {
    const r = records[i]!;
    if (!isContractRun(r) || r.adapter !== who.adapter || r.model !== who.model || blocked.has(r.id)) continue;
    const have = new Set(Object.values(r.keys));
    if (keys.every((k) => have.has(k))) return r.id;
  }
  return undefined;
}
