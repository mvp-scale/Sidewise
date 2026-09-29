// Claude Code plugin detection and commands — always through the injected Runner; `claude` is never actually
// spawned here, and the cache-dir removal always takes an explicit homeDir so it never touches ~/.claude.
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  addMarketplace,
  inPluginContext,
  installPlugin,
  marketplaceExists,
  NO_KEY_PLUGIN_HINT,
  pluginCacheDir,
  pluginStatus,
  type PluginStatus,
  removeMarketplace,
  removePluginCacheDir,
  uninstallPlugin,
} from '../../../src/setup/plugin.ts';
import type { Runner } from '../../../src/setup/runner.ts';

function stub(status: number, stdout: string): Runner {
  return () => ({ status, stdout, stderr: '' });
}

describe('pluginStatus', () => {
  it('finds sidewise in a plausible claude plugin list --json shape, with its scope', () => {
    const runner = stub(0, JSON.stringify([{ name: 'other-plugin', scope: 'user' }, { name: 'sidewise', scope: 'project' }]));
    const status: PluginStatus = pluginStatus(runner);
    expect(status).toEqual({ installed: true, scopes: ['project'] });
  });

  it('also finds a "name@marketplace" form, nested under an object rather than a top-level array', () => {
    const runner = stub(0, JSON.stringify({ plugins: [{ id: 'sidewise@mvp-scale', scope: 'user' }] }));
    expect(pluginStatus(runner)).toEqual({ installed: true, scopes: ['user'] });
  });

  it('not installed: claude missing, empty list, or unparseable output all read the same', () => {
    expect(pluginStatus(stub(1, ''))).toEqual({ installed: false, scopes: [] });
    expect(pluginStatus(stub(0, '[]'))).toEqual({ installed: false, scopes: [] });
    expect(pluginStatus(stub(0, 'not json'))).toEqual({ installed: false, scopes: [] });
  });
});

describe('marketplaceExists', () => {
  it('true only when the listing mentions mvp-scale', () => {
    expect(marketplaceExists(stub(0, 'mvp-scale\nother-marketplace\n'))).toBe(true);
    expect(marketplaceExists(stub(0, 'other-marketplace\n'))).toBe(false);
    expect(marketplaceExists(stub(1, ''))).toBe(false);
  });
});

describe('the exact commands (spec-literal)', () => {
  const calls: Array<{ cmd: string; args: string[] }> = [];
  const recorder: Runner = (cmd, args) => {
    calls.push({ cmd, args: [...args] });
    return { status: 0, stdout: '', stderr: '' };
  };

  it('marketplace add, install --scope, uninstall, marketplace remove', () => {
    calls.length = 0;
    addMarketplace(recorder, '/pkg/dir');
    installPlugin(recorder, 'user');
    uninstallPlugin(recorder, 'project');
    removeMarketplace(recorder);
    expect(calls).toEqual([
      { cmd: 'claude', args: ['plugin', 'marketplace', 'add', '/pkg/dir'] },
      { cmd: 'claude', args: ['plugin', 'install', 'sidewise@mvp-scale', '--scope', 'user'] },
      { cmd: 'claude', args: ['plugin', 'uninstall', 'sidewise@mvp-scale', '--scope', 'project'] },
      { cmd: 'claude', args: ['plugin', 'marketplace', 'remove', 'mvp-scale'] },
    ]);
  });
});

// [C-190] doctor's key: line and agent's overview no-key hint both branch on this.
describe('inPluginContext', () => {
  it('true only when CLAUDE_PLUGIN_ROOT is set to a non-blank value', () => {
    expect(inPluginContext({ CLAUDE_PLUGIN_ROOT: '/some/plugin/dir' })).toBe(true);
    expect(inPluginContext({})).toBe(false);
    expect(inPluginContext({ CLAUDE_PLUGIN_ROOT: '' })).toBe(false);
    expect(inPluginContext({ CLAUDE_PLUGIN_ROOT: '   ' })).toBe(false);
  });

  it('NO_KEY_PLUGIN_HINT names the exact config-dialog keystrokes', () => {
    expect(NO_KEY_PLUGIN_HINT).toBe('/plugin → Sidewise → Configure → press Enter on "TypeSafe API key", paste, Enter, Save configuration');
  });
});

describe('the plugin cache dir Claude leaves behind', () => {
  it('never touches a real ~/.claude: always under the injected homeDir', () => {
    const home = mkdtempSync(path.join(os.tmpdir(), 'sidewise-home-'));
    expect(pluginCacheDir(home)).toBe(path.join(home, '.claude', 'plugins', 'cache', 'mvp-scale'));
  });

  it('removes it when present, reports false when there was nothing to remove', () => {
    const home = mkdtempSync(path.join(os.tmpdir(), 'sidewise-home-'));
    expect(removePluginCacheDir(home)).toBe(false);
    const dir = pluginCacheDir(home);
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, 'x'), 'y');
    expect(removePluginCacheDir(home)).toBe(true);
    expect(existsSync(dir)).toBe(false);
  });
});
