/**
 * The OS keychain, one fixed slot (service "sidewise", account "typesafe"): macOS via `security`, Linux via
 * `secret-tool`. Windows has no equivalent that's trivial and argv-safe (see storeKey's own doc for why
 * `security`/an interactive prompt don't count as "trivial" either) — this task's own scope decision, noted in
 * its report — so it always falls through to the env file there, and on any other platform. Every call goes
 * through the injected Runner; storing a secret always sends it on stdin, never argv.
 */
import type { Runner } from './runner.ts';

const TIMEOUT_MS = 3000;
const cleanLine = (s: string): string => s.replace(/\r?\n+$/u, '');

export function keychainLookup(runner: Runner, platform: NodeJS.Platform): string | undefined {
  if (platform === 'darwin') {
    const r = runner('security', ['find-generic-password', '-s', 'sidewise', '-a', 'typesafe', '-w'], { timeoutMs: TIMEOUT_MS });
    return r.status === 0 && r.stdout.trim() ? cleanLine(r.stdout) : undefined;
  }
  if (platform === 'linux') {
    const r = runner('secret-tool', ['lookup', 'service', 'sidewise', 'account', 'typesafe'], { timeoutMs: TIMEOUT_MS });
    return r.status === 0 && r.stdout.trim() ? cleanLine(r.stdout) : undefined;
  }
  return undefined; // Windows and anything else: see the module doc
}

/** macOS always returns 'unavailable': `security add-generic-password -w` takes the password only as its own
 *  argument or an interactive Keychain Access prompt — neither stdin nor a headless run can supply it any other
 *  way, and putting it on argv is refused outright. Linux's `secret-tool store` genuinely reads stdin. */
export function keychainStore(runner: Runner, platform: NodeJS.Platform, secret: string): 'stored' | 'unavailable' {
  if (platform === 'linux') {
    const r = runner('secret-tool', ['store', '--label=Sidewise', 'service', 'sidewise', 'account', 'typesafe'], { input: secret, timeoutMs: TIMEOUT_MS });
    return r.status === 0 ? 'stored' : 'unavailable';
  }
  return 'unavailable';
}

export function keychainRemove(runner: Runner, platform: NodeJS.Platform): boolean {
  if (platform === 'darwin') {
    return runner('security', ['delete-generic-password', '-s', 'sidewise', '-a', 'typesafe'], { timeoutMs: TIMEOUT_MS }).status === 0;
  }
  if (platform === 'linux') {
    return runner('secret-tool', ['clear', 'service', 'sidewise', 'account', 'typesafe'], { timeoutMs: TIMEOUT_MS }).status === 0;
  }
  return false;
}
