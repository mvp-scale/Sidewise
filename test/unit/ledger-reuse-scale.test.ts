// The index-backed lookupAnswers/exactReuse must agree with a from-scratch linear scan, at a size that
// exercises repeated keys, mixed outcomes, and more than one (adapter, model) — every knob reuse depends on.
import { rmSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { writeSyntheticLedger } from '../gen/synthetic-ledger.ts';
import { isContractRun, readLedger, type LedgerRecord } from '../../src/ledger/log.ts';
import { exactReuse, lookupAnswers, type Who } from '../../src/ledger/reuse.ts';
import { tempProject } from '../helpers/project.ts';
import { seededRandom } from '../gen/prng.ts';

/** Task 11's original, deliberately-linear reuse logic, kept here as the oracle — not the code under test. */
function blockedRuns(records: readonly LedgerRecord[]): Set<string> {
  const latest = new Map<string, string>();
  for (const r of records) if (r.kind === 'outcome') latest.set(r.of, r.outcome);
  return new Set([...latest].filter(([, o]) => o !== 'held').map(([id]) => id));
}
function linearLookup(records: readonly LedgerRecord[], who: Who, keys: readonly string[]): Map<string, { id: string; answer: unknown }> {
  const want = new Set(keys);
  const out = new Map<string, { id: string; answer: unknown }>();
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
function linearExact(records: readonly LedgerRecord[], who: Who, keys: readonly string[]): string | undefined {
  if (!keys.length) return undefined;
  const blocked = blockedRuns(records);
  for (let i = records.length - 1; i >= 0; i--) {
    const r = records[i]!;
    if (!isContractRun(r) || r.adapter !== who.adapter || r.model !== who.model || blocked.has(r.id)) continue;
    if (keys.every((k) => new Set(Object.values(r.keys)).has(k))) return r.id;
  }
  return undefined;
}

describe('index-backed reuse agrees with the linear oracle at scale', () => {
  // exactReuse's "not found" case is genuinely O(candidates for that who) — same as the oracle it's checked
  // against, which is O(the whole ledger) — since only a full scan can conclusively rule out any run holding
  // every requested key together. At 6000 runs and 300 multi-key queries that adds up past vitest's default
  // 5 s; the work itself, not a bug, is why this test gets more room. Task 29 (revised): the SQL engine adds a
  // real (small, ~4 ms at this size) per-call open+self-heal-check cost on TOP of that same O(candidates) walk
  // — 600 calls (lookupAnswers + exactReuse x 300) push this from "fits in 20 s" to "needs ~25-30 s" on a loaded
  // CI box; 40 s keeps real margin without hiding a genuine regression if the walk itself ever got slower.
  it(
    'across many random (who, keys) queries on a mixed-outcome, multi-provider ledger',
    () => {
      const { paths } = tempProject({});
      writeSyntheticLedger(paths, {
        seed: 'reuse-scale',
        runs: 6000,
        outcomeRate: 0.5,
        badRate: 0.25,
        providers: [
          { adapter: 'typesafe', model: 'jev-1.13.0', weight: 3 },
          { adapter: 'fake', model: 'sidewise-fake-1', weight: 1 },
        ],
      });
      const records = readLedger(paths);
      const allKeys = [...new Set(records.filter(isContractRun).flatMap((r) => Object.values(r.keys)))];
      const rand = seededRandom('reuse-scale-queries');
      const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)]!;
      for (let i = 0; i < 300; i++) {
        const who: Who = pick([{ adapter: 'typesafe', model: 'jev-1.13.0' }, { adapter: 'fake', model: 'sidewise-fake-1' }, { adapter: 'typesafe', model: 'jev-1.12.0' }]);
        const keys = Array.from({ length: 1 + Math.floor(rand() * 3) }, () => pick(allKeys));
        const wantLookup = linearLookup(records, who, keys);
        const gotLookup = lookupAnswers(paths, who, keys);
        expect(Object.fromEntries(gotLookup)).toEqual(Object.fromEntries(wantLookup));
        expect(exactReuse(paths, who, keys)).toBe(linearExact(records, who, keys));
      }
    },
    40_000,
  );

  it('an answer whose original run was later overruled is never reused, even reached through a chain', () => {
    const { paths } = tempProject({});
    writeSyntheticLedger(paths, { seed: 'reuse-chain', runs: 50, outcomeRate: 1, badRate: 1 }); // every run gets a bad outcome
    const records = readLedger(paths);
    const who: Who = { adapter: 'typesafe', model: 'jev-1.13.0' };
    const anyKey = [...new Set(records.filter(isContractRun).flatMap((r) => Object.values(r.keys)))][0]!;
    expect(lookupAnswers(paths, who, [anyKey]).size).toBe(0);
    expect(exactReuse(paths, who, [anyKey])).toBeUndefined();
  });
});

// global-constraints.md: "deleting or corrupting the index must never change an answer, a reuse decision, or an
// id." index.db is disposable by construction (ledger/index.ts self-heals it from log.jsonl alone whenever it's
// missing or unreadable); this proves that for reuse specifically, not just findRun/nextRunNumber (already
// covered in ledger-index.test.ts).
describe('deleting or corrupting index.db never changes a reuse decision', () => {
  it('lookupAnswers and exactReuse give the same answers with the index missing, corrupt, or warm', () => {
    const { paths } = tempProject({});
    writeSyntheticLedger(paths, {
      seed: 'reuse-index-disposable',
      runs: 800,
      outcomeRate: 0.5,
      badRate: 0.3,
      providers: [{ adapter: 'typesafe', model: 'jev-1.13.0', weight: 1 }],
    });
    const records = readLedger(paths);
    const who: Who = { adapter: 'typesafe', model: 'jev-1.13.0' };
    const allKeys = [...new Set(records.filter(isContractRun).flatMap((r) => Object.values(r.keys)))];
    const keys = allKeys.slice(0, 3);

    // Warm: index.db doesn't exist yet, so this call builds it from scratch.
    const warmLookup = Object.fromEntries(lookupAnswers(paths, who, keys));
    const warmExact = exactReuse(paths, who, keys);

    rmSync(paths.index, { force: true }); // missing
    expect(Object.fromEntries(lookupAnswers(paths, who, keys))).toEqual(warmLookup);
    expect(exactReuse(paths, who, keys)).toBe(warmExact);

    writeFileSync(paths.index, '{ not: valid json'); // corrupt
    expect(Object.fromEntries(lookupAnswers(paths, who, keys))).toEqual(warmLookup);
    expect(exactReuse(paths, who, keys)).toBe(warmExact);

    writeFileSync(paths.index, JSON.stringify({ v: 1, upto: 0, lineCount: 0, runCount: 0, runOffset: {}, blocked: {}, reuseKey: {} })); // the old (pre-Task-29-revised) JSON sidecar's shape, at the new .db path — still just garbage bytes to the SQLite/fallback self-heal check
    expect(Object.fromEntries(lookupAnswers(paths, who, keys))).toEqual(warmLookup);
    expect(exactReuse(paths, who, keys)).toBe(warmExact);
  });
});
