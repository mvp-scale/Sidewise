// mm3 --version/-v: prints the installed package's version, one line, exit 0 — free, no project needed,
// no Node-version gate (same free standing as the bare --help/-h). [C-178]
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { runCli, type CliCtx } from '../../src/cli.ts';

function fakeCtx(overrides: Partial<CliCtx> = {}): CliCtx {
  return {
    env: { MM3_PROVIDER: 'fake' },
    cwd: process.cwd(),
    platform: process.platform,
    runner: () => ({ status: 1, stdout: '', stderr: 'not used' }),
    packageDir: process.cwd(),
    pkg: { name: '@mvpscale/mm3', version: '9.9.9-test' },
    homeDir: '/nonexistent-home',
    nodeVersion: process.version,
    stdin: () => Buffer.from(''),
    io: { input: new PassThrough(), output: new PassThrough() },
    ...overrides,
  };
}

describe('mm3 --version / -v [C-178]', () => {
  it('prints the package version, one line, exit 0', async () => {
    const ctx = fakeCtx();
    for (const flag of ['--version', '-v']) {
      const r = await runCli([flag], ctx);
      expect(r).toEqual({ exit: 0, text: '9.9.9-test\n' });
    }
  });

  it('works even on a too-old Node (free, like the bare --help/-h)', async () => {
    const r = await runCli(['--version'], fakeCtx({ nodeVersion: 'v20.11.0' }));
    expect(r).toEqual({ exit: 0, text: '9.9.9-test\n' });
  });

  // The plugin's manifest pins no version (Claude uses the commit), so the plugin copy names the commit Claude
  // installed it from, read from Claude's own installed_plugins.json; an npm install has no entry and says nothing more.
  function pluginHome(installPath: string, sha = '2fbbc04a9a65ba8ca005934c0b9cdecb43a72d9b'): string {
    const home = mkdtempSync(path.join(os.tmpdir(), 'mm3-home-'));
    mkdirSync(path.join(home, '.claude', 'plugins'), { recursive: true });
    const record = { version: 2, plugins: { 'mm3@mvp-scale': [{ scope: 'user', installPath, version: sha.slice(0, 12), gitCommitSha: sha }] } };
    writeFileSync(path.join(home, '.claude', 'plugins', 'installed_plugins.json'), JSON.stringify(record));
    return home;
  }

  it('the plugin copy names the commit it was installed from', async () => {
    const pkgDir = mkdtempSync(path.join(os.tmpdir(), 'mm3-plugin-'));
    const r = await runCli(['--version'], fakeCtx({ packageDir: pkgDir, homeDir: pluginHome(pkgDir) }));
    expect(r).toEqual({ exit: 0, text: '9.9.9-test (plugin 2fbbc04a9a65)\n' });
  });

  it('honors CLAUDE_CONFIG_DIR for where Claude keeps its plugins', async () => {
    const pkgDir = mkdtempSync(path.join(os.tmpdir(), 'mm3-plugin-'));
    const home = pluginHome(pkgDir);
    const r = await runCli(['--version'], fakeCtx({ packageDir: pkgDir, env: { CLAUDE_CONFIG_DIR: path.join(home, '.claude') } }));
    expect(r).toEqual({ exit: 0, text: '9.9.9-test (plugin 2fbbc04a9a65)\n' });
  });

  it('an npm install, another install path or a corrupt record prints the plain version', async () => {
    const pkgDir = mkdtempSync(path.join(os.tmpdir(), 'mm3-npm-'));
    expect(await runCli(['--version'], fakeCtx({ packageDir: pkgDir, homeDir: pluginHome('/elsewhere') }))).toEqual({ exit: 0, text: '9.9.9-test\n' });
    const bad = pluginHome(pkgDir);
    writeFileSync(path.join(bad, '.claude', 'plugins', 'installed_plugins.json'), '{not json');
    expect(await runCli(['--version'], fakeCtx({ packageDir: pkgDir, homeDir: bad }))).toEqual({ exit: 0, text: '9.9.9-test\n' });
  });
});
