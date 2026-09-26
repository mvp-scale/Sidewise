/** Runs the built binary (dist/cli.js) the way an agent does: separate processes, fake provider, no key, no network. */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

export const CLI = path.resolve('dist/cli.js');

export interface CliResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

export function cliEnv(root: string | undefined, extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, SIDEWISE_PROVIDER: 'fake', SIDEWISE_ACTOR: 'e2e-agent', TYPESAFE_API_KEY: '', AI_GATEWAY_API_KEY: '', ...extra };
  if (root === undefined) delete env.SIDEWISE_HOME;
  else env.SIDEWISE_HOME = root;
  return env;
}

/** One run, synchronous. `root` is both the cwd and SIDEWISE_HOME unless `home: false`. */
export function sidewise(root: string, args: string[], o: { input?: string | Buffer; home?: boolean; env?: Record<string, string> } = {}): CliResult {
  const r = spawnSync(process.execPath, [CLI, ...args], { cwd: root, input: o.input ?? '', encoding: 'utf8', env: cliEnv(o.home === false ? undefined : root, o.env) });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

/** One run as a child process, for launching many at once. */
export function sidewiseAsync(root: string, args: string[], env: Record<string, string> = {}): Promise<CliResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [CLI, ...args], { cwd: root, env: cliEnv(root, env), stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (d: string) => (stdout += d));
    child.stderr.setEncoding('utf8').on('data', (d: string) => (stderr += d));
    child.on('error', reject);
    child.on('close', (status) => resolve({ status, stdout, stderr }));
  });
}

/** Every file under <root>/.sidewise with its bytes, or null when the folder does not exist. */
export function snapshot(root: string): Record<string, string> | null {
  const dir = path.join(root, '.sidewise');
  if (!existsSync(dir)) return null;
  const out: Record<string, string> = {};
  for (const name of readdirSync(dir).sort()) {
    const full = path.join(dir, name);
    out[name] = statSync(full).isDirectory() ? '<dir>' : readFileSync(full, 'latin1');
  }
  return out;
}

/** A failure an agent can act on: exit code, nothing on stdout, one "✖ … → …" line on stderr, no stack frames. */
export function expectCleanStop(r: CliResult, status: number): string {
  const problems: string[] = [];
  if (r.status !== status) problems.push(`exit ${r.status}, wanted ${status}`);
  if (r.stdout !== '') problems.push(`stdout not empty: ${JSON.stringify(r.stdout)}`);
  if (!/^✖ [^\n]+ → [^\n]+\n$/.test(r.stderr)) problems.push(`stderr is not one "✖ … → …" line: ${JSON.stringify(r.stderr)}`);
  if (/\n\s+at /.test(r.stderr)) problems.push('stack trace on stderr');
  if (problems.length) throw new Error(problems.join('; '));
  return r.stderr.trimEnd();
}
