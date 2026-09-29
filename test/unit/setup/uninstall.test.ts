// mm3 uninstall: reverses init. Using MM3 is per project, so by default this only disables the
// current project (plugin at project scope, .mm3/ with confirmation); the per-user parts (key, CLI) need
// --all. Every external effect goes through a scripted fake Runner and a fake TTY pair; nothing here ever
// spawns npm/claude for real or touches a real ~/.claude or ~/.config.
import { chmodSync, existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { envFilePath, setEnvFileValue } from '../../../src/setup/env-file.ts';
import { readInstallRecord, writeInstallRecord } from '../../../src/setup/install-record.ts';
import { pluginCacheDir } from '../../../src/setup/plugin.ts';
import type { RunResult, Runner } from '../../../src/setup/runner.ts';
import { runUninstall, type UninstallCtx, type UninstallFlags } from '../../../src/setup/uninstall.ts';

function fakeTty(): { input: PassThrough & { isTTY: boolean }; output: PassThrough & { isTTY: boolean } } {
  return { input: Object.assign(new PassThrough(), { isTTY: true }), output: Object.assign(new PassThrough(), { isTTY: true }) };
}

function scriptedRunner(handlers: Record<string, (call: { cmd: string; args: string[] }) => RunResult>): { runner: Runner; calls: Array<{ cmd: string; args: string[] }> } {
  const calls: Array<{ cmd: string; args: string[] }> = [];
  const runner: Runner = (cmd, args) => {
    const call = { cmd, args: [...args] };
    calls.push(call);
    const key = `${cmd} ${args[0] ?? ''} ${args[1] ?? ''}`.trim();
    const handler = handlers[key] ?? handlers[`${cmd} ${args[0] ?? ''}`.trim()] ?? handlers[cmd];
    return handler ? handler(call) : { status: 1, stdout: '', stderr: 'not found' };
  };
  return { runner, calls };
}

function baseCtx(): { ctx: UninstallCtx; home: string } {
  const home = mkdtempSync(path.join(os.tmpdir(), 'mm3-uninstall-home-'));
  const cwd = mkdtempSync(path.join(os.tmpdir(), 'mm3-uninstall-cwd-'));
  const { runner } = scriptedRunner({});
  const ctx: UninstallCtx = {
    env: { XDG_CONFIG_HOME: path.join(home, '.config') },
    cwd,
    platform: 'linux',
    runner,
    io: fakeTty(),
    homeDir: home,
    pkgName: '@mvpscale/mm3',
  };
  return { ctx, home };
}

const DEFAULT_FLAGS: UninstallFlags = { all: false, keepKey: false, keepData: false, yes: true };

describe('runUninstall, default (no --all): only this project', () => {
  it('removes the plugin at project scope only, leaves the marketplace/cache dir, and never touches the key or CLI [C-100]', async () => {
    const { ctx, home } = baseCtx();
    writeInstallRecord(ctx.env, { mode: 'user', npmPrefix: path.join(home, '.local'), installedAt: 'x' });
    setEnvFileValue(envFilePath(ctx.env), 'TYPESAFE_API_KEY', 'a-stored-key-value');
    mkdirSync(path.join(ctx.cwd, '.mm3'), { recursive: true });
    writeFileSync(path.join(ctx.cwd, '.mm3', 'log.jsonl'), '');
    mkdirSync(pluginCacheDir(home), { recursive: true });

    const { runner, calls } = scriptedRunner({
      'claude plugin list': () => ({ status: 0, stdout: JSON.stringify([{ name: 'mm3', scope: 'user' }, { name: 'mm3', scope: 'project' }]), stderr: '' }),
      'claude plugin marketplace': () => ({ status: 0, stdout: 'mvp-scale\n', stderr: '' }),
      'claude plugin uninstall': () => ({ status: 0, stdout: '', stderr: '' }),
      npm: () => ({ status: 0, stdout: '', stderr: '' }),
    });
    ctx.runner = runner;

    const r = await runUninstall(DEFAULT_FLAGS, ctx);
    expect(r.exit).toBe(0);
    expect(r.text).toContain('✔ plugin: uninstalled mm3@mvp-scale (project scope)');
    expect(r.text).not.toContain('user scope'); // the user-scope install is left alone
    expect(r.text).not.toContain('marketplace'); // not touched without --all
    expect(r.text).not.toContain('cache dir');
    expect(r.text).toContain('– project: kept .mm3/ (default: no)');
    expect(r.text).toContain('– key: skipped (per-user; use --all to remove it)');
    expect(r.text).toContain('– cli: skipped (per-user; use --all to remove it)');
    expect(r.text).not.toContain('a-stored-key-value');

    expect(calls.some((c) => c.cmd === 'claude' && c.args[1] === 'uninstall' && c.args.includes('user'))).toBe(false);
    expect(existsSync(pluginCacheDir(home))).toBe(true); // untouched
    expect(existsSync(path.join(ctx.cwd, '.mm3'))).toBe(true); // kept
    expect(readInstallRecord(ctx.env)).toMatchObject({ mode: 'user' }); // untouched
    expect(calls.some((c) => c.cmd === 'npm')).toBe(false); // never even asked
  });

  it('nothing installed at project scope: says so plainly instead of asking pointlessly', async () => {
    const { ctx } = baseCtx();
    const { runner } = scriptedRunner({ 'claude plugin list': () => ({ status: 0, stdout: '[]', stderr: '' }) });
    ctx.runner = runner;
    const r = await runUninstall(DEFAULT_FLAGS, ctx);
    expect(r.text).toContain('· plugin: nothing to remove here');
  });

  it('--keep-data skips the .mm3/ step outright, with no question asked', async () => {
    const { ctx } = baseCtx();
    mkdirSync(path.join(ctx.cwd, '.mm3'), { recursive: true });
    const r = await runUninstall({ ...DEFAULT_FLAGS, keepData: true }, ctx);
    expect(r.text).toContain('– project: skipped (--keep-data)');
    expect(existsSync(path.join(ctx.cwd, '.mm3'))).toBe(true);
  });
});

describe('runUninstall --all: also the per-user parts, and every plugin scope', () => {
  it('removes every plugin scope, the marketplace, the cache dir, the key, and the CLI [C-100]', async () => {
    const { ctx, home } = baseCtx();
    writeInstallRecord(ctx.env, { mode: 'user', npmPrefix: path.join(home, '.local'), installedAt: 'x' });
    setEnvFileValue(envFilePath(ctx.env), 'TYPESAFE_API_KEY', 'a-stored-key-value');
    mkdirSync(pluginCacheDir(home), { recursive: true });

    const { runner, calls } = scriptedRunner({
      'claude plugin list': () => ({ status: 0, stdout: JSON.stringify([{ name: 'mm3', scope: 'user' }, { name: 'mm3', scope: 'project' }]), stderr: '' }),
      'claude plugin marketplace': () => ({ status: 0, stdout: 'mvp-scale\n', stderr: '' }),
      'claude plugin uninstall': () => ({ status: 0, stdout: '', stderr: '' }),
      npm: () => ({ status: 0, stdout: '', stderr: '' }),
    });
    ctx.runner = runner;

    const r = await runUninstall({ ...DEFAULT_FLAGS, all: true }, ctx);
    expect(r.text).toContain('✔ plugin: uninstalled mm3@mvp-scale (user scope)');
    expect(r.text).toContain('✔ plugin: uninstalled mm3@mvp-scale (project scope)');
    expect(r.text).toContain('✔ plugin: removed the mvp-scale marketplace');
    expect(r.text).toContain('✔ plugin: removed the plugin cache dir');
    expect(r.text).toContain('✔ key: removed from');
    expect(r.text).toContain('✔ cli: uninstalled (was --user)');
    expect(r.text).not.toContain('a-stored-key-value');

    expect(existsSync(pluginCacheDir(home))).toBe(false);
    expect(readInstallRecord(ctx.env)).toBeUndefined();
    const npmCall = calls.find((c) => c.cmd === 'npm');
    expect(npmCall?.args).toEqual(['uninstall', '-g', '--prefix', path.join(home, '.local'), '@mvpscale/mm3']);
  });

  it('--all --keep-key removes the CLI but not the key', async () => {
    const { ctx } = baseCtx();
    writeInstallRecord(ctx.env, { mode: 'global', npmPrefix: '/usr/local', installedAt: 'x' });
    setEnvFileValue(envFilePath(ctx.env), 'TYPESAFE_API_KEY', 'a-stored-key-value');
    const { runner } = scriptedRunner({
      'claude plugin list': () => ({ status: 0, stdout: '[]', stderr: '' }),
      npm: () => ({ status: 0, stdout: '', stderr: '' }),
    });
    ctx.runner = runner;
    const r = await runUninstall({ ...DEFAULT_FLAGS, all: true, keepKey: true }, ctx);
    expect(r.text).toContain('– key: skipped (--keep-key)');
    expect(r.text).toContain('✔ cli: uninstalled (was --global)');
  });

  it('no install record at all: prints the exact commands to run by hand instead of guessing', async () => {
    const { ctx } = baseCtx();
    const { runner } = scriptedRunner({ 'claude plugin list': () => ({ status: 0, stdout: '[]', stderr: '' }) });
    ctx.runner = runner;
    const r = await runUninstall({ ...DEFAULT_FLAGS, all: true }, ctx);
    expect(r.text).toMatch(/✖ cli: don't know how this was installed → run one of:/u);
    expect(r.text).toContain('npm uninstall -g @mvpscale/mm3');
    expect(r.text).toContain('manual backup — finish these by hand if you want to:');
  });

  it('no install.json, but the CLI resolves under the user prefix on PATH: detects --user from the path itself and removes it', async () => {
    const { ctx, home } = baseCtx();
    const userBin = path.join(home, '.local', 'bin');
    mkdirSync(userBin, { recursive: true });
    const bin = path.join(userBin, 'mm3');
    writeFileSync(bin, '#!/usr/bin/env node\n');
    chmodSync(bin, 0o755);
    ctx.env.PATH = userBin;

    const { runner, calls } = scriptedRunner({
      'claude plugin list': () => ({ status: 0, stdout: '[]', stderr: '' }),
      npm: () => ({ status: 0, stdout: '', stderr: '' }),
    });
    ctx.runner = runner;

    const r = await runUninstall({ ...DEFAULT_FLAGS, all: true }, ctx);
    expect(r.text).toContain('✔ cli: uninstalled (was --user (guessed from its own path on PATH — no install record found))');
    const npmCall = calls.find((c) => c.cmd === 'npm' && c.args[0] === 'uninstall');
    expect(npmCall?.args).toEqual(['uninstall', '-g', '--prefix', path.join(home, '.local'), '@mvpscale/mm3']);
  });

  it('a stored key that is declined interactively stays put and lands in the manual backup block, never the value', async () => {
    const { ctx } = baseCtx();
    setEnvFileValue(envFilePath(ctx.env), 'TYPESAFE_API_KEY', 'a-stored-key-value');
    const { runner } = scriptedRunner({ 'claude plugin list': () => ({ status: 0, stdout: '[]', stderr: '' }) });
    ctx.runner = runner;
    const promise = runUninstall({ all: true, keepKey: false, keepData: true, yes: false }, ctx);
    await new Promise((resolve) => setTimeout(resolve, 0));
    (ctx.io.input as PassThrough).write('n\n'); // decline the key removal
    const r = await promise;
    expect(r.text).toContain('– key: skipped (kept)');
    expect(r.text).toMatch(/manual backup[\s\S]*key:/u);
    expect(r.text).not.toContain('a-stored-key-value');
  });
});

describe('runUninstall: nothing stored means no question asked', () => {
  it('--all with no key anywhere: "nothing stored", never a prompt, no manual-backup entry for it', async () => {
    const { ctx } = baseCtx();
    writeInstallRecord(ctx.env, { mode: 'global', npmPrefix: '/usr/local', installedAt: 'x' });
    const { runner } = scriptedRunner({
      'claude plugin list': () => ({ status: 0, stdout: '[]', stderr: '' }),
      npm: () => ({ status: 0, stdout: '', stderr: '' }),
    });
    ctx.runner = runner;
    const r = await runUninstall({ ...DEFAULT_FLAGS, all: true }, ctx);
    expect(r.text).toContain('· key: nothing stored');
    expect(r.text).not.toMatch(/manual backup[\s\S]*key:/u);
  });
});

describe('runUninstall interactively: an explicit "n" keeps .mm3/, an explicit "y" removes it', () => {
  it('answering y to the .mm3/ question actually removes it', async () => {
    const { ctx } = baseCtx();
    mkdirSync(path.join(ctx.cwd, '.mm3'), { recursive: true });
    const { runner } = scriptedRunner({ 'claude plugin list': () => ({ status: 0, stdout: '[]', stderr: '' }) });
    ctx.runner = runner;
    // Nothing installed at project scope, so the plugin step asks nothing; .mm3/ is the only real prompt.
    const promise = runUninstall({ all: false, keepKey: false, keepData: false, yes: false }, ctx);
    await new Promise((resolve) => setTimeout(resolve, 0));
    (ctx.io.input as PassThrough).write('y\n');
    const r = await promise;
    expect(r.text).toContain('✔ project: removed .mm3/');
    expect(existsSync(path.join(ctx.cwd, '.mm3'))).toBe(false);
  });
});
