/**
 * The Claude Code plugin side of setup: whether `claude` is on PATH, whether the `mvp-scale` marketplace and
 * the `sidewise` plugin are already there, and the commands that add/install/remove them. `claude plugin
 * list --json`'s exact shape isn't documented anywhere verifiable against a real `claude` binary, so parsing
 * here is deliberately lenient: it walks whatever JSON comes back looking for an entry naming "sidewise", and
 * falls back to "not installed" rather than guessing at a shape. Every command below goes through the injected
 * Runner — nothing here ever shells out for real inside a test.
 *
 * `inPluginContext`/`NO_KEY_PLUGIN_HINT` are a separate, narrower concern: not "is the plugin installed"
 * (above), but "is *this call* running as the plugin's own bundled MCP server" — the only place a no-key hint
 * pointing at `/plugin → Sidewise → Configure` makes sense, as opposed to a bare terminal, where the hint is
 * `sidewise init`. Both `doctor` and `agent` (src/verbs/doctor.ts, src/help/agent.ts) share this one check so
 * neither can drift from the other on what "inside Claude Code" means.
 */
import { existsSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Runner } from './runner.ts';

export type PluginScope = 'user' | 'project' | 'local';

export interface PluginStatus {
  installed: boolean;
  scopes: PluginScope[];
}

const SCOPES: readonly PluginScope[] = ['user', 'project', 'local'];
const isScope = (v: unknown): v is PluginScope => typeof v === 'string' && (SCOPES as readonly string[]).includes(v);

function walk(value: unknown, scopes: Set<PluginScope>, found: { any: boolean }): void {
  if (Array.isArray(value)) {
    for (const v of value) walk(v, scopes, found);
    return;
  }
  if (!value || typeof value !== 'object') return;
  const obj = value as Record<string, unknown>;
  const name = typeof obj.name === 'string' ? obj.name : typeof obj.id === 'string' ? obj.id : '';
  if (name === 'sidewise' || name.startsWith('sidewise@')) {
    found.any = true;
    if (isScope(obj.scope)) scopes.add(obj.scope);
  }
  for (const v of Object.values(obj)) walk(v, scopes, found);
}

/** `installed: false` for "not installed", "claude isn't on PATH", or "the output didn't parse" — doctor and
 *  init both just want to know whether to offer `sidewise init --claude`, not why. */
export function pluginStatus(runner: Runner): PluginStatus {
  const r = runner('claude', ['plugin', 'list', '--json']);
  if (r.status !== 0) return { installed: false, scopes: [] };
  try {
    const scopes = new Set<PluginScope>();
    const found = { any: false };
    walk(JSON.parse(r.stdout), scopes, found);
    return { installed: found.any, scopes: [...scopes] };
  } catch {
    return { installed: false, scopes: [] };
  }
}

export function marketplaceExists(runner: Runner): boolean {
  const r = runner('claude', ['plugin', 'marketplace', 'list']);
  return r.status === 0 && /\bmvp-scale\b/u.test(r.stdout);
}

export const addMarketplace = (runner: Runner, packageDir: string) => runner('claude', ['plugin', 'marketplace', 'add', packageDir]);
export const installPlugin = (runner: Runner, scope: 'user' | 'project') => runner('claude', ['plugin', 'install', 'sidewise@mvp-scale', '--scope', scope]);
export const uninstallPlugin = (runner: Runner, scope?: PluginScope) => runner('claude', ['plugin', 'uninstall', 'sidewise@mvp-scale', ...(scope ? ['--scope', scope] : [])]);
export const removeMarketplace = (runner: Runner) => runner('claude', ['plugin', 'marketplace', 'remove', 'mvp-scale']);

/** `~/.claude/plugins/cache/mvp-scale`, the cache dir Claude leaves behind after `marketplace remove` (its own
 *  cleanup doesn't reach it, the same way a project's own `.sidewise/` is left behind on our side). `homeDir`
 *  is injectable so a test never touches a real `~/.claude`. */
export function pluginCacheDir(homeDir: string = os.homedir()): string {
  return path.join(homeDir, '.claude', 'plugins', 'cache', 'mvp-scale');
}

/** true only when it actually removed something, so uninstall's "✔ done"/"· already" line can tell the two apart. */
export function removePluginCacheDir(homeDir: string = os.homedir()): boolean {
  const dir = pluginCacheDir(homeDir);
  if (!existsSync(dir)) return false;
  rmSync(dir, { recursive: true, force: true });
  return true;
}

/** Whether this process is the plugin's own bundled MCP server (`sidewise mcp`, launched by Claude Code from
 *  `.mcp.json`'s `${CLAUDE_PLUGIN_ROOT}/bin/sidewise.mjs`) rather than a bare terminal or another MCP client.
 *  Claude Code exports `CLAUDE_PLUGIN_ROOT` into an MCP stdio server's own process environment (Claude Code's
 *  plugins-reference docs, "Environment variables" table) — no other launch path sets it, so its mere presence
 *  is the signal a no-key hint needs: pointing at `/plugin → Sidewise → Configure` only makes sense when
 *  that's actually where the call came from. */
export function inPluginContext(env: Record<string, string | undefined>): boolean {
  return Boolean(env.CLAUDE_PLUGIN_ROOT?.trim());
}

/** The keystrokes for the plugin's one config field (userConfig has no placeholder/prompt-text field — see
 *  plugin.json's own `typesafe_api_key.description`, which spells the same sequence out in full for the
 *  config dialog itself). Shared verbatim by doctor's `key:` line and agent's no-key `run:` line so the two
 *  views can't drift on the exact steps. */
export const NO_KEY_PLUGIN_HINT = '/plugin → Sidewise → Configure → press Enter on "TypeSafe API key", paste, Enter, Save configuration';
