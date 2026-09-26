/**
 * A cross-process lock file (O_EXCL create). Held only around read-count-append, so many agents appending at
 * once get unique, ordered ids. The lock file's body is the owner's pid. A lock whose recorded pid is no
 * longer alive is stale at once (left behind by a crash); a live pid is never stale; a file with no parseable
 * pid (legacy, or not yet written) falls back to the age-only rule (older than staleMs).
 * A timeout throws LockError, which verbs catch; it lives here so ledger and budget can share it without a cycle.
 * So does StoreError: a filesystem failure under .sidewise/ (not writable, a folder where a file should be),
 * turned into one clean line instead of a raw errno and a machine path.
 */
import { closeSync, mkdirSync, openSync, readFileSync, statSync, unlinkSync, writeSync } from 'node:fs';
import path from 'node:path';

export class LockError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LockError';
  }
}

export class StoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StoreError';
  }
}

// Everything we write lives at <project>/.sidewise/<name>, so its last two segments are its project-relative path.
const shownStore = (file: string): string => `${path.basename(path.dirname(file))}/${path.basename(file)}`;

/** An errno failure on a .sidewise/ file as a StoreError; anything else is passed through untouched. */
export function storeError(e: unknown, file: string, action: 'read' | 'write'): unknown {
  const code = (e as NodeJS.ErrnoException | undefined)?.code;
  if (typeof code !== 'string') return e;
  return new StoreError(`✖ files: cannot ${action} ${shownStore(file)} (${code}) → make .sidewise/ a writable folder, with log.jsonl and budget.json as files`);
}

/** Runs fn, rethrowing an errno failure as a StoreError that names the file. */
export function onStore<T>(file: string, action: 'read' | 'write', fn: () => T): T {
  try {
    return fn();
  } catch (e) {
    throw storeError(e, file, action);
  }
}

function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    // ESRCH: no such process → dead. EPERM (or anything else): a process is there but we can't signal it → alive.
    return (e as NodeJS.ErrnoException).code !== 'ESRCH';
  }
}

function isStale(lockPath: string, staleMs: number): boolean {
  const pid = Number.parseInt(readFileSync(lockPath, 'utf8').trim(), 10);
  if (Number.isInteger(pid) && pid > 0) return !isAlive(pid);
  return Date.now() - statSync(lockPath).mtimeMs > staleMs; // no parseable pid: age-only rule
}

export function withLock<T>(lockPath: string, fn: () => T, opts: { timeoutMs?: number; staleMs?: number } = {}): T {
  const timeoutMs = opts.timeoutMs ?? 5000;
  const staleMs = opts.staleMs ?? 30_000;
  onStore(lockPath, 'write', () => mkdirSync(path.dirname(lockPath), { recursive: true }));
  const start = Date.now();
  for (;;) {
    try {
      const fd = openSync(lockPath, 'wx');
      try {
        writeSync(fd, `${process.pid}\n`);
        closeSync(fd);
      } catch (e) {
        // Created but not written (disk full): remove it, or it would block every run until it ages out.
        try {
          closeSync(fd);
        } catch {
          /* already closed */
        }
        unlinkSync(lockPath);
        throw storeError(e, lockPath, 'write');
      }
      break;
    } catch (e) {
      if (e instanceof StoreError) throw e;
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw storeError(e, lockPath, 'write');
      try {
        if (isStale(lockPath, staleMs)) {
          unlinkSync(lockPath);
          continue;
        }
      } catch {
        continue;
      }
      if (Date.now() - start > timeoutMs) {
        throw new LockError(`✖ lock: ${shownStore(lockPath)} is locked → wait for the other run, or delete the lock file if no run is active`);
      }
      sleepSync(25);
    }
  }
  try {
    return fn();
  } finally {
    try {
      unlinkSync(lockPath);
    } catch {
      /* already removed */
    }
  }
}
