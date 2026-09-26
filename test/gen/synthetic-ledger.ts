/**
 * Deterministic synthetic log.jsonl at ledger scale (thousands to a million runs): feeds test/unit/ledger-index.test.ts
 * (a small size npm test can afford) and scripts/bench-ledger.ts (10k/100k/1M, run by hand). Produces both run
 * shapes the ledger accepts — legacy RunRecord (no `v`) and ContractRun (`v: 2`) — interleaved with OutcomeRecord
 * and occasional FailedRecord lines, the same way a real project's ledger grows over time. Writes directly with
 * one writeFileSync, bypassing the lock and appendRunLocked/appendContractRunLocked on purpose: going through the
 * real append path per record would itself be the O(n^2) scan this task's index fixes.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import type { ItemStatus } from '../../src/contract/grade.ts';
import { AREAS as WISE_AREAS, DEPTHS, VERBS, WHYS, type Answer, type Category, type Depth, type Gate, type Layer, type Verb, type Wise } from '../../src/contract/types.ts';
import type { ContractRun, ItemRecord, Outcome, RunRecord } from '../../src/ledger/log.ts';
import { formatRunId, ulid } from '../../src/ledger/ids.ts';
import type { SidewisePaths } from '../../src/ledger/paths.ts';
import { fnv1a, pick, seededRandom } from './prng.ts';
import { AREAS as CODE_AREAS, PERSPECTIVES, TAGS } from './synthetic-log.ts';

export interface SynthLedgerOptions {
  seed?: string;
  /** Number of run-kind records (legacy + contract) to generate. */
  runs?: number;
  /** Fraction of runs written as legacy (Plan 1, no `v`) records rather than ContractRun v2. */
  legacyShare?: number;
  /** Share of runs that get an outcome line right after them. */
  outcomeRate?: number;
  /** Of those, the share that come back overruled/failed rather than held. */
  badRate?: number;
  /** Share of contract runs that are a sweep (items populated) rather than one subject. */
  sweepShare?: number;
  /** [min, max] ItemRecords on a sweep run. */
  itemsPerSweep?: [number, number];
  /** Providers to draw adapter/model from, weighted. */
  providers?: readonly { adapter: string; model: string; weight: number }[];
  /** ISO timestamp the first record's clock starts at; ts then walks forward. */
  start?: string;
}

const DEFAULT_PROVIDERS: readonly { adapter: string; model: string; weight: number }[] = [
  { adapter: 'stub', model: 'stub-1', weight: 0.7 },
  { adapter: 'typesafe', model: 'jev-1.13.0', weight: 0.3 },
];

const ACTORS = ['reviewer', 'owner', 'builder', 'agent'] as const;
const GATES: readonly Gate[] = ['pass', 'fail', 'unsure'];
const CONSENSUS_VALUES = ['STRONG', 'SPLIT', 'WEAK'] as const;
const ITEM_STATUSES: readonly ItemStatus[] = ['asked', 'reused', 'skipped'];
/** A failed call (no SW id) shows up occasionally, independent of the outcome rate. */
const FAILED_RATE = 0.02;

const iso = (now: number): string => new Date(now).toISOString().replace(/\.\d{3}Z$/, 'Z');

/** A run's answerKey-shaped id: real keys hash the evidence + question; this hashes a small, repeating pool
 *  (area, tag, question number) so the same key naturally recurs across runs — the "same question asked again"
 *  pattern reuse (Task 29) needs to have something to find. */
const keyFor = (area: string, tag: string, qid: string): string => `k-${fnv1a(`${area}|${tag}|${qid}`).toString(36)}`;

function buildLegacyRun(id: string, uid: string, ts: string, rand: () => number, area: string, tag: string, who: { adapter: string; model: string }): RunRecord {
  const level = (1 + Math.floor(rand() * 3)) as 1 | 2 | 3;
  return {
    kind: 'run',
    id,
    uid,
    ts,
    verb: pick(rand, VERBS),
    level,
    actor: pick(rand, ACTORS),
    perspective: pick(rand, PERSPECTIVES),
    where: [{ path: `src/${area}/file${Math.floor(rand() * 5)}.ts`, area }],
    problem: `synthetic ${area}/${tag} problem`,
    tags: [tag],
    focus: `${tag} in ${area}`,
    slots: [{ pos: 1, text: `Is ${tag} handled in ${area}?`, reverse: false, p: Math.round(rand() * 100) / 100 }],
    primitives: [],
    consensus: pick(rand, CONSENSUS_VALUES),
    verdict: pick(rand, ['concern', 'clear'] as const),
    notes: [],
    adapter: who.adapter,
    model: who.model,
    costUsd: Math.round(rand() * 500) / 10000,
    task: null,
  };
}

function buildContractRun(
  id: string,
  uid: string,
  ts: string,
  rand: () => number,
  area: string,
  tag: string,
  who: { adapter: string; model: string },
  sweep: { sweepShare: number; minItems: number; maxItems: number },
): ContractRun {
  const verb: Verb = pick(rand, VERBS);
  const isSweep = rand() < sweep.sweepShare;
  const qCount = 1 + Math.floor(rand() * 3); // 1-3 answers/keys, per the brief
  const answers: Record<string, Answer> = {};
  const keys: Record<string, string> = {};
  for (let q = 1; q <= qCount; q++) {
    const qid = String(q);
    answers[qid] = { kind: 'yesno', p: Math.round(rand() * 100) / 100 };
    keys[qid] = keyFor(area, tag, qid);
  }
  const category: Category = {
    name: tag,
    pass: pick(rand, ['yes', 'no'] as const),
    need: 'all',
    tags: [tag],
    questions: Array.from({ length: qCount }, (_, k) => ({ n: k + 1, kind: 'yesno' as const, text: `Does ${area} handle ${tag} correctly (${k + 1})?` })),
  };
  const gate = pick(rand, GATES);

  let items: Record<string, ItemRecord> | null = null;
  const layers: Layer[] = [];
  if (isSweep) {
    const itemCount = sweep.minItems + Math.floor(rand() * (sweep.maxItems - sweep.minItems + 1));
    items = {};
    for (let it = 0; it < itemCount; it++) {
      items[`${area}/${tag}-${it}`] = {
        layer: area,
        fill: { [area]: `${tag}-${it}` },
        status: pick(rand, ITEM_STATUSES),
        gate: pick(rand, GATES),
        categories: { [tag]: pick(rand, GATES) },
      };
    }
    layers.push({ name: area, categories: [category] });
  }

  return {
    kind: 'run',
    v: 2,
    id,
    uid,
    ts,
    verb,
    actor: pick(rand, ACTORS),
    task: null,
    goal: `${tag} in ${area} is safe`,
    depth: pick(rand, DEPTHS) as Depth,
    where: [`src/${area}/file${Math.floor(rand() * 5)}.ts`],
    parent: null,
    from: null,
    compare: null,
    wise: rand() < 0.5 ? ({ why: pick(rand, WHYS), area: pick(rand, WISE_AREAS) } satisfies Wise) : null,
    ask: { categories: isSweep ? [] : [category], layers },
    over: isSweep ? { [area]: 'each' } : null,
    items,
    answers,
    keys,
    reusedFrom: {},
    categories: { [tag]: gate },
    gate,
    goalGate: gate,
    goalP: Math.round(rand() * 100) / 100,
    consensus: pick(rand, CONSENSUS_VALUES),
    response: `side:\n  id: ${id}\n  gate: ${gate}\n`,
    notes: [],
    adapter: who.adapter,
    model: who.model,
    costUsd: Math.round(rand() * 500) / 10000,
    calls: 1,
  };
}

/** Plain JSON objects, ids assigned in emission order — the same shape writeSyntheticLedger writes to disk. */
export function generateLedgerRecords(opts: SynthLedgerOptions = {}): unknown[] {
  const seed = opts.seed ?? 'sidewise-ledger';
  const n = opts.runs ?? 200;
  const legacyShare = opts.legacyShare ?? 0.1;
  const outcomeRate = opts.outcomeRate ?? 0.5;
  const badRate = opts.badRate ?? 0.2;
  const sweepShare = opts.sweepShare ?? 0.2;
  const [minItems, maxItems] = opts.itemsPerSweep ?? [1, 5];
  const providers = opts.providers ?? DEFAULT_PROVIDERS;
  const totalWeight = providers.reduce((s, p) => s + p.weight, 0);

  const rand = seededRandom(seed);
  const randomBytes = (count: number): Uint8Array => {
    const bytes = new Uint8Array(count);
    for (let i = 0; i < count; i++) bytes[i] = Math.floor(rand() * 256);
    return bytes;
  };

  let t = Date.parse(opts.start ?? '2026-09-01T00:00:00Z');
  const step = (): number => {
    t += 15_000 + Math.floor(rand() * 45_000); // walks forward 15-60s per emitted line
    return t;
  };
  const nextUid = (): string => ulid(t, randomBytes);

  const pickProvider = (): { adapter: string; model: string } => {
    let r = rand() * totalWeight;
    for (const p of providers) {
      r -= p.weight;
      if (r <= 0) return { adapter: p.adapter, model: p.model };
    }
    return providers[providers.length - 1]!;
  };

  const records: unknown[] = [];
  for (let i = 0; i < n; i++) {
    const area = pick(rand, CODE_AREAS);
    const tag = pick(rand, TAGS);
    const who = pickProvider();
    const id = formatRunId(i + 1);
    const ts = iso(step());
    const uid = nextUid();

    records.push(rand() < legacyShare ? buildLegacyRun(id, uid, ts, rand, area, tag, who) : buildContractRun(id, uid, ts, rand, area, tag, who, { sweepShare, minItems, maxItems }));

    if (rand() < outcomeRate) {
      const bad = rand() < badRate;
      const outcome: Outcome = bad ? (rand() < 0.5 ? 'overruled' : 'failed') : 'held';
      records.push({ kind: 'outcome', id: `${id}-outcome`, uid: nextUid(), ts: iso(step()), of: id, outcome, by: pick(rand, ACTORS) });
    }

    if (rand() < FAILED_RATE) {
      const fuid = nextUid();
      records.push({ kind: 'failed', id: fuid, uid: fuid, ts: iso(step()), verb: pick(rand, VERBS), actor: pick(rand, ACTORS), adapter: who.adapter, model: who.model, costUsd: 0.001, reason: 'junk answer' });
    }
  }
  return records;
}

export const toJsonl = (records: readonly unknown[]): string => (records.length ? `${records.map((r) => JSON.stringify(r)).join('\n')}\n` : '');

/** One writeFileSync, no lock, no per-line append (generation, not a real run). */
export function writeSyntheticLedger(paths: SidewisePaths, opts: SynthLedgerOptions = {}): { count: number; bytes: number } {
  const records = generateLedgerRecords(opts);
  const count = records.filter((r) => (r as { kind?: unknown }).kind === 'run').length;
  const text = toJsonl(records);
  mkdirSync(paths.dir, { recursive: true });
  writeFileSync(paths.log, text);
  return { count, bytes: Buffer.byteLength(text, 'utf8') };
}
