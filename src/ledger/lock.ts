/**
 * A cross-process lock file (O_EXCL create). Held only around read-count-append, so many agents appending at
 * once get unique, ordered ids. The lock file's body is the owner's pid. A lock is stale (left behind by a
 * crash) only when it's older than staleMs AND its recorded pid is no longer alive; a file with no parseable
 * pid (legacy or empty) falls back to the age-only rule.
 */
import { closeSync, mkdirSync, openSync, readFileSync, statSync, unlinkSync, writeSync } from 'node:fs';
import path from 'node:path';

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
  if (Date.now() - statSync(lockPath).mtimeMs <= staleMs) return false;
  const pid = Number.parseInt(readFileSync(lockPath, 'utf8').trim(), 10);
  if (!Number.isInteger(pid) || pid <= 0) return true; // no parseable pid: age-only rule
  return !isAlive(pid);
}

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
        throw new Error(`✖ ledger: ${lockPath} is locked → wait for the other run, or delete the lock file if no run is active`);
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
