/**
 * Measures the SQLite ledger index (src/ledger/index.ts, Task 29 revised) at scale: rebuild time, db size vs
 * log size, per-call catch-up after 1/50 new lines, reuse hit/miss, run-by-id, an outcome append, broad/narrow
 * place lookups, a dynamic Wise json_extract query without/with an expression index, and one real end-to-end
 * paid `class` call through the fake provider. Not part of `npm test` — 10k/100k ledgers take real time and
 * real disk; run by hand (`npx tsx scripts/bench-ledger.ts`) or `npm run bench:ledger`, into a throwaway temp
 * project per size, never the repo. The Wise query needs node:sqlite for real (Node >= 22.13); on a host without
 * it, that row is skipped with a note, everything else still runs against the linear fallback (slower, correct).
 * Exports runLedgerBench/renderBenchTable so docs/evidence/ledger-scale.md can be regenerated without duplicating
 * this file (test/unit/ledger-scale-doc.test.ts checks the doc's structure stays current against a small run).
 */
import { closeSync, copyFileSync, existsSync, fsyncSync, mkdirSync, mkdtempSync, openSync, rmSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import type { Answer } from '../src/contract/types.ts';
import { createFakeAdapter } from '../src/classifier/fake.ts';
import { formatRunId } from '../src/ledger/ids.ts';
import { appendOutcome, findRun, isContractRun, nextRunNumber } from '../src/ledger/log.ts';
import { pathsFor, type SidewisePaths } from '../src/ledger/paths.ts';
import { exactReuse, lookupAnswers, type Who } from '../src/ledger/reuse.ts';
import { seededRandom } from '../src/util/prng.ts';
import { runClass } from '../src/verbs/class.ts';
import { runView } from '../src/verbs/view.ts';

export interface BenchRow {
  op: string;
  samples: number;
  p50Ms: number;
  p95Ms: number;
}

export interface WiseRow {
  withoutIndexMs: number;
  withIndexMs: number;
}

export interface ClassRow {
  exit: number;
  calls: number;
  logGrewBytes: number;
  ms: number;
}

export interface BenchResult {
  n: number;
  logBytes: number;
  dbBytes: number;
  /** undefined when node:sqlite isn't really available (the fallback never writes index.db at all). */
  dbLogRatio: number | undefined;
  rows: BenchRow[];
  /** undefined on a host with no node:sqlite (Node < 22.13): the query needs a real db file to open directly. */
  wise: WiseRow | undefined;
  classCall: ClassRow;
}

const DEFAULT_SIZES = [10_000, 100_000];

// ---------------------------------------------------------------------------------------------------------------
// A realistic-key-volume generator, self-contained (test/gen/synthetic-ledger.ts's buildContractRun hardcodes
// 1-3 keys/run for its own callers — test/unit/ledger-index.test.ts and the reuse-scale test — and isn't
// reused here so that generator's existing behavior/timing stays untouched). 10-20 answer keys/run, drawn from
// a bounded (area x tag x qid x bucket) pool so keys genuinely repeat across runs — the "same question asked
// again" pattern reuse depends on, and the realism gap lab/research/2026-09-26-ledger-lookup-comparison.md
// found in the default synthetic mix (index/log ratio ~0.03 there vs ~0.24 for real fake-provider `class` runs).
// ---------------------------------------------------------------------------------------------------------------

const AREAS = ['auth', 'payments', 'search', 'ingest', 'ui', 'api', 'jobs', 'cache'] as const;
const TAGS = ['injection', 'guards', 'timeouts', 'retries', 'validation', 'permissions', 'pagination', 'idempotency'] as const;
const BROAD_AREA = AREAS[0];
const NARROW_PATH = `src/${BROAD_AREA}/file0.ts`;

interface GenResult {
  text: string;
  logBytes: number;
  ids: string[];
  keysPool: string[];
  who: Who;
  /** An id with no outcome line yet (safe for the appendOutcome bench: exercises the real "append", not "repeat"). */
  unblockedId: string;
}

function generateRealisticLedger(seed: string, n: number): GenResult {
  const rand = seededRandom(seed);
  const who: Who = { adapter: 'typesafe', model: 'jev-1.13.0' };
  const lines: string[] = [];
  const ids: string[] = [];
  const keySet = new Set<string>();
  let t = Date.parse('2026-09-01T00:00:00Z');
  const step = (): number => {
    t += 15_000 + Math.floor(rand() * 45_000);
    return t;
  };
  const iso = (ms: number): string => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');

  for (let i = 0; i < n; i++) {
    const id = formatRunId(i + 1);
    ids.push(id);
    const area = AREAS[i % AREAS.length]!;
    const tag = TAGS[Math.floor(rand() * TAGS.length)]!;
    const qCount = 10 + Math.floor(rand() * 11); // 10-20
    const answers: Record<string, Answer> = {};
    const keys: Record<string, string> = {};
    const bucket = Math.floor(i / 3) % 400; // bounds the distinct-key pool so keys recur, like a real project's
    for (let q = 1; q <= qCount; q++) {
      const qid = String(q);
      const key = `k-${area}-${tag}-${qid}-${bucket}`;
      keys[qid] = key;
      keySet.add(key);
      answers[qid] = { kind: 'yesno', p: Math.round(rand() * 100) / 100 };
    }
    const gate = rand() < 0.34 ? 'pass' : rand() < 0.5 ? 'fail' : 'unsure';
    const record = {
      kind: 'run',
      v: 2,
      id,
      uid: `${id}-u`,
      ts: iso(step()),
      verb: 'class',
      actor: 'bench-agent',
      task: null,
      goal: `${tag} in ${area} is safe`,
      depth: 'quick',
      where: [`src/${area}/file${i % 20}.ts`],
      parent: null,
      from: null,
      compare: null,
      wise: { area, why: 'defect' },
      ask: { categories: [], layers: [] },
      over: null,
      items: null,
      answers,
      keys,
      reusedFrom: {},
      categories: { [tag]: gate },
      gate,
      goalGate: gate,
      goalP: 0.8,
      consensus: 'STRONG',
      response: `side:\n  id: ${id}\n  gate: ${gate}\n`,
      notes: [],
      adapter: who.adapter,
      model: who.model,
      costUsd: 0.01,
      calls: 1,
    };
    lines.push(JSON.stringify(record));
    if (i > 0 && i % 37 === 0) {
      const outcome = rand() < 0.15 ? 'overruled' : 'held';
      lines.push(JSON.stringify({ kind: 'outcome', id: `${id}-outcome`, uid: `${id}-o`, ts: iso(step()), of: id, outcome, by: 'owner' }));
    }
  }
  const text = lines.length ? `${lines.join('\n')}\n` : '';
  return { text, logBytes: Buffer.byteLength(text, 'utf8'), ids, keysPool: [...keySet], who, unblockedId: ids[1]! };
}

// ---------------------------------------------------------------------------------------------------------------
// Timing helpers.
// ---------------------------------------------------------------------------------------------------------------

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

function toRow(op: string, durations: readonly number[]): BenchRow {
  const sorted = [...durations].sort((a, b) => a - b);
  return { op, samples: sorted.length, p50Ms: percentile(sorted, 0.5), p95Ms: percentile(sorted, 0.95) };
}

/** A plain fs.copyFileSync, then an explicit fsync of the COPY before the caller starts timing anything —
 *  otherwise a later small write's own fsync can queue behind this copy's still-unflushed bytes on the same
 *  ext4 filesystem (data=ordered), inflating an unrelated timed sample. See the spike's Surprises §2. */
function copyFileSyncFlushed(src: string, dest: string): void {
  copyFileSync(src, dest);
  const fd = openSync(dest, 'r+');
  try {
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Bench.
// ---------------------------------------------------------------------------------------------------------------

const REBUILD_SAMPLES = 5;
const CATCHUP_SAMPLES = 8;
const POINT_SAMPLES = 30;
const VIEW_SAMPLES = 8;

function rmDbFiles(dbPath: string): void {
  for (const f of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) if (existsSync(f)) rmSync(f, { force: true });
}

function benchRebuild(paths: SidewisePaths, n: number): BenchRow {
  const samples = n >= 100_000 ? Math.max(3, Math.floor(REBUILD_SAMPLES / 2)) : REBUILD_SAMPLES;
  return toRow(
    'rebuild',
    timeCalls(samples, () => {
      rmDbFiles(paths.index);
      nextRunNumber(paths);
    }),
  );
}

/** Copies the already-warm (fully caught-up) log+index into a fresh temp dir, appends `extraLines` more
 *  realistic lines to the COPY's log only, fsyncs the copy, then times one fresh withIndex call catching it up.
 *  A new copy per sample — "fresh open" (design binding #2: every real Sidewise process opens its own
 *  connection; there's no warm-WAL state to reuse between commands, see the spike's Surprise §1). */
function benchCatchUp(fixture: { logPath: string; dbPath: string; extraText: string }, extraLines: number, samples: number): BenchRow {
  const durations = timeCalls(samples, () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'sidewise-bench-catchup-'));
    try {
      const paths = pathsFor(dir);
      mkdirSync(paths.dir, { recursive: true });
      copyFileSyncFlushed(fixture.logPath, paths.log);
      if (existsSync(fixture.dbPath)) copyFileSyncFlushed(fixture.dbPath, paths.index);
      writeFileSync(paths.log, fixture.extraText, { flag: 'a' });
      const fd = openSync(paths.log, 'r+');
      try {
        fsyncSync(fd);
      } finally {
        closeSync(fd);
      }
      const t0 = performance.now();
      nextRunNumber(paths);
      const ms = performance.now() - t0;
      rmSync(dir, { recursive: true, force: true });
      return ms;
    } catch (e) {
      rmSync(dir, { recursive: true, force: true });
      throw e;
    }
  });
  return toRow(`catchup${extraLines}`, durations);
}

/** The Wise dynamic-field query (design binding: runs.wise is a small JSON blob so json_extract can group/filter
 *  on it) — opened directly against the already-built index.db, since IndexHandle's public surface only exposes
 *  the bounded queries every verb actually needs. Only meaningful with real node:sqlite; undefined otherwise. */
async function benchWiseQuery(dbPath: string): Promise<WiseRow | undefined> {
  if (!existsSync(dbPath)) return undefined; // the fallback never persists a db file to open here
  let DatabaseSync: new (location: string) => { exec(sql: string): void; prepare(sql: string): { all(...p: unknown[]): unknown[] }; close(): void };
  try {
    const mod = (await import('node:sqlite')) as unknown as { DatabaseSync: typeof DatabaseSync };
    DatabaseSync = mod.DatabaseSync;
  } catch {
    return undefined;
  }
  const db = new DatabaseSync(dbPath);
  try {
    const query = `SELECT json_extract(wise, '$.wise.area') AS area, COUNT(*) AS n FROM runs GROUP BY area`;
    const withoutIndexMs = timeCalls(1, () => void db.prepare(query).all())[0]!;
    db.exec(`CREATE INDEX idx_wise_area ON runs(json_extract(wise, '$.wise.area'))`);
    const withIndexMs = timeCalls(1, () => void db.prepare(query).all())[0]!;
    return { withoutIndexMs, withIndexMs };
  } finally {
    db.close();
  }
}

/** One real end-to-end paid `class` call through the fake provider (offline, free, deterministic): preflight's
 *  checkLedger, lookupAnswers' reuse check, and record's append, all against the already-large ledger — a
 *  distinct goal/evidence file each time so it can never be answered from reuse (calls must be 1, not 0). */
async function benchClassCall(paths: SidewisePaths, n: number): Promise<ClassRow> {
  writeFileSync(path.join(paths.root, 'bench-evidence.ts'), 'export const benchmarked = true;\n');
  // depth: quick needs exactly 10 yes/no questions for one subject (global-constraints.md) — fewer than that is
  // a validation stop (exit 2, calls never happen), which is exactly bug (a) this revision has to fix: the old
  // bench's `class` row timed a stop it never paid for.
  const classText = [
    'side:',
    `  goal: bench paid call reaches the ledger end to end at ${n}`,
    '  depth: quick',
    '  where: [bench-evidence.ts]',
    '  ask:',
    '    reach:',
    '      pass: yes',
    '      1: Does this file export a constant?',
    '      2: Is the constant named benchmarked?',
    '      3: Is the value a boolean?',
    '      4: Is the value literally true?',
    '      5: Does the file use export const?',
    '      6: Is there only one export in the file?',
    '      7: Is the file valid TypeScript?',
    '      8: Does the file end with a newline?',
    '      9: Is the file free of side effects?',
    '      10: Does the file avoid any imports?',
    '',
  ].join('\n');
  const before = existsSync(paths.log) ? statSync(paths.log).size : 0;
  const t0 = performance.now();
  const result = await runClass(classText, { paths, provider: createFakeAdapter(), env: {} });
  const ms = performance.now() - t0;
  const after = statSync(paths.log).size;
  const calls = result.run && isContractRun(result.run) ? result.run.calls : -1;
  return { exit: result.exit, calls, logGrewBytes: after - before, ms };
}

async function benchOne(paths: SidewisePaths, n: number, gen: GenResult): Promise<{ rows: BenchRow[]; wise: WiseRow | undefined; classCall: ClassRow }> {
  const rows: BenchRow[] = [];
  rows.push(benchRebuild(paths, n));
  nextRunNumber(paths); // one more warm build: index.db now fully reflects the log, for everything below

  const fixture = { logPath: paths.log, dbPath: paths.index, extraText: `${gen.text.split('\n').slice(0, 1).join('\n')}\n` };
  // extraText for "1 new line": one more realistic line, reusing the generator's own shape by slicing off the
  // ledger's own first line (a real v2 ContractRun) — cheap and shape-correct, not a special-cased stub record.
  rows.push(benchCatchUp(fixture, 1, CATCHUP_SAMPLES));
  const fifty = { ...fixture, extraText: `${gen.text.split('\n').slice(0, 50).join('\n')}\n` };
  rows.push(benchCatchUp(fifty, 50, CATCHUP_SAMPLES));

  rows.push(toRow('reuseHit', timeCalls(POINT_SAMPLES, () => lookupAnswers(paths, gen.who, [gen.keysPool[0]!]))));
  rows.push(toRow('reuseMiss', timeCalls(POINT_SAMPLES, () => lookupAnswers(paths, gen.who, ['k-never-asked-xyz']))));
  rows.push(toRow('exactReuseMiss', timeCalls(POINT_SAMPLES, () => exactReuse(paths, gen.who, ['k-never-asked-xyz']))));
  rows.push(toRow('findRunById', timeCalls(POINT_SAMPLES, () => findRun(paths, gen.ids[Math.floor(gen.ids.length / 2)]!))));

  rows.push(toRow('appendOutcome', timeCalls(1, () => void appendOutcome(paths, gen.unblockedId, 'held', 'bench'))));

  rows.push(toRow('placeBroad', timeCalls(VIEW_SAMPLES, () => runView(`src/${BROAD_AREA}`, 1, { paths, env: {} }))));
  rows.push(toRow('placeNarrow', timeCalls(VIEW_SAMPLES, () => runView(NARROW_PATH, 1, { paths, env: {} }))));

  const wise = await benchWiseQuery(paths.index);
  const classCall = await benchClassCall(paths, n);

  return { rows, wise, classCall };
}

async function benchSize(n: number, seed: string): Promise<BenchResult> {
  const root = mkdtempSync(path.join(os.tmpdir(), 'sidewise-bench-ledger-'));
  try {
    const paths = pathsFor(root);
    const gen = generateRealisticLedger(`${seed}-${n}`, n);
    mkdirSync(paths.dir, { recursive: true });
    writeFileSync(paths.log, gen.text);

    const { rows, wise, classCall } = await benchOne(paths, n, gen);

    const dbBytes = existsSync(paths.index) ? statSync(paths.index).size : 0;
    const dbLogRatio = existsSync(paths.index) ? dbBytes / gen.logBytes : undefined;
    return { n, logBytes: gen.logBytes, dbBytes, dbLogRatio, rows, wise, classCall };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

export async function runLedgerBench(sizes: readonly number[], opts: { seed?: string } = {}): Promise<BenchResult[]> {
  const seed = opts.seed ?? 'bench-ledger';
  const results: BenchResult[] = [];
  for (const n of sizes) results.push(await benchSize(n, seed));
  return results;
}

const OP_ORDER = ['rebuild', 'catchup1', 'catchup50', 'reuseHit', 'reuseMiss', 'exactReuseMiss', 'findRunById', 'appendOutcome', 'placeBroad', 'placeNarrow'];

export function renderBenchTable(results: readonly BenchResult[]): string {
  const lines: string[] = [];
  lines.push('| n | log bytes | db bytes | db/log ratio |', '|---|---|---|---|');
  for (const r of results) lines.push(`| ${r.n} | ${r.logBytes} | ${r.dbBytes} | ${r.dbLogRatio === undefined ? 'n/a (no node:sqlite)' : r.dbLogRatio.toFixed(4)} |`);
  lines.push('');
  for (const op of OP_ORDER) {
    const perSize = results.map((r) => ({ result: r, row: r.rows.find((x) => x.op === op) })).filter((x): x is { result: BenchResult; row: BenchRow } => x.row !== undefined);
    if (!perSize.length) continue;
    lines.push(`### ${op}`, '', '| n | samples | p50 ms | p95 ms |', '|---|---|---|---|');
    for (const { result, row } of perSize) lines.push(`| ${result.n} | ${row.samples} | ${row.p50Ms.toFixed(3)} | ${row.p95Ms.toFixed(3)} |`);
    lines.push('');
  }
  lines.push('### wise json_extract query (group by $.wise.area)', '', '| n | without index ms | with expression index ms |', '|---|---|---|');
  for (const r of results) lines.push(`| ${r.n} | ${r.wise ? r.wise.withoutIndexMs.toFixed(3) : 'n/a'} | ${r.wise ? r.wise.withIndexMs.toFixed(3) : 'n/a'} |`);
  lines.push('');
  lines.push('### class (real end-to-end paid call, fake provider)', '', '| n | exit | calls | log grew (bytes) | ms |', '|---|---|---|---|---|');
  for (const r of results) lines.push(`| ${r.n} | ${r.classCall.exit} | ${r.classCall.calls} | ${r.classCall.logGrewBytes} | ${r.classCall.ms.toFixed(3)} |`);
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

  console.log(`bench-ledger: sizes=${sizes.join(',')} seed=${values.seed} node=${process.version}`);
  const results = await runLedgerBench(sizes, { seed: String(values.seed) });
  const table = renderBenchTable(results);
  console.log(table);

  if (values.out) {
    writeFileSync(String(values.out), `${JSON.stringify(results, null, 2)}\n`);
    console.log(`wrote ${values.out}`);
  }
  if (values.md) {
    const preamble = '<!-- generated by `scripts/bench-ledger.ts`; do not edit by hand -->\n\n# Ledger scale bench\n\n';
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
