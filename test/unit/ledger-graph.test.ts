// The graph tier (ledger/graph.ts, plan 2c C3): a second, independent set of tables in the same index.db,
// refreshed only by `refreshGraph`, never on the paid path. These tests build small hand-crafted ledgers
// (appendContractRun/appendOutcome, same helpers replay.test.ts/view.test.ts use) and inspect the resulting
// nodes/triples directly via a raw node:sqlite connection (getSqliteCtor, exported from ledger/index.ts for
// exactly this purpose).
import { mkdirSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getSqliteCtor } from '../../src/ledger/index.ts';
import { appendContractRun, appendOutcome } from '../../src/ledger/log.ts';
import { refreshGraph } from '../../src/ledger/graph.ts';
import type { Mm3Paths } from '../../src/ledger/paths.ts';
import type { Category } from '../../src/contract/types.ts';
import { tempProject } from '../helpers/project.ts';
import { sampleContractRun } from '../helpers/runs.ts';

interface TestStatement {
  run(...params: unknown[]): unknown;
  get(...params: unknown[]): Record<string, unknown> | undefined;
  all(...params: unknown[]): Record<string, unknown>[];
}
interface TestDb {
  exec(sql: string): void;
  prepare(sql: string): TestStatement;
  close(): void;
}

function openDb(paths: Mm3Paths): TestDb {
  const Ctor = getSqliteCtor() as unknown as new (location: string) => TestDb;
  return new Ctor(paths.index);
}

function metaValue(db: TestDb, key: string): string | undefined {
  const row = db.prepare('SELECT value FROM meta WHERE key = ?').get(key);
  return row ? String(row.value) : undefined;
}

function nodeIdOf(db: TestDb, kind: string, label: string): number | undefined {
  const row = db.prepare('SELECT id FROM nodes WHERE kind = ? AND label = ?').get(kind, label);
  return row ? Number(row.id) : undefined;
}

function allTriples(db: TestDb): Record<string, unknown>[] {
  return db.prepare('SELECT p, s, o, run, provenance, score FROM triples').all();
}

/** True when a (p, kindS:labelS, kindO:labelO[, run]) triple exists, resolving both node ids by kind+label. */
function hasTriple(db: TestDb, p: string, s: [string, string], o: [string, string], run?: string): boolean {
  const sId = nodeIdOf(db, ...s);
  const oId = nodeIdOf(db, ...o);
  if (sId === undefined || oId === undefined) return false;
  const rows = allTriples(db).filter((r) => r.p === p && r.s === sId && r.o === oId);
  return run === undefined ? rows.length > 0 : rows.some((r) => r.run === run);
}

const T = Date.now();

const INJECTION: Category = { name: 'injection', section: 'concerns', family: 'input', pass: 'no', need: 'all', tags: [], questions: [{ n: 1, kind: 'yesno', text: 'q1?' }] };
const OTHER_CHECK: Category = { name: 'other-check', section: 'concerns', pass: 'no', need: 'all', tags: [], questions: [{ n: 1, kind: 'yesno', text: 'q2?' }] };

describe('ledger/graph: one-subject run (rules 1-6, 10-14)', () => {
  it('mints about/checks/is-a/judged/at/uses/contains/reaches/touches from one class run', () => {
    const { paths } = tempProject();
    appendContractRun(
      paths,
      sampleContractRun({
        where: ['src/a.ts:12-20'],
        ask: { categories: [INJECTION, OTHER_CHECK], layers: [] },
        mdl: { why: 'validate', area: 'api', uses: ['component:web-app/orders-handler -> code:handler.ts'], blast: 'component', touches: ['Order'] },
        categories: { injection: 'fail', 'other-check': 'pass' },
        gate: 'fail',
      }),
      T,
      'b',
    ); // MM3-0001

    refreshGraph(paths, {});
    const db = openDb(paths);
    try {
      // 1. about
      expect(hasTriple(db, 'about', ['run', 'MM3-0001'], ['area', 'api'])).toBe(true);
      // 2/3. checks / is-a — run --checks--> category (the run checked this category)
      expect(hasTriple(db, 'checks', ['run', 'MM3-0001'], ['category', 'injection'])).toBe(true);
      expect(hasTriple(db, 'checks', ['run', 'MM3-0001'], ['category', 'other-check'])).toBe(true);
      expect(hasTriple(db, 'is-a', ['category', 'injection'], ['family', 'input'])).toBe(true);
      // 4/5/6. judged/at — category's own verdict on a place (judged), and the where entry is
      // stripLines-normalized (":12-20" dropped)
      expect(nodeIdOf(db, 'place', 'src/a.ts')).toBeDefined();
      expect(nodeIdOf(db, 'place', 'src/a.ts:12-20')).toBeUndefined();
      expect(allTriples(db).some((r) => r.p === 'judged' && r.s === nodeIdOf(db, 'category', 'injection') && r.o === nodeIdOf(db, 'place', 'src/a.ts') && r.score === 0)).toBe(true);
      expect(allTriples(db).some((r) => r.p === 'judged' && r.s === nodeIdOf(db, 'category', 'other-check') && r.o === nodeIdOf(db, 'place', 'src/a.ts') && r.score === 1)).toBe(true);
      expect(hasTriple(db, 'at', ['run', 'MM3-0001'], ['place', 'src/a.ts'])).toBe(true);
      // 12. uses (adjacent chain parts)
      expect(hasTriple(db, 'uses', ['component', 'web-app/orders-handler'], ['code', 'handler.ts'])).toBe(true);
      // 13. contains (from '/' segments of the component part)
      expect(hasTriple(db, 'contains', ['container', 'web-app'], ['component', 'web-app/orders-handler'])).toBe(true);
      // 14. contains (inferred: place x component/code, same run)
      expect(hasTriple(db, 'contains', ['place', 'src/a.ts'], ['component', 'web-app/orders-handler'], 'MM3-0001')).toBe(true);
      expect(allTriples(db).some((r) => r.p === 'contains' && r.o === nodeIdOf(db, 'code', 'handler.ts') && r.provenance === 'inferred')).toBe(true);
      // 10/11. reaches / touches
      expect(hasTriple(db, 'reaches', ['run', 'MM3-0001'], ['level', 'component'])).toBe(true);
      expect(hasTriple(db, 'touches', ['run', 'MM3-0001'], ['entity', 'order'])).toBe(true);
      // 15. solves is never stored
      expect(allTriples(db).some((r) => r.p === 'solves')).toBe(false);
    } finally {
      db.close();
    }
  });
});

describe('ledger/graph: lineage (rule 8)', () => {
  it('drill -> narrows, replay -> replays, against the same parent', () => {
    const { paths } = tempProject();
    appendContractRun(paths, sampleContractRun({ where: ['src/p.ts'] }), T, 'b'); // MM3-0001
    appendContractRun(paths, sampleContractRun({ verb: 'drill', parent: 'MM3-0001', where: ['src/p.ts'] }), T, 'b'); // MM3-0002
    appendContractRun(paths, sampleContractRun({ verb: 'replay', parent: 'MM3-0001', where: ['src/p.ts'] }), T, 'b'); // MM3-0003

    refreshGraph(paths, {});
    const db = openDb(paths);
    try {
      expect(hasTriple(db, 'narrows', ['run', 'MM3-0002'], ['run', 'MM3-0001'])).toBe(true);
      expect(hasTriple(db, 'replays', ['run', 'MM3-0003'], ['run', 'MM3-0001'])).toBe(true);
      expect(hasTriple(db, 'builds-on', ['run', 'MM3-0002'], ['run', 'MM3-0001'])).toBe(false);
    } finally {
      db.close();
    }
  });
});

describe('ledger/graph: outcomes (rule 9)', () => {
  it('an outcome record becomes a resolved-as triple', () => {
    const { paths } = tempProject();
    appendContractRun(paths, sampleContractRun(), T, 'b'); // MM3-0001
    appendOutcome(paths, 'MM3-0001', 'held', 'owner');

    refreshGraph(paths, {});
    const db = openDb(paths);
    try {
      expect(hasTriple(db, 'resolved-as', ['run', 'MM3-0001'], ['outcome', 'held'], 'MM3-0001')).toBe(true);
    } finally {
      db.close();
    }
  });
});

describe('ledger/graph: custom mdl keys (rule 16)', () => {
  it('an unconfigured custom key stays property-only; a configured one (with `as`) becomes a triple', () => {
    const { paths } = tempProject();
    appendContractRun(paths, sampleContractRun({ mdl: { why: 'validate', extras: { foo: 'bar' } } }), T, 'b'); // MM3-0001, no config

    refreshGraph(paths, {});
    let db = openDb(paths);
    try {
      expect(nodeIdOf(db, 'value', 'bar')).toBeUndefined();
      expect(allTriples(db).some((r) => r.p === 'foo')).toBe(false);
    } finally {
      db.close();
    }

    mkdirSync(paths.dir, { recursive: true });
    writeFileSync(paths.config, 'mdl:\n  foo:\n    as: handles\n');
    appendContractRun(paths, sampleContractRun({ mdl: { why: 'validate', extras: { foo: 'Widget' } } }), T, 'b'); // MM3-0002

    refreshGraph(paths, {});
    db = openDb(paths);
    try {
      expect(hasTriple(db, 'handles', ['run', 'MM3-0002'], ['value', 'widget'], 'MM3-0002')).toBe(true);
    } finally {
      db.close();
    }
  });
});

describe('ledger/graph: watermark behavior', () => {
  it('a second refreshGraph with no new lines is a no-op', () => {
    const { paths } = tempProject();
    appendContractRun(paths, sampleContractRun(), T, 'b'); // MM3-0001
    refreshGraph(paths, {});

    let db = openDb(paths);
    const uptoAfterFirst = metaValue(db, 'graph_upto');
    const countAfterFirst = allTriples(db).length;
    db.close();

    refreshGraph(paths, {});
    db = openDb(paths);
    try {
      expect(metaValue(db, 'graph_upto')).toBe(uptoAfterFirst);
      expect(allTriples(db).length).toBe(countAfterFirst);
    } finally {
      db.close();
    }
  });

  it('appending one more run and refreshing again ingests only the new one (incremental)', () => {
    const { paths } = tempProject();
    appendContractRun(paths, sampleContractRun({ where: ['src/a.ts'] }), T, 'b'); // MM3-0001
    refreshGraph(paths, {});

    let db = openDb(paths);
    expect(nodeIdOf(db, 'run', 'MM3-0001')).toBeDefined();
    expect(nodeIdOf(db, 'run', 'MM3-0002')).toBeUndefined();
    db.close();

    appendContractRun(paths, sampleContractRun({ where: ['src/b.ts'] }), T, 'b'); // MM3-0002
    refreshGraph(paths, {});

    db = openDb(paths);
    try {
      expect(nodeIdOf(db, 'run', 'MM3-0001')).toBeDefined();
      expect(nodeIdOf(db, 'run', 'MM3-0002')).toBeDefined();
      expect(hasTriple(db, 'at', ['run', 'MM3-0001'], ['place', 'src/a.ts'])).toBe(true);
      expect(hasTriple(db, 'at', ['run', 'MM3-0002'], ['place', 'src/b.ts'])).toBe(true);
    } finally {
      db.close();
    }
  });

  it('a schema-version mismatch wipes and rebuilds cleanly rather than erroring', () => {
    const { paths } = tempProject();
    appendContractRun(paths, sampleContractRun({ where: ['src/a.ts'] }), T, 'b'); // MM3-0001
    refreshGraph(paths, {});

    let db = openDb(paths);
    db.prepare("UPDATE meta SET value = '999' WHERE key = 'graph_schema_version'").run();
    db.close();

    refreshGraph(paths, {});
    db = openDb(paths);
    try {
      expect(metaValue(db, 'graph_schema_version')).toBe('2');
      expect(hasTriple(db, 'at', ['run', 'MM3-0001'], ['place', 'src/a.ts'])).toBe(true);
    } finally {
      db.close();
    }
  });
});
