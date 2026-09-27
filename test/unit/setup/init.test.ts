// sidewise init: makes the CLI reachable, stores a key somewhere real, wires the Claude Code plugin, and sets
// up .sidewise/ — end to end, but with npm/claude/the keychain all standing in for a scripted fake Runner, and
// a fake TTY pair standing in for the terminal. No real process is ever spawned here.
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { credentialsPath, readCredentialsFile } from '../../../src/setup/keystore.ts';
import { readInstallRecord } from '../../../src/setup/install-record.ts';
import { type InitCtx, type InitFlags, runInit } from '../../../src/setup/init.ts';
import type { RunResult, Runner } from '../../../src/setup/runner.ts';

const PKG = { name: '@mvpscale/sidewise', version: '0.0.0' };

function fakeTty(): { input: PassThrough & { isTTY: boolean }; output: PassThrough & { isTTY: boolean } } {
  return { input: Object.assign(new PassThrough(), { isTTY: true }), output: Object.assign(new PassThrough(), { isTTY: true }) };
}

interface Scripted { calls: Array<{ cmd: string; args: string[]; input?: string }>; runner: Runner }

/** A dispatcher-style fake: matches on the command plus the leading args, so one test can script npm, claude
 *  and the keychain tool all at once. Anything not explicitly scripted fails (ENOENT-like), matching a real
 *  missing tool — every real call site here already has to handle that as "fall through", never a throw. */
function scriptedRunner(handlers: Record<string, (call: { cmd: string; args: string[]; input?: string }) => RunResult>): Scripted {
  const calls: Scripted['calls'] = [];
  const runner: Runner = (cmd, args, opts) => {
    const call = { cmd, args: [...args], input: opts?.input };
    calls.push(call);
    const key = `${cmd} ${args[0] ?? ''}`.trim();
    const handler = handlers[key] ?? handlers[cmd];
    return handler ? handler(call) : { status: 1, stdout: '', stderr: 'not found' };
  };
  return { calls, runner };
}

function baseCtx(overrides: Partial<InitCtx> = {}): { ctx: InitCtx; home: string } {
  const home = mkdtempSync(path.join(os.tmpdir(), 'sidewise-home-'));
  const cwd = mkdtempSync(path.join(os.tmpdir(), 'sidewise-cwd-'));
  const { runner } = scriptedRunner({});
  const { input, output } = fakeTty();
  const ctx: InitCtx = {
    env: { XDG_CONFIG_HOME: path.join(home, '.config'), PATH: '/does/not/exist' },
    cwd,
    platform: 'linux',
    runner,
    io: { input, output },
    packageDir: path.join(home, 'pkg'), // no package-lock.json above it: detectSelfSpec falls back to the registry spec
    pkg: PKG,
    homeDir: home,
    now: () => '2026-09-27T00:00:00Z',
    ...overrides,
  };
  return { ctx, home };
}

function unwritablePrefix(home: string): string {
  const locked = path.join(home, 'locked-prefix');
  mkdirSync(locked);
  chmodSync(locked, 0o500);
  return locked;
}

const YES_NO_CLAUDE_STDIN: InitFlags = { key: 'stdin', claude: false, yes: true };

describe('runInit: a fresh --yes --no-claude --key-stdin run', () => {
  it('installs --user when the global prefix is not writable and cwd has no package.json, stores the key to the file (secret-tool absent), and creates .sidewise/', async () => {
    const { ctx, home } = baseCtx();
    if (process.getuid && process.getuid() === 0) return; // root ignores the chmod; skip under root
    const prefix = unwritablePrefix(home);
    mkdirSync(path.join(ctx.cwd, '.git')); // "inside a git project" for the project step
    const npmCalls: string[][] = [];
    const { runner, calls } = scriptedRunner({
      'npm config': () => ({ status: 0, stdout: `${prefix}\n`, stderr: '' }),
      npm: (c) => {
        npmCalls.push(c.args);
        return { status: 0, stdout: '', stderr: '' };
      },
      'secret-tool store': () => ({ status: 1, stdout: '', stderr: 'not found' }),
    });
    ctx.runner = runner;
    const keyStdin = new PassThrough();
    ctx.keyStdin = keyStdin;
    keyStdin.write('dummy-key-value-123\n');

    const r = await runInit(YES_NO_CLAUDE_STDIN, ctx);
    expect(r.exit).toBe(0);
    expect(r.text).toContain('cli: ✔ installed --user');
    expect(r.text).toContain('key: ✔ stored in');
    expect(r.text).toContain('plugin: – skipped (--no-claude)');
    expect(r.text).toContain('project: ✔ created .sidewise/');
    expect(r.text).not.toContain('dummy-key-value-123');

    expect(npmCalls[0]).toEqual(['install', '-g', '--prefix', path.join(home, '.local'), '@mvpscale/sidewise@0.0.0']);
    for (const c of calls) for (const a of c.args) expect(a).not.toContain('dummy-key-value-123');

    expect(readInstallRecord(ctx.env)).toMatchObject({ mode: 'user', npmPrefix: path.join(home, '.local') });
    expect(readCredentialsFile(credentialsPath(ctx.env))).toMatchObject({ typesafe: 'dummy-key-value-123' });
    expect(existsSync(path.join(ctx.cwd, '.sidewise', '.gitignore'))).toBe(true);
    expect(readFileSync(path.join(ctx.cwd, '.sidewise', '.gitignore'), 'utf8')).toBe('*\n');
  });

  it('defaults to --local when cwd has a package.json, regardless of the global prefix', async () => {
    const { ctx } = baseCtx();
    writeFileSync(path.join(ctx.cwd, 'package.json'), JSON.stringify({ name: 'consumer', version: '1.0.0' }));
    const { runner, calls } = scriptedRunner({
      'npm config': () => ({ status: 0, stdout: '/usr/local\n', stderr: '' }),
      npm: () => ({ status: 0, stdout: '', stderr: '' }),
    });
    ctx.runner = runner;
    ctx.keyStdin = new PassThrough({ read() {} });

    const r = await runInit({ key: 'no', claude: false, yes: true }, ctx);
    expect(r.text).toContain('cli: ✔ installed --local');
    const install = calls.find((c) => c.cmd === 'npm' && c.args[0] === 'install');
    expect(install?.args).toEqual(['install', '-D', '@mvpscale/sidewise@0.0.0']);
    expect(readInstallRecord(ctx.env)).toMatchObject({ mode: 'local', projectDir: ctx.cwd });
  });

  it('an explicit --global against an unwritable prefix never runs sudo — it stops that one step with a fix', async () => {
    const { ctx, home } = baseCtx();
    if (process.getuid && process.getuid() === 0) return;
    const prefix = unwritablePrefix(home);
    const { runner, calls } = scriptedRunner({ 'npm config': () => ({ status: 0, stdout: `${prefix}\n`, stderr: '' }) });
    ctx.runner = runner;

    const r = await runInit({ mode: 'global', key: 'no', claude: false, yes: true }, ctx);
    expect(r.text).toContain('cli: ✖ the global npm prefix needs sudo → re-run "sidewise init --user" instead');
    expect(calls.some((c) => c.args[0] === 'install')).toBe(false); // never attempted, never mind sudo
  });
});

describe('runInit: idempotent re-run', () => {
  it('CLI already reachable, key already set, project already there: every line says so, nothing changes', async () => {
    const { ctx, home } = baseCtx();
    mkdirSync(path.join(ctx.cwd, '.git'));
    // Pre-seed a layout npm itself would produce: <prefix>/bin/sidewise is a symlink into
    // <prefix>/lib/node_modules/@mvpscale/sidewise/dist/cli.js — isPackageBin walks up from the symlink's
    // *real* path, so the bin must actually live under the package dir, not just sit beside it.
    const pkgDir = path.join(home, 'installed', 'lib', 'node_modules', '@mvpscale', 'sidewise');
    mkdirSync(path.join(pkgDir, 'dist'), { recursive: true });
    writeFileSync(path.join(pkgDir, 'package.json'), JSON.stringify(PKG));
    writeFileSync(path.join(pkgDir, 'dist', 'cli.js'), '#!/usr/bin/env node\n');
    chmodSync(path.join(pkgDir, 'dist', 'cli.js'), 0o755);
    const binDir = path.join(home, 'installed', 'bin');
    mkdirSync(binDir, { recursive: true });
    const bin = path.join(binDir, 'sidewise');
    const { symlinkSync } = await import('node:fs');
    symlinkSync(path.join(pkgDir, 'dist', 'cli.js'), bin);
    ctx.env.PATH = binDir;

    const { runner } = scriptedRunner({});
    ctx.runner = runner;

    const r1 = await runInit({ key: 'no', claude: false, yes: true }, ctx);
    expect(r1.text).toContain('project: ✔ created .sidewise/');

    const r2 = await runInit({ key: 'no', claude: false, yes: true }, ctx);
    expect(r2.text).toContain(`cli: · already reachable as ${bin}`);
    expect(r2.text).toContain('project: · already has .sidewise/');
  });
});

describe('runInit: the key step', () => {
  it('an interactive run with no existing key: the hidden prompt, stored to the keychain when the tool succeeds', async () => {
    const { ctx } = baseCtx();
    const { runner, calls } = scriptedRunner({ 'secret-tool store': () => ({ status: 0, stdout: '', stderr: '' }) });
    ctx.runner = runner;
    const promise = runInit({ key: 'ask', claude: false, yes: false, mode: 'local' }, ctx);
    // Give the prompt a tick to attach before writing to it.
    await new Promise((resolve) => setTimeout(resolve, 0));
    (ctx.io.input as PassThrough).write('typed-secret-value\n');
    await new Promise((resolve) => setTimeout(resolve, 0));
    (ctx.io.input as PassThrough).write('\n'); // provider question: Enter = default (typesafe)
    const r = await promise;
    expect(r.text).toContain('key: ✔ stored in OS keychain');
    expect(r.text).not.toContain('typed-secret-value');
    const store = calls.find((c) => c.cmd === 'secret-tool' && c.args[0] === 'store');
    expect(store?.input).toBe('typed-secret-value');
  });

  it('--yes with no --key-stdin: behaves like Enter on the prompt — skipped, fake provider', async () => {
    const { ctx } = baseCtx();
    const r = await runInit({ key: 'ask', claude: false, yes: true }, ctx);
    expect(r.text).toContain('key: – skipped (no key entered');
  });

  it('a pasted value with whitespace is refused, not silently mangled', async () => {
    const { ctx } = baseCtx();
    ctx.keyStdin = new PassThrough();
    (ctx.keyStdin as PassThrough).write('has a space\n');
    const r = await runInit({ key: 'stdin', claude: false, yes: true }, ctx);
    expect(r.text).toContain('key: ✖ the pasted value has whitespace');
  });
});

describe('runInit: the project step', () => {
  it('outside a git project: skipped, .sidewise/ never created', async () => {
    const { ctx } = baseCtx();
    const r = await runInit({ key: 'no', claude: false, yes: true }, ctx);
    expect(r.text).toContain('project: – skipped (not inside a git project)');
    expect(existsSync(path.join(ctx.cwd, '.sidewise'))).toBe(false);
  });
});
