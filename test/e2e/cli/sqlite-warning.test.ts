// node:sqlite's own ExperimentalWarning (Node 22/24) is suppressed end-to-end — not just isSqliteExperimentalWarning's
// pure-function check (test/unit/ledger-index.test.ts), but the real process.emitWarning path a live ledger touch
// takes — while every OTHER warning still prints untouched. Needs the built dist/ (test:cli builds first) and a
// real node:sqlite (Node >= 22.13); on this repo's Node 20 host the whole thing is skipped, never silently vacuous.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { hasNodeSqlite } from '../../helpers/cli.ts';

const DIST_PATHS = path.resolve('dist/ledger/paths.js');
const DIST_INDEX = path.resolve('dist/ledger/index.js');

/** A minimal, valid v2 ContractRun line — just enough shape for isRecord/applyLine to accept it, so withIndex's
 *  real self-heal build actually constructs a DatabaseSync (node:sqlite's warning fires at construction time,
 *  verified directly) rather than short-circuiting on an empty log. */
const RUN_LINE = JSON.stringify({
  kind: 'run',
  v: 2,
  id: 'MM3-0001',
  uid: 'MM3-0001-u',
  ts: '2026-09-01T00:00:00Z',
  verb: 'class',
  actor: 'agent',
  task: null,
  goal: 'g',
  depth: 'quick',
  where: ['a.ts'],
  parent: null,
  from: null,
  compare: null,
  mdl: null,
  ask: { categories: [], layers: [] },
  over: null,
  items: null,
  answers: {},
  keys: {},
  reusedFrom: {},
  categories: {},
  gate: 'pass',
  goalGate: 'pass',
  goalP: 0.9,
  consensus: 'STRONG',
  response: 'mak:\n  id: MM3-0001\n',
  notes: [],
  adapter: 'typesafe',
  model: 'jev-1.13.0',
  costUsd: 0.01,
  calls: 1,
});

describe.skipIf(!hasNodeSqlite)('the node:sqlite ExperimentalWarning is suppressed end-to-end; another warning is not', () => {
  it('a real self-heal build prints no SQLite warning, with a different warning still printing around it', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'mm3-warning-'));
    try {
      const mm3Dir = path.join(dir, '.mm3');
      mkdirSync(mm3Dir, { recursive: true });
      const script = [
        `const { writeFileSync } = require('node:fs');`,
        `const { pathToFileURL } = require('node:url');`,
        `writeFileSync(${JSON.stringify(path.join(mm3Dir, 'log.jsonl'))}, ${JSON.stringify(`${RUN_LINE}\n`)});`,
        `(async () => {`,
        `  const { pathsFor } = await import(pathToFileURL(${JSON.stringify(DIST_PATHS)}).href);`,
        `  const { withIndex } = await import(pathToFileURL(${JSON.stringify(DIST_INDEX)}).href);`,
        `  const paths = pathsFor(${JSON.stringify(dir)});`,
        `  process.emitWarning('marker-before-sqlite', 'DeprecationWarning');`,
        `  withIndex(paths, (h) => h.runCount());`, // constructs a real DatabaseSync — where node:sqlite's own warning fires
        `  process.emitWarning('marker-after-sqlite', 'DeprecationWarning');`,
        `})().catch((e) => { console.error('SCRIPT_FAILED', e); process.exitCode = 1; });`,
      ].join('\n');
      const r = spawnSync(process.execPath, ['-e', script], { encoding: 'utf8' });
      expect(r.stderr).not.toMatch(/SCRIPT_FAILED/);
      expect(r.status).toBe(0);
      // The two synthetic DeprecationWarnings (unrelated to SQLite) are untouched by the filter — it matches
      // ONLY an ExperimentalWarning naming SQLite (isSqliteExperimentalWarning), nothing else.
      expect(r.stderr).toMatch(/marker-before-sqlite/);
      expect(r.stderr).toMatch(/marker-after-sqlite/);
      // The real node:sqlite ExperimentalWarning itself never reaches stderr.
      expect(r.stderr).not.toMatch(/ExperimentalWarning/);
      expect(r.stderr.toLowerCase()).not.toMatch(/sqlite is an experimental/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
