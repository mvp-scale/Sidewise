// The ledger index: nextRunNumber/findRun match a linear scan, catch up incrementally, never trust a stale
// or corrupt index.json (it's disposable), and never hide ledger corruption (fail closed, same wording as readLedger).
import { appendFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { generateLedgerRecords, toJsonl, writeSyntheticLedger } from '../gen/synthetic-ledger.ts';
import { findRun, isContractRun, isRun, nextRunNumber, readLedger } from '../../src/ledger/log.ts';
import { loadIndex } from '../../src/ledger/index.ts';
import { tempProject } from '../helpers/project.ts';

describe('the index matches a linear scan', () => {
  it('nextRunNumber and findRun agree with readLedger, at a small size npm test can afford', () => {
    const { paths } = tempProject({});
    const { count } = writeSyntheticLedger(paths, { seed: 'idx-1', runs: 2000 });
    const linear = readLedger(paths);
    const runs = linear.filter((r) => r.kind === 'run');
    expect(nextRunNumber(paths)).toBe(runs.length + 1);
    expect(runs.length).toBeGreaterThanOrEqual(count); // outcomes/failed don't count as runs
    for (const id of [runs[0]!.id, runs[Math.floor(runs.length / 2)]!.id, runs.at(-1)!.id, 'SW-9999']) {
      expect(findRun(paths, id)).toEqual(linear.find((r) => r.kind === 'run' && r.id === id));
    }
  });

  it('catches up from an existing index after more records are appended, without rescanning what it already had', () => {
    const { paths } = tempProject({});
    writeSyntheticLedger(paths, { seed: 'idx-2', runs: 500 });
    const first = loadIndex(paths);
    expect(first.runCount).toBe(nextRunNumber(paths) - 1);
    const before = first.upto;
    appendFileSync(paths.log, toJsonl(generateLedgerRecords({ seed: 'idx-2-more', runs: 50, start: '2026-10-01T00:00:00Z' })));
    const second = loadIndex(paths);
    expect(second.upto).toBeGreaterThan(before);
    expect(second.runCount).toBe(readLedger(paths).filter((r) => r.kind === 'run').length);
  });

  it('an in-progress tail line (no trailing newline) is not counted yet, and is picked up once it is complete', () => {
    const { paths } = tempProject({});
    writeSyntheticLedger(paths, { seed: 'idx-3', runs: 5 });
    const before = nextRunNumber(paths);
    const partial = JSON.stringify({ kind: 'run', v: 2, id: 'SW-9999' }).slice(0, -1); // truncated, mid-write
    appendFileSync(paths.log, partial); // no trailing \n
    expect(nextRunNumber(paths)).toBe(before); // not counted: might still be writing
    appendFileSync(paths.log, '}\n'); // "finish" it as a line the shape checker will still reject (missing fields) — corruption, not a real run
    expect(() => nextRunNumber(paths)).toThrow(/is not a ledger record/);
  });

  it("a corrupt line fails closed with readLedger's exact wording, at the right line number across two catch-ups", () => {
    const { paths } = tempProject({});
    writeSyntheticLedger(paths, { seed: 'idx-4', runs: 3 });
    loadIndex(paths); // caches an index at upto = end of the first 3 (or more, with outcomes) lines
    const before = readLedger(paths).length;
    appendFileSync(paths.log, 'not json at all\n');
    expect(() => nextRunNumber(paths)).toThrow(`✖ ledger: line ${before + 1} of .sidewise/log.jsonl is not valid JSON → fix or remove that line`);
  });

  it('a missing or corrupt index.json triggers a silent rebuild, not a failure (the index is disposable)', () => {
    const { paths } = tempProject({});
    writeSyntheticLedger(paths, { seed: 'idx-5', runs: 300 });
    const want = nextRunNumber(paths); // builds and saves index.json
    writeFileSync(paths.index, '{ not: valid json');
    expect(nextRunNumber(paths)).toBe(want);
    // A folder where a file should be: still not fatal for the index. index.json is currently a regular file
    // (the rebuild above re-saved it), so it has to be removed before it can become a directory at the same path.
    rmSync(paths.index, { force: true });
    mkdirSync(paths.index, { recursive: true });
    expect(nextRunNumber(paths)).toBe(want);
  });

  it('a log shorter than the index (replaced or truncated) rebuilds instead of trusting stale offsets', () => {
    const { paths } = tempProject({});
    writeSyntheticLedger(paths, { seed: 'idx-6', runs: 400 });
    nextRunNumber(paths);
    writeSyntheticLedger(paths, { seed: 'idx-6b', runs: 10 }); // a much shorter, different ledger at the same path
    expect(nextRunNumber(paths)).toBe(readLedger(paths).filter((r) => r.kind === 'run').length + 1);
  });
});

describe('generateLedgerRecords', () => {
  it('is deterministic (same seed, same records) and produces ids readLedger accepts', () => {
    const a = generateLedgerRecords({ seed: 'gen-1', runs: 200 });
    const b = generateLedgerRecords({ seed: 'gen-1', runs: 200 });
    expect(a).toEqual(b);
    const { paths } = tempProject({});
    writeSyntheticLedger(paths, { seed: 'gen-1', runs: 200 });
    expect(() => readLedger(paths)).not.toThrow();
    const runs = readLedger(paths).filter(isRun);
    const contract = readLedger(paths).filter(isContractRun);
    expect(runs.length + contract.length).toBeGreaterThan(0);
    expect(new Set([...runs, ...contract].map((r) => r.id)).size).toBe(runs.length + contract.length); // ids unique, no gaps checked by nextRunNumber tests above
  });
});
