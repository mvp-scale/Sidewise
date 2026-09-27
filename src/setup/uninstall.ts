/**
 * `sidewise uninstall`: reverses init — the Claude Code plugin (all scopes it's in), the `mvp-scale`
 * marketplace and the cache dir Claude leaves behind, the stored key, the project's `.sidewise/` (kept by
 * default: it's the user's run history), then the CLI itself, using whichever install mode `sidewise init`
 * recorded. Asks before each destructive step; `--yes` takes the default answer everywhere — yes for the
 * plugin/key/CLI steps (the point of asking for uninstall at all), no for `.sidewise/` (the one the owner
 * called out explicitly). `--keep-key`/`--keep-data` skip their step outright, with no question asked.
 */
import { existsSync, rmSync } from 'node:fs';
import { clearInstallRecord, readInstallRecord } from './install-record.ts';
import { removeStoredKey } from './keystore.ts';
import { marketplaceExists, pluginCacheDir, pluginStatus, removeMarketplace, removePluginCacheDir, uninstallPlugin } from './plugin.ts';
import { confirm, type PromptIO } from './prompt.ts';
import type { Runner } from './runner.ts';

export interface UninstallFlags {
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

const STATUS = { done: '✔', already: '·', skipped: '–', problem: '✖' } as const;

async function ask(promptText: string, defaultAnswer: boolean, flags: UninstallFlags, io: PromptIO): Promise<boolean> {
  return flags.yes ? defaultAnswer : confirm(promptText, defaultAnswer, io);
}

async function stepPlugin(flags: UninstallFlags, ctx: UninstallCtx): Promise<string[]> {
  const status = pluginStatus(ctx.runner);
  const marketplace = marketplaceExists(ctx.runner);
  const cacheDirExists = existsSync(pluginCacheDir(ctx.homeDir));
  if (!status.installed && !marketplace && !cacheDirExists) return [`plugin: ${STATUS.already} nothing to remove`];

  const remove = await ask('Remove the Claude Code plugin and the mvp-scale marketplace?', true, flags, ctx.io);
  if (!remove) return [`plugin: ${STATUS.skipped} skipped (kept)`];

  const lines: string[] = [];
  for (const scope of status.scopes.length ? status.scopes : status.installed ? (['user'] as const) : []) {
    const r = uninstallPlugin(ctx.runner, scope);
    lines.push(r.status === 0 ? `plugin: ${STATUS.done} uninstalled sidewise@mvp-scale (${scope} scope)` : `plugin: ${STATUS.problem} could not uninstall (${scope} scope)`);
  }
  if (marketplace) {
    const r = removeMarketplace(ctx.runner);
    lines.push(r.status === 0 ? `plugin: ${STATUS.done} removed the mvp-scale marketplace` : `plugin: ${STATUS.problem} could not remove the mvp-scale marketplace`);
  }
  lines.push(removePluginCacheDir(ctx.homeDir) ? `plugin: ${STATUS.done} removed the plugin cache dir` : `plugin: ${STATUS.already} no plugin cache dir left behind`);
  if (!lines.length) lines.push(`plugin: ${STATUS.already} nothing to remove`);
  return lines;
}

async function stepKey(flags: UninstallFlags, ctx: UninstallCtx): Promise<string[]> {
  if (flags.keepKey) return [`key: ${STATUS.skipped} skipped (--keep-key)`];
  // Asked unconditionally (not gated on the credentials file existing): a keychain entry can be there with no
  // credentials file at all, and removeStoredKey below is the only thing that actually knows either way.
  const remove = await ask('Remove the stored TypeSafe/gateway key (keychain and/or the credentials file)?', true, flags, ctx.io);
  if (!remove) return [`key: ${STATUS.skipped} skipped (kept)`];
  const { removed } = removeStoredKey(ctx.runner, ctx.platform, ctx.env);
  if (!removed.length) return [`key: ${STATUS.already} nothing stored`];
  return [`key: ${STATUS.done} removed from ${removed.join(' and ')}`];
}

async function stepData(flags: UninstallFlags, ctx: UninstallCtx): Promise<string[]> {
  if (flags.keepData) return [`project: ${STATUS.skipped} skipped (--keep-data)`];
  const dir = `${ctx.cwd}/.sidewise`;
  if (!existsSync(dir)) return [`project: ${STATUS.already} no .sidewise/ here`];
  // The one step whose default is "no" even under --yes (an owner ruling: this is the user's run history).
  const remove = flags.yes ? false : await confirm('Remove this project\'s .sidewise/ (your run history)? This cannot be undone.', false, ctx.io);
  if (!remove) return [`project: ${STATUS.skipped} kept .sidewise/ (default: no)`];
  rmSync(dir, { recursive: true, force: true });
  return [`project: ${STATUS.done} removed .sidewise/`];
}

async function stepCli(flags: UninstallFlags, ctx: UninstallCtx): Promise<string[]> {
  const record = readInstallRecord(ctx.env);
  if (!record) {
    return [
      `cli: ${STATUS.problem} don't know how this was installed → run one of: npm uninstall -g ${ctx.pkgName}` +
        ` · npm uninstall -g --prefix ~/.local ${ctx.pkgName} · npm uninstall -D ${ctx.pkgName} (in your project)`,
    ];
  }
  const remove = await ask(`Remove the CLI itself (installed --${record.mode})?`, true, flags, ctx.io);
  if (!remove) return [`cli: ${STATUS.skipped} skipped (kept)`];

  const args =
    record.mode === 'global'
      ? ['uninstall', '-g', ctx.pkgName]
      : record.mode === 'user'
        ? ['uninstall', '-g', '--prefix', record.npmPrefix ?? '', ctx.pkgName]
        : ['uninstall', ctx.pkgName];
  const r = ctx.runner('npm', args);
  if (r.status !== 0) {
    return [`cli: ${STATUS.problem} npm ${args.join(' ')} failed → ${r.stderr.trim().split('\n')[0] ?? "see npm's own output"}`];
  }
  clearInstallRecord(ctx.env);
  return [`cli: ${STATUS.done} uninstalled (was --${record.mode})`];
}

export async function runUninstall(flags: UninstallFlags, ctx: UninstallCtx): Promise<{ exit: 0; text: string }> {
  const lines: string[] = [];
  lines.push(...(await stepPlugin(flags, ctx)));
  lines.push(...(await stepKey(flags, ctx)));
  lines.push(...(await stepData(flags, ctx)));
  lines.push(...(await stepCli(flags, ctx)));
  return { exit: 0, text: `${lines.join('\n')}\n` };
}
