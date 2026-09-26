import { spawn } from 'node:child_process';
import { appendFileSync, mkdirSync, readFileSync, utimesSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { formatRunId, ulid } from '../../src/ledger/ids.ts';
import { LockError, withLock } from '../../src/ledger/lock.ts';
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

  it('hides env-style, JSON and Bearer secrets whose key only contains the keyword', () => {
    const v = 'Zq' + '9x'.repeat(8); // 18 chars, no known token prefix
    for (const key of ['TYPESAFE_API_KEY', 'AI_GATEWAY_API_KEY', 'GITHUB_TOKEN', 'DB_PASSWORD', 'STRIPE_SECRET_KEY']) {
      expect(redact(`${key}=${v}`)).toBe(`${key}=[redacted]`);
      expect(redact(`export ${key}="${v}"`)).toBe(`export ${key}=[redacted]`);
    }
    expect(redact(`{"apiKey": "${v}"}`)).toBe('{"apiKey": [redacted]}');
    expect(redact(`{ "client_secret" : "${v}" }`)).toBe('{ "client_secret" : [redacted] }');
    expect(redact(`Authorization: Bearer ${v}`)).toBe('Authorization: Bearer [redacted]');
    expect(redact(`headers.set('authorization', 'bearer ${v}')`)).toBe(`headers.set('authorization', 'bearer [redacted]')`);
  });

  it('leaves ordinary code words alone (accepted tradeoff: a long value after a secret-ish name is redacted)', () => {
    expect(redact('const parts = tokenize(input);')).toBe('const parts = tokenize(input);');
    expect(redact('const secretsCount = 3;')).toBe('const secretsCount = 3;');
    expect(redact('function checkPassword(user: User) {')).toBe('function checkPassword(user: User) {');
    expect(redact('password: string;')).toBe('password: string;');
    expect(redact('const bearer = header.split(" ")[1];')).toBe('const bearer = header.split(" ")[1];');
    // The accepted over-redaction: a secret-ish name assigned from a long expression loses the expression.
    expect(redact('const tokenCount = countTokens(input);')).toBe('const tokenCount = [redacted]');
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

  it('a timeout is a LockError naming the lock relative to the project, never "ledger" or an absolute path', () => {
    const { root, paths } = tempProject({});
    mkdirSync(paths.dir, { recursive: true });
    writeFileSync(paths.lock, `${process.pid}\n`);
    let err: unknown;
    try {
      withLock(paths.lock, () => 1, { timeoutMs: 100 });
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(LockError);
    expect((err as Error).message).toBe('✖ lock: .sidewise/lock is locked → wait for the other run, or delete the lock file if no run is active');
    expect((err as Error).message).not.toContain(root);
  });

  it('clears a fresh lock at once when its recorded pid is no longer alive', () => {
    const { paths } = tempProject({});
    mkdirSync(paths.dir, { recursive: true });
    writeFileSync(paths.lock, '2147483646\n'); // large unused pid: not alive; mtime is now
    const start = Date.now();
    expect(withLock(paths.lock, () => 42, { timeoutMs: 1000, staleMs: 30_000 })).toBe(42);
    expect(Date.now() - start).toBeLessThan(500);
  });

  it('keeps the age rule for a fresh lock with no parseable pid', () => {
    const { paths } = tempProject({});
    mkdirSync(paths.dir, { recursive: true });
    writeFileSync(paths.lock, 'not-a-pid\n');
    expect(() => withLock(paths.lock, () => 1, { timeoutMs: 100, staleMs: 30_000 })).toThrow(LockError);
  });

  it('clears a stale lock', () => {
    const { paths } = tempProject({});
    mkdirSync(paths.dir, { recursive: true });
    writeFileSync(paths.lock, '');
    const old = new Date(Date.now() - 120_000);
    utimesSync(paths.lock, old, old);
    expect(withLock(paths.lock, () => 42, { timeoutMs: 100, staleMs: 30_000 })).toBe(42);
  });

  it('clears a stale lock recorded against a pid that is no longer alive', () => {
    const { paths } = tempProject({});
    mkdirSync(paths.dir, { recursive: true });
    writeFileSync(paths.lock, '2147483646\n'); // large unused pid: not alive
    const old = new Date(Date.now() - 120_000);
    utimesSync(paths.lock, old, old);
    expect(withLock(paths.lock, () => 42, { timeoutMs: 100, staleMs: 30_000 })).toBe(42);
  });

  it('does not reclaim an old lock whose recorded pid is still alive', () => {
    const { paths } = tempProject({});
    mkdirSync(paths.dir, { recursive: true });
    writeFileSync(paths.lock, `${process.pid}\n`); // this test process: definitely alive
    const old = new Date(Date.now() - 120_000);
    utimesSync(paths.lock, old, old);
    expect(() => withLock(paths.lock, () => 1, { timeoutMs: 100, staleMs: 30_000 })).toThrow(/is locked → wait for the other run/);
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

  it('an email actor is kept, so it cannot mark its own run held', () => {
    const { paths } = tempProject({});
    appendRun(paths, sampleRun({ actor: 'dev@example.com', problem: 'mail dev@example.com' }));
    const [run] = readLedger(paths).filter(isRun);
    expect(run).toMatchObject({ actor: 'dev@example.com', problem: 'mail [redacted]' });
    expect(() => appendOutcome(paths, 'SW-0001', 'held', 'dev@example.com')).toThrow(/dev@example.com asked SW-0001, so it can't mark it held/);
    expect(appendOutcome(paths, 'SW-0001', 'held', 'owner@example.com').record).toMatchObject({ by: 'owner@example.com' });
  });

  it('a token-shaped actor is still redacted, and the same token as by is still refused', () => {
    const { paths } = tempProject({});
    appendRun(paths, sampleRun({ actor: GH_TOKEN }));
    expect(readFileSync(paths.log, 'utf8')).not.toContain(GH_TOKEN);
    expect(readLedger(paths).filter(isRun)[0]!.actor).toBe('[redacted]');
    expect(() => appendOutcome(paths, 'SW-0001', 'held', GH_TOKEN)).toThrow(/can't mark it held/);
    expect(readFileSync(paths.log, 'utf8')).not.toContain(GH_TOKEN);
  });

  it('redacts secrets in the by field before writing an outcome', () => {
    const { paths } = tempProject({});
    appendRun(paths, sampleRun({ actor: 'reviewer' }));
    appendOutcome(paths, 'SW-0001', 'held', `owner ${GH_TOKEN}`);
    expect(readFileSync(paths.log, 'utf8')).not.toContain(GH_TOKEN);
    expect(readLedger(paths).find((r) => r.kind === 'outcome')).toMatchObject({ by: 'owner [redacted]' });
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
