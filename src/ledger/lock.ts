/**
 * A cross-process lock file (O_EXCL create). Held only around read-count-append, so many agents appending at
 * once get unique, ordered ids. The lock file's body is the owner's pid. A lock whose recorded pid is no
 * longer alive is stale at once (left behind by a crash); a live pid is never stale; a file with no parseable
 * pid (legacy, or not yet written) falls back to the age-only rule (older than staleMs).
 * A timeout throws LockError, which verbs catch; it lives here so ledger and budget can share it without a cycle.
 */
import { closeSync, mkdirSync, openSync, readFileSync, statSync, unlinkSync, writeSync } from 'node:fs';
import path from 'node:path';

export class LockError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LockError';
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

// The lock always lives at <project>/.sidewise/lock, so its last two segments are its project-relative path.
const shownLock = (lockPath: string): string => `${path.basename(path.dirname(lockPath))}/${path.basename(lockPath)}`;

export function withLock<T>(lockPath: string, fn: () => T, opts: { timeoutMs?: number; staleMs?: number } = {}): T {
  const timeoutMs = opts.timeoutMs ?? 5000;
  const staleMs = opts.staleMs ?? 30_000;
  mkdirSync(path.dirname(lockPath), { recursive: true });
  const start = Date.now();
  for (;;) {
    try {
      const fd = openSync(lockPath, 'wx');
      writeSync(fd, `${process.pid}\n`);
      closeSync(fd);
      break;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
      try {
        if (isStale(lockPath, staleMs)) {
          unlinkSync(lockPath);
          continue;
        }
      } catch {
        continue;
      }
      if (Date.now() - start > timeoutMs) {
        throw new LockError(`✖ lock: ${shownLock(lockPath)} is locked → wait for the other run, or delete the lock file if no run is active`);
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
