/**
 * The one injectable boundary for every external command init/uninstall/doctor might run: npm, claude,
 * security, secret-tool, powershell. A secret going on argv is how a shell history, `ps`, or a crash report
 * leaks it, so every call site that carries one sends it through `opts.input` (stdin), never as an argument —
 * unit tests assert this by recording the exact argv a stub runner saw and grepping it for the secret.
 */
import { execFileSync } from 'node:child_process';

export interface RunResult {
  status: number;
  stdout: string;
  stderr: string;
}

export type Runner = (cmd: string, args: readonly string[], opts?: { input?: string; timeoutMs?: number }) => RunResult;

const DEFAULT_TIMEOUT_MS = 5000;

/** The real runner: execFileSync, normalized so a missing command, a timeout, or a nonzero exit is a result to
 *  branch on, never a thrown exception — an ENOENT (no `secret-tool` on this box) is exactly the "fall through
 *  to the next source" case every caller here already has to handle. */
export const realRunner: Runner = (cmd, args, opts = {}) => {
  try {
    const stdout = execFileSync(cmd, [...args], {
      input: opts.input ?? '',
      timeout: opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { status: 0, stdout, stderr: '' };
  } catch (e) {
    const err = e as NodeJS.ErrnoException & { status?: number | null; stdout?: string; stderr?: string };
    return { status: typeof err.status === 'number' ? err.status : 1, stdout: err.stdout ?? '', stderr: err.stderr ?? err.message ?? '' };
  }
};
