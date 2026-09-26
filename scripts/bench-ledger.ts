/**
 * Measures the ledger at scale: view/reuse lookup/next-id/append cost as log.jsonl grows from thousands to a
 * million runs, before and after the id index (src/ledger/index.ts) that Task 27 puts behind nextRunNumber and
 * findRun. Not part of `npm test` — 100k/1M ledgers are tens of MB to hundreds of MB and take real time to
 * generate; run by hand (`npx tsx scripts/bench-ledger.ts`) or via `npm run bench:ledger`, into a throwaway temp
 * project per size, never the repo. Exports runLedgerBench/renderBenchTable so a later task (docs/evidence/
 * ledger-scale.md) can re-run or re-render without duplicating this file.
 */
import { existsSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { generateLedgerRecords, toJsonl } from '../test/gen/synthetic-ledger.ts';
import { sampleContractRun } from '../test/helpers/runs.ts';
import { loadIndex } from '../src/ledger/index.ts';
import { appendContractRun, findRun, nextRunNumber } from '../src/ledger/log.ts';
import { pathsFor, type SidewisePaths } from '../src/ledger/paths.ts';
import { exactReuse, lookupAnswers, type Who } from '../src/ledger/reuse.ts';
import { seededRandom } from '../src/util/prng.ts';

export interface BenchRow {
  op: 'rebuild' | 'nextRunNumber' | 'findRun' | 'lookupAnswers' | 'exactReuse' | 'append';
  n: number;
  p50Ms: number;
  p95Ms: number;
}

export interface BenchResult {
  n: number;
  logBytes: number;
  indexBytes: number;
  rssMb: number;
  rows: BenchRow[];
}

/**
 * rebuild/lookupAnswers/exactReuse are still O(n) "before" baselines at this point in the plan (lookupAnswers and
 * exactReuse move onto the index in Task 29): running the default 200 samples of an O(n) op at n = 1,000,000 would
 * make the bench itself take a very long time on a shared machine. These three are capped independently of
 * `sampleCalls` — enough reps for a stable p50/p95, not enough to multiply an O(n) op's cost by 200. nextRunNumber
 * and findRun are the index-backed "after" ops this task adds, so they keep the full sample count.
 */
const O_N_SAMPLE_CAP = 20;
const DEFAULT_SAMPLE_CALLS = 200;
const DEFAULT_SIZES = [10_000, 100_000];

function pick<T>(rand: () => number, items: readonly T[]): T {
  return items[Math.floor(rand() * items.length)]!;
}

function timeCalls(samples: number, fn: () => void): number[] {
  const out: number[] = [];
  for (let i = 0; i < samples; i++) {
    const t0 = performance.now();
    fn();
    out.push(performance.now() - t0);
  }
  return out;
}

function percentile(sorted: readonly number[], p: number): number {
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))]!;
}

function toRow(op: BenchRow['op'], durations: readonly number[]): BenchRow {
  const sorted = [...durations].sort((a, b) => a - b);
  return { op, n: durations.length, p50Ms: percentile(sorted, 0.5), p95Ms: percentile(sorted, 0.95) };
}

const isRecordLike = (r: unknown): r is Record<string, unknown> => !!r && typeof r === 'object';

/** Ids of every run-kind record, and the keys/adapter/model of the last v2 contract run, from one already-
 *  generated batch — so the bench never has to generate the same size twice just to build its sample pools. */
function samplePools(records: readonly unknown[]): { ids: string[]; keys: string[]; who: Who } {
  const ids: string[] = [];
  const keys: string[] = [];
  let who: Who = { adapter: 'stub', model: 'stub-1' };
  for (const r of records) {
    if (!isRecordLike(r) || r.kind !== 'run') continue;
    if (typeof r.id === 'string') ids.push(r.id);
    if (r.v === 2 && isRecordLike(r.keys)) {
      keys.push(...Object.values(r.keys).filter((k): k is string => typeof k === 'string'));
      if (typeof r.adapter === 'string' && typeof r.model === 'string') who = { adapter: r.adapter, model: r.model };
    }
  }
  return { ids, keys, who };
}

/** Runs every op's samples for one already-written ledger at `paths`. */
function benchOne(paths: SidewisePaths, ids: readonly string[], keys: readonly string[], who: Who, sampleCalls: number, rand: () => number): BenchRow[] {
  const oNSamples = Math.min(sampleCalls, O_N_SAMPLE_CAP);
  const rows: BenchRow[] = [];

  rows.push(
    toRow(
      'rebuild',
      timeCalls(oNSamples, () => {
        rmSync(paths.index, { force: true });
        loadIndex(paths);
      }),
    ),
  );

  loadIndex(paths); // warm: index.json now reflects the whole log
  rows.push(toRow('nextRunNumber', timeCalls(sampleCalls, () => nextRunNumber(paths))));
  rows.push(
    toRow(
      'findRun',
      timeCalls(sampleCalls, () => findRun(paths, pick(rand, ids))),
    ),
  );

  if (keys.length) {
    rows.push(
      toRow(
        'lookupAnswers',
        timeCalls(oNSamples, () => lookupAnswers(paths, who, [pick(rand, keys)])),
      ),
    );
    rows.push(
      toRow(
        'exactReuse',
        timeCalls(oNSamples, () => exactReuse(paths, who, [pick(rand, keys)])),
      ),
    );
  }

  // One real append against the already-large ledger (not `sampleCalls` of them: each would grow the ledger and
  // skew the next sample), to show the index keeps appends fast too, not just reads.
  const appendMs = timeCalls(1, () => {
    appendContractRun(paths, sampleContractRun({ keys: {}, reusedFrom: {} }), Date.now(), 'bench');
  });
  rows.push(toRow('append', appendMs));

  return rows;
}

/** One size's full pass: a fresh temp project, a generated ledger of `n` runs, then every op's samples. */
async function benchSize(n: number, seed: string, sampleCalls: number): Promise<BenchResult> {
  const root = mkdtempSync(path.join(os.tmpdir(), 'sidewise-bench-ledger-'));
  try {
    const paths = pathsFor(root);
    const rand = seededRandom(`${seed}-sample-${n}`);
    const records = generateLedgerRecords({ seed: `${seed}-${n}`, runs: n });
    const text = toJsonl(records);
    mkdirSync(paths.dir, { recursive: true });
    writeFileSync(paths.log, text);
    const logBytes = Buffer.byteLength(text, 'utf8');

    const { ids, keys, who } = samplePools(records);
    const rows = benchOne(paths, ids, keys, who, sampleCalls, rand);

    const indexBytes = existsSync(paths.index) ? statSync(paths.index).size : 0;
    const rssMb = process.memoryUsage().rss / 1e6;
    return { n, logBytes, indexBytes, rssMb, rows };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

/** Runs every op's bench at every size in `sizes`, each in its own fresh temp project (deleted afterward). */
export async function runLedgerBench(sizes: readonly number[], opts: { seed?: string; sampleCalls?: number } = {}): Promise<BenchResult[]> {
  const seed = opts.seed ?? 'bench-ledger';
  const sampleCalls = opts.sampleCalls ?? DEFAULT_SAMPLE_CALLS;
  const results: BenchResult[] = [];
  for (const n of sizes) {
    results.push(await benchSize(n, seed, sampleCalls));
  }
  return results;
}

const OP_ORDER: readonly BenchRow['op'][] = ['rebuild', 'nextRunNumber', 'findRun', 'lookupAnswers', 'exactReuse', 'append'];

/** One markdown table per op: a row per size, so each op's scaling is easy to read at a glance. */
export function renderBenchTable(results: readonly BenchResult[]): string {
  const lines: string[] = [];
  for (const op of OP_ORDER) {
    const perSize = results.map((r) => ({ result: r, row: r.rows.find((x) => x.op === op) })).filter((x): x is { result: BenchResult; row: BenchRow } => x.row !== undefined);
    if (!perSize.length) continue;
    lines.push(`### ${op}`, '', '| n | p50 ms | p95 ms | log bytes | index bytes | rss MB |', '|---|---|---|---|---|---|');
    for (const { result, row } of perSize) {
      lines.push(`| ${row.n} | ${row.p50Ms.toFixed(3)} | ${row.p95Ms.toFixed(3)} | ${result.logBytes} | ${result.indexBytes} | ${result.rssMb.toFixed(1)} |`);
    }
    lines.push('');
  }
  return lines.join('\n').trimEnd();
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      sizes: { type: 'string', default: DEFAULT_SIZES.join(',') },
      seed: { type: 'string', default: 'bench-ledger' },
      out: { type: 'string' },
      md: { type: 'string' },
    },
  });
  const sizes = String(values.sizes)
    .split(',')
    .map((s) => Number.parseInt(s.trim(), 10))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (!sizes.length) {
    console.error('✖ bench-ledger: --sizes must be a comma list of positive integers → e.g. --sizes 10000,100000');
    process.exitCode = 2;
    return;
  }

  console.log(`bench-ledger: sizes=${sizes.join(',')} seed=${values.seed}`);
  const results = await runLedgerBench(sizes, { seed: String(values.seed) });
  const table = renderBenchTable(results);
  console.log(table);

  if (values.out) {
    writeFileSync(String(values.out), `${JSON.stringify(results, null, 2)}\n`);
    console.log(`wrote ${values.out}`);
  }
  if (values.md) {
    const preamble = '<!-- generated by scripts/bench-ledger.ts; do not edit by hand -->\n\n# Ledger scale bench\n\n';
    writeFileSync(String(values.md), `${preamble}${table}\n`);
    console.log(`wrote ${values.md}`);
  }
}

// Only run the CLI when this file is the entry point, not when a test imports runLedgerBench/renderBenchTable.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e: unknown) => {
    console.error(e);
    process.exitCode = 1;
  });
}
