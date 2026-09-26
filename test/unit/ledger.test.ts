import { spawn } from 'node:child_process';
import { appendFileSync, mkdirSync, readFileSync, utimesSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { formatRunId, ulid } from '../../src/ledger/ids.ts';
import { withLock } from '../../src/ledger/lock.ts';
import { appendOutcome, appendRun, isRun, latestOutcome, readLedger } from '../../src/ledger/log.ts';
import { findRoot } from '../../src/ledger/paths.ts';
import { redact, redactDeep } from '../../src/ledger/redact.ts';
import { tempProject } from '../helpers/project.ts';
import { sampleRun } from '../helpers/runs.ts';

const WORKER = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'append-worker.ts');
// Secret-shaped strings are built at runtime so the repo's pre-commit leak check never sees a literal one.
const GH_TOKEN = 'gh' + 'p_' + 'a'.repeat(30);
const AWS_KEY = 'AKIA' + 'B'.repeat(16);

describe('ids', () => {
  it('ulid: 26 Crockford chars, time-sortable, deterministic with fixed inputs', () => {
    expect(ulid(0, () => new Uint8Array(16))).toBe('0'.repeat(26));
    expect(ulid(1000).slice(0, 10) < ulid(2000).slice(0, 10)).toBe(true);
    expect(ulid()).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
  });

  it('formatRunId pads to 4 digits and grows past 9999', () => {
    expect(formatRunId(7)).toBe('SW-0007');
    expect(formatRunId(12345)).toBe('SW-12345');
  });
});

describe('redact', () => {
  it('hides tokens, keys, emails and key=value secrets', () => {
    expect(redact(`token ${GH_TOKEN} and ${AWS_KEY}`)).toBe('token [redacted] and [redacted]');
    expect(redact('mail dev@example.com now')).toBe('mail [redacted] now');
    expect(redact('api_key = "abcdef123456"')).toBe('api_key = [redacted]');
  });

  it('redactDeep walks objects and arrays and leaves non-strings alone', () => {
    expect(redactDeep({ a: [`x ${GH_TOKEN}`], n: 3, b: { c: 'dev@example.com' } })).toEqual({ a: ['x [redacted]'], n: 3, b: { c: '[redacted]' } });
  });
});

describe('paths', () => {
  it('finds the nearest folder holding .sidewise or .git', () => {
    const { root } = tempProject({ 'a/b/c.ts': 'x' });
    mkdirSync(path.join(root, '.git'));
    expect(findRoot(path.join(root, 'a', 'b'))).toBe(root);
  });
});

describe('lock', () => {
  it('times out on a held lock and says what to do', () => {
    const { paths } = tempProject({});
    mkdirSync(paths.dir, { recursive: true });
    writeFileSync(paths.lock, '');
    expect(() => withLock(paths.lock, () => 1, { timeoutMs: 100, staleMs: 60_000 })).toThrow(/is locked → wait for the other run/);
  });

  it('clears a stale lock', () => {
    const { paths } = tempProject({});
    mkdirSync(paths.dir, { recursive: true });
    writeFileSync(paths.lock, '');
    const old = new Date(Date.now() - 120_000);
    utimesSync(paths.lock, old, old);
    expect(withLock(paths.lock, () => 42, { timeoutMs: 100, staleMs: 30_000 })).toBe(42);
  });
});

describe('log', () => {
  it('appends runs with sequential ids, a ulid and a timestamp, and reads them back', () => {
    const { paths } = tempProject({});
    const a = appendRun(paths, sampleRun(), Date.parse('2026-09-25T12:00:00Z'));
    const b = appendRun(paths, sampleRun({ parent: a.id }));
    expect(a).toMatchObject({ kind: 'run', id: 'SW-0001', ts: '2026-09-25T12:00:00Z' });
    expect(a.uid).toHaveLength(26);
    expect(b).toMatchObject({ id: 'SW-0002', parent: 'SW-0001' });
    expect(readLedger(paths).filter(isRun).map((r) => r.id)).toEqual(['SW-0001', 'SW-0002']);
  });

  it('redacts secrets before writing', () => {
    const { paths } = tempProject({});
    appendRun(paths, sampleRun({ problem: `leaked ${GH_TOKEN}` }));
    expect(readFileSync(paths.log, 'utf8')).not.toContain(GH_TOKEN);
    expect(readLedger(paths).filter(isRun)[0]!.problem).toBe('leaked [redacted]');
  });

  it('starts a fresh line after a half-written line, and reports the bad line number on read', () => {
    const { paths } = tempProject({});
    appendRun(paths, sampleRun());
    appendFileSync(paths.log, '{"kind":"run","id":"SW-00');
    expect(() => readLedger(paths)).toThrow(/line 2 of \.sidewise\/log\.jsonl is not valid JSON → fix or remove that line/);
  });

  it('records outcomes; the asker cannot mark its own run held', () => {
    const { paths } = tempProject({});
    appendRun(paths, sampleRun({ actor: 'reviewer' }));
    expect(() => appendOutcome(paths, 'SW-0001', 'held', 'reviewer')).toThrow(/reviewer asked SW-0001, so it can't mark it held/);
    expect(() => appendOutcome(paths, 'SW-0009', 'held', 'owner')).toThrow(/SW-0009 is not in the ledger/);
    appendOutcome(paths, 'SW-0001', 'overruled', 'reviewer');
    appendOutcome(paths, 'SW-0001', 'held', 'owner');
    expect(latestOutcome(readLedger(paths), 'SW-0001')).toBe('held');
  });

  it('gives unique sequential ids when 4 processes append at once', async () => {
    const { root, paths } = tempProject({});
    const runWorker = () =>
      new Promise<number>((resolve) => {
        spawn(process.execPath, ['--import', 'tsx', WORKER, root, '10'], { stdio: 'ignore' }).on('exit', (code) => resolve(code ?? 1));
      });
    expect(await Promise.all([runWorker(), runWorker(), runWorker(), runWorker()])).toEqual([0, 0, 0, 0]);
    const ids = readLedger(paths).filter(isRun).map((r) => r.id);
    expect(ids).toHaveLength(40);
    expect(new Set(ids).size).toBe(40);
    expect(ids).toEqual(Array.from({ length: 40 }, (_, i) => formatRunId(i + 1)));
  }, 30_000);
});
