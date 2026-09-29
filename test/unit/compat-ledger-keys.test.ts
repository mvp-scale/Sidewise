// Compat: a ledger written before the MM3 rename (records keyed `wise`, run ids `SW-####`) must still load,
// index, and answer `view`/`template --from`/`outcome`. This file is the one place old-key fixtures live on purpose.
import { readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { appendContractRun, appendOutcome, findRun, readLedger } from '../../src/ledger/log.ts';
import { runTemplate } from '../../src/verbs/template.ts';
import { runView } from '../../src/verbs/view.ts';
import { hasNodeSqlite } from '../helpers/cli.ts';
import { tempProject } from '../helpers/project.ts';
import { sampleContractRun } from '../helpers/runs.ts';

const NOW = Date.parse('2026-09-20T12:00:00Z');

/** Writes one contract run, then rewrites the log the way the pre-rename build wrote it: `wise` key, `SW-` ids. */
function oldBuildLedger() {
  const { paths } = tempProject({});
  appendContractRun(paths, sampleContractRun(), NOW, 'budget 1%');
  const old = readFileSync(paths.log, 'utf8').replace(/"mdl":/g, '"wise":').replace(/MM3-0001/g, 'SW-0001');
  expect(old).toContain('"wise":{"why":"validate","area":"api"}');
  writeFileSync(paths.log, old);
  return paths;
}

describe('compat: records written before the MM3 rename', () => {
  it('a record keyed wise loads as mdl, with no wise key left', () => {
    const paths = oldBuildLedger();
    const [rec] = readLedger(paths) as unknown as Array<Record<string, unknown>>;
    expect(rec!.id).toBe('SW-0001');
    expect(rec!.mdl).toEqual({ why: 'validate', area: 'api' });
    expect('wise' in rec!).toBe(false);
  });

  it('a record keyed side loads as mak', () => {
    const { paths } = tempProject({});
    appendContractRun(paths, sampleContractRun(), NOW, 'budget 1%');
    const raw = JSON.parse(readFileSync(paths.log, 'utf8').trim()) as Record<string, unknown>;
    raw.side = { goal: 'x' };
    writeFileSync(paths.log, `${JSON.stringify(raw)}\n`);
    const [rec] = readLedger(paths) as unknown as Array<Record<string, unknown>>;
    expect(rec!.mak).toEqual({ goal: 'x' });
    expect('side' in rec!).toBe(false);
  });

  it('the old wise.nodes chain still becomes a 1-item mdl.uses', () => {
    const { paths } = tempProject({});
    appendContractRun(paths, sampleContractRun(), NOW, 'budget 1%');
    const raw = JSON.parse(readFileSync(paths.log, 'utf8').trim()) as Record<string, unknown>;
    delete raw.mdl;
    raw.wise = { why: 'validate', nodes: 'code:a' };
    writeFileSync(paths.log, `${JSON.stringify(raw)}\n`);
    const [rec] = readLedger(paths) as unknown as Array<{ mdl: { uses?: string[]; nodes?: string } }>;
    expect(rec!.mdl.uses).toEqual(['code:a']);
    expect(rec!.mdl.nodes).toBeUndefined();
  });

  it.skipIf(!hasNodeSqlite)('an index built by the old build (schema 6, runs.wise column) is rebuilt, not a crash', async () => {
    const paths = oldBuildLedger();
    appendOutcome(paths, 'SW-0001', 'held', 'owner'); // builds the current index
    const { DatabaseSync } = (await import('node:sqlite')) as typeof import('node:sqlite');
    const db = new DatabaseSync(paths.index);
    db.exec('ALTER TABLE runs RENAME COLUMN mdl TO wise');
    db.exec("UPDATE meta SET value = '6' WHERE key = 'schema_version'");
    db.close();
    appendOutcome(paths, 'SW-0001', 'overruled', 'owner'); // a writer opens the stale index: it must rebuild
    expect(findRun(paths, 'SW-0001')?.id).toBe('SW-0001');
    const check = new DatabaseSync(paths.index);
    const cols = (check.prepare('PRAGMA table_info(runs)').all() as Array<{ name: string }>).map((c) => c.name);
    const blob = (check.prepare('SELECT mdl FROM runs WHERE id = ?').get('SW-0001') as { mdl: string }).mdl;
    check.close();
    expect(cols).toContain('mdl');
    expect(cols).not.toContain('wise');
    expect(JSON.parse(blob)).toMatchObject({ mdl: { area: 'api' } });
  });

  it('view, template --from and outcome all resolve a stored SW- id', () => {
    const paths = oldBuildLedger();
    expect(runView('SW-0001', 1, { paths, env: {} }).text).toContain('SW-0001');
    const t = runTemplate('class', { from: 'SW-0001' }, paths);
    expect(t.exit).toBe(0);
    expect(t.text).toContain('mak:');
    const o = appendOutcome(paths, 'SW-0001', 'held', 'owner');
    expect(o.record.of).toBe('SW-0001');
  });
});
