/**
 * `sidewise uninstall`: reverses init. Using Sidewise is per project (an owner ruling), so by default this only
 * disables the CURRENT project — the plugin's project-scope install, and (with confirmation; kept by default,
 * since it's the user's run history) that project's `.sidewise/`. The per-user parts — the stored key and the
 * CLI itself, shared across every project — are only touched with `--all`, which also then reaches every
 * plugin scope found (not just this project's) and the marketplace/cache dir it left behind. `--yes` takes the
 * default answer everywhere: yes for removal steps that run, no for `.sidewise/` (the one the owner called out
 * explicitly). `--keep-key`/`--keep-data` skip their step outright, with no question asked.
 */
import { existsSync, rmSync } from 'node:fs';
import { clearInstallRecord, readInstallRecord } from './install-record.ts';
import { removeStoredKey } from './keystore.ts';
import { marketplaceExists, pluginCacheDir, pluginStatus, removeMarketplace, removePluginCacheDir, uninstallPlugin } from './plugin.ts';
import { confirm, type PromptIO } from './prompt.ts';
import type { Runner } from './runner.ts';

export interface UninstallFlags {
  /** Also remove the per-user parts: the stored key, the CLI itself, every plugin scope (not just this
   *  project's), and the marketplace/cache dir it left behind. */
  all: boolean;
  keepKey: boolean;
  keepData: boolean;
  yes: boolean;
}

export interface UninstallCtx {
  env: Record<string, string | undefined>;
  cwd: string;
  platform: NodeJS.Platform;
  runner: Runner;
  io: PromptIO;
  homeDir: string;
  pkgName: string;
}

type Status = 'done' | 'already' | 'skipped' | 'problem';
const GLYPH: Record<Status, string> = { done: '✔', already: '·', skipped: '–', problem: '✖' };
const line = (status: Status, label: string, text: string): string => `${GLYPH[status]} ${label}: ${text}`;

async function ask(promptText: string, defaultAnswer: boolean, flags: UninstallFlags, io: PromptIO): Promise<boolean> {
  return flags.yes ? defaultAnswer : confirm(promptText, defaultAnswer, io);
}

/** Default: this project's own plugin install only. `--all`: every scope found, plus the shared marketplace
 *  registration and the cache dir Claude leaves behind — both global Claude Code state, not project-scoped, so
 *  they're left alone unless the user is explicitly clearing out everything. */
async function stepPlugin(flags: UninstallFlags, ctx: UninstallCtx): Promise<string[]> {
  const status = pluginStatus(ctx.runner);
  const scopesToRemove = flags.all ? status.scopes : status.scopes.filter((s) => s === 'project');
  const marketplace = flags.all && marketplaceExists(ctx.runner);
  const cacheDirExists = flags.all && existsSync(pluginCacheDir(ctx.homeDir));

  if (!scopesToRemove.length && !marketplace && !cacheDirExists) return [line('already', 'plugin', 'nothing to remove here')];

  const remove = await ask(flags.all ? 'Remove the Claude Code plugin (all scopes) and the mvp-scale marketplace?' : 'Remove the Claude Code plugin from this project?', true, flags, ctx.io);
  if (!remove) return [line('skipped', 'plugin', 'skipped (kept)')];

  const lines: string[] = [];
  for (const scope of scopesToRemove) {
    const r = uninstallPlugin(ctx.runner, scope);
    lines.push(r.status === 0 ? line('done', 'plugin', `uninstalled sidewise@mvp-scale (${scope} scope)`) : line('problem', 'plugin', `could not uninstall (${scope} scope)`));
  }
  if (marketplace) {
    const r = removeMarketplace(ctx.runner);
    lines.push(r.status === 0 ? line('done', 'plugin', 'removed the mvp-scale marketplace') : line('problem', 'plugin', 'could not remove the mvp-scale marketplace'));
  }
  if (flags.all) {
    lines.push(removePluginCacheDir(ctx.homeDir) ? line('done', 'plugin', 'removed the plugin cache dir') : line('already', 'plugin', 'no plugin cache dir left behind'));
  }
  return lines;
}

/** Per user, shared across every project — only touched with `--all`. */
async function stepKey(flags: UninstallFlags, ctx: UninstallCtx): Promise<string[]> {
  if (!flags.all) return [line('skipped', 'key', 'skipped (per-user; use --all to remove it)')];
  if (flags.keepKey) return [line('skipped', 'key', 'skipped (--keep-key)')];
  const remove = await ask('Remove the stored TypeSafe/gateway key (keychain and/or the env file)?', true, flags, ctx.io);
  if (!remove) return [line('skipped', 'key', 'skipped (kept)')];
  const { removed } = removeStoredKey(ctx.runner, ctx.platform, ctx.env);
  if (!removed.length) return [line('already', 'key', 'nothing stored')];
  return [line('done', 'key', `removed from ${removed.join(' and ')}`)];
}

/** This project's own `.sidewise/` — always considered (not gated on --all: it's this project's data,
 *  regardless of whether the per-user parts are also being removed), kept by default even under --yes. */
async function stepData(flags: UninstallFlags, ctx: UninstallCtx): Promise<string[]> {
  if (flags.keepData) return [line('skipped', 'project', 'skipped (--keep-data)')];
  const dir = `${ctx.cwd}/.sidewise`;
  if (!existsSync(dir)) return [line('already', 'project', 'no .sidewise/ here')];
  const remove = flags.yes ? false : await confirm("Remove this project's .sidewise/ (your run history)? This cannot be undone.", false, ctx.io);
  if (!remove) return [line('skipped', 'project', 'kept .sidewise/ (default: no)')];
  rmSync(dir, { recursive: true, force: true });
  return [line('done', 'project', 'removed .sidewise/')];
}

/** Per user, shared across every project — only touched with `--all`. */
async function stepCli(flags: UninstallFlags, ctx: UninstallCtx): Promise<string[]> {
  if (!flags.all) return [line('skipped', 'cli', 'skipped (per-user; use --all to remove it)')];
  const record = readInstallRecord(ctx.env);
  if (!record) {
    return [
      line(
        'problem',
        'cli',
        `don't know how this was installed → run one of: npm uninstall -g ${ctx.pkgName} · npm uninstall -g --prefix ~/.local ${ctx.pkgName} · npm uninstall -D ${ctx.pkgName} (in your project)`,
      ),
    ];
  }
  const remove = await ask(`Remove the CLI itself (installed --${record.mode})?`, true, flags, ctx.io);
  if (!remove) return [line('skipped', 'cli', 'skipped (kept)')];

  const args =
    record.mode === 'global'
      ? ['uninstall', '-g', ctx.pkgName]
      : record.mode === 'user'
        ? ['uninstall', '-g', '--prefix', record.npmPrefix ?? '', ctx.pkgName]
        : ['uninstall', ctx.pkgName];
  const r = ctx.runner('npm', args);
  if (r.status !== 0) return [line('problem', 'cli', `npm ${args.join(' ')} failed → ${r.stderr.trim().split('\n')[0] ?? "see npm's own output"}`)];
  clearInstallRecord(ctx.env);
  return [line('done', 'cli', `uninstalled (was --${record.mode})`)];
}

export async function runUninstall(flags: UninstallFlags, ctx: UninstallCtx): Promise<{ exit: 0; text: string }> {
  const lines: string[] = [];
  lines.push(...(await stepPlugin(flags, ctx)));
  lines.push(...(await stepData(flags, ctx)));
  lines.push(...(await stepKey(flags, ctx)));
  lines.push(...(await stepCli(flags, ctx)));
  return { exit: 0, text: `${lines.join('\n')}\n` };
}
