// sidewise uninstall: reverses init. Every external effect goes through a scripted fake Runner and a fake TTY
// pair; nothing here ever spawns npm/claude for real or touches a real ~/.claude or ~/.config.
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { readInstallRecord, writeInstallRecord } from '../../../src/setup/install-record.ts';
import { credentialsPath, writeCredentialsFile } from '../../../src/setup/keystore.ts';
import { pluginCacheDir } from '../../../src/setup/plugin.ts';
import type { RunResult, Runner } from '../../../src/setup/runner.ts';
import { runUninstall, type UninstallCtx } from '../../../src/setup/uninstall.ts';

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
  const home = mkdtempSync(path.join(os.tmpdir(), 'sidewise-uninstall-home-'));
  const cwd = mkdtempSync(path.join(os.tmpdir(), 'sidewise-uninstall-cwd-'));
  const { runner } = scriptedRunner({});
  const ctx: UninstallCtx = {
    env: { XDG_CONFIG_HOME: path.join(home, '.config') },
    cwd,
    platform: 'linux',
    runner,
    io: fakeTty(),
    homeDir: home,
    pkgName: '@mvpscale/sidewise',
  };
  return { ctx, home };
}

describe('runUninstall with --yes: plugin/key/cli default yes, .sidewise/ defaults to kept', () => {
  it('removes the plugin (all scopes), the marketplace, the cache dir, the key, and the CLI — but keeps .sidewise/', async () => {
    const { ctx, home } = baseCtx();
    writeInstallRecord(ctx.env, { mode: 'user', npmPrefix: path.join(home, '.local'), installedAt: 'x' });
    writeCredentialsFile(credentialsPath(ctx.env), { typesafe: 'a-stored-key-value' });
    mkdirSync(path.join(ctx.cwd, '.sidewise'), { recursive: true });
    writeFileSync(path.join(ctx.cwd, '.sidewise', 'log.jsonl'), '');
    mkdirSync(pluginCacheDir(home), { recursive: true });

    const { runner, calls } = scriptedRunner({
      'claude plugin list': () => ({ status: 0, stdout: JSON.stringify([{ name: 'sidewise', scope: 'user' }, { name: 'sidewise', scope: 'project' }]), stderr: '' }),
      'claude plugin marketplace': () => ({ status: 0, stdout: 'mvp-scale\n', stderr: '' }),
      'claude plugin uninstall': () => ({ status: 0, stdout: '', stderr: '' }),
      npm: () => ({ status: 0, stdout: '', stderr: '' }),
    });
    ctx.runner = runner;

    const r = await runUninstall({ keepKey: false, keepData: false, yes: true }, ctx);
    expect(r.exit).toBe(0);
    expect(r.text).toContain('plugin: ✔ uninstalled sidewise@mvp-scale (user scope)');
    expect(r.text).toContain('plugin: ✔ uninstalled sidewise@mvp-scale (project scope)');
    expect(r.text).toContain('plugin: ✔ removed the mvp-scale marketplace');
    expect(r.text).toContain('plugin: ✔ removed the plugin cache dir');
    expect(r.text).toContain('key: ✔ removed from');
    expect(r.text).toContain('project: – kept .sidewise/ (default: no)');
    expect(r.text).toContain('cli: ✔ uninstalled (was --user)');
    expect(r.text).not.toContain('a-stored-key-value');

    expect(existsSync(pluginCacheDir(home))).toBe(false);
    expect(existsSync(path.join(ctx.cwd, '.sidewise'))).toBe(true); // kept
    expect(readInstallRecord(ctx.env)).toBeUndefined();
    const npmCall = calls.find((c) => c.cmd === 'npm');
    expect(npmCall?.args).toEqual(['uninstall', '-g', '--prefix', path.join(home, '.local'), '@mvpscale/sidewise']);
  });

  it('--keep-key and --keep-data skip those two steps outright, with no question asked', async () => {
    const { ctx } = baseCtx();
    mkdirSync(path.join(ctx.cwd, '.sidewise'), { recursive: true });
    const r = await runUninstall({ keepKey: true, keepData: true, yes: true }, ctx);
    expect(r.text).toContain('key: – skipped (--keep-key)');
    expect(r.text).toContain('project: – skipped (--keep-data)');
    expect(existsSync(path.join(ctx.cwd, '.sidewise'))).toBe(true);
  });

  it('no install record at all: prints the exact commands to run by hand instead of guessing', async () => {
    const { ctx } = baseCtx();
    const r = await runUninstall({ keepKey: true, keepData: true, yes: true }, ctx);
    expect(r.text).toMatch(/cli: ✖ don't know how this was installed → run one of:/);
    expect(r.text).toContain('npm uninstall -g @mvpscale/sidewise');
  });

  it('nothing was ever installed (plugin, key): says so plainly instead of asking pointlessly', async () => {
    const { ctx } = baseCtx();
    const r = await runUninstall({ keepKey: false, keepData: true, yes: true }, ctx);
    expect(r.text).toContain('plugin: · nothing to remove');
    expect(r.text).toContain('key: · nothing stored');
  });
});

describe('runUninstall interactively: an explicit "n" keeps .sidewise/, an explicit "y" removes it', () => {
  it('answering y to the .sidewise/ question actually removes it', async () => {
    const { ctx } = baseCtx();
    mkdirSync(path.join(ctx.cwd, '.sidewise'), { recursive: true });
    // With nothing installed (no plugin, no key, --keep-key, no install record), the .sidewise/ question is the
    // only prompt runUninstall actually asks in this scenario.
    const promise = runUninstall({ keepKey: true, keepData: false, yes: false }, ctx);
    await new Promise((resolve) => setTimeout(resolve, 0));
    (ctx.io.input as PassThrough).write('y\n'); // .sidewise/: yes, remove it
    const r = await promise;
    expect(r.text).toContain('project: ✔ removed .sidewise/');
    expect(existsSync(path.join(ctx.cwd, '.sidewise'))).toBe(false);
  });
});
