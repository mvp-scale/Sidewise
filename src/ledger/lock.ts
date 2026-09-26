/**
 * A cross-process lock file (O_EXCL create). Held only around read-count-append, so many agents appending at
 * once get unique, ordered ids. A lock older than staleMs is treated as left behind by a crash and removed.
 */
import { closeSync, mkdirSync, openSync, statSync, unlinkSync } from 'node:fs';
import path from 'node:path';

function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

export function withLock<T>(lockPath: string, fn: () => T, opts: { timeoutMs?: number; staleMs?: number } = {}): T {
  const timeoutMs = opts.timeoutMs ?? 5000;
  const staleMs = opts.staleMs ?? 30_000;
  mkdirSync(path.dirname(lockPath), { recursive: true });
  const start = Date.now();
  for (;;) {
    try {
      closeSync(openSync(lockPath, 'wx'));
      break;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
      try {
        if (Date.now() - statSync(lockPath).mtimeMs > staleMs) {
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
