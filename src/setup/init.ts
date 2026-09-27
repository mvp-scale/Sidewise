/**
 * `sidewise init`: makes the CLI reachable, gets a key stored somewhere real, wires up the Claude Code plugin,
 * and sets up the project's `.sidewise/` — the owner's hands-on install pass (lab/specs/2026-09-27-init-design.md)
 * found none of this worked out of the box. Idempotent (a re-run that finds a step already done says so and
 * changes nothing) and interactive by default; `--yes` takes the default answer everywhere. Every step prints
 * exactly one line: `✔ done`, `· already`, `– skipped (why)`, or `✖ problem → fix`.
 *
 * Every external effect (npm, claude, the OS keychain, a real prompt) comes in through `InitCtx`'s `runner`/
 * `io`/`keyStdin`, so a test drives the whole flow with no real process ever spawned and no real file outside a
 * temp dir ever touched.
 */
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { hasKey, resolveJevConfig } from '../classifier/typesafe/config.ts';
import { ensureDir, pathsFor } from '../ledger/paths.ts';
import { runDoctor } from '../verbs/doctor.ts';
import type { VerbResult } from '../verbs/types.ts';
import { writeInstallRecord, type InstallMode } from './install-record.ts';
import { resolveStoredKey, storeKey } from './keystore.ts';
import { detectSelfSpec, findOnPath, isWritableDir, npmGlobalPrefix } from './npm-info.ts';
import { addMarketplace, installPlugin, marketplaceExists, pluginStatus, type PluginScope } from './plugin.ts';
import { confirm, readHidden, readLine, readOneLine, type PromptIO } from './prompt.ts';
import type { Runner } from './runner.ts';

export interface InitFlags {
  mode?: InstallMode;
  claude?: boolean; // true: --claude, false: --no-claude, undefined: auto (use claude if it's on PATH)
  scope?: 'user' | 'project';
  key: 'ask' | 'stdin' | 'no';
  yes: boolean;
}

export interface InitCtx {
  env: Record<string, string | undefined>;
  cwd: string;
  platform: NodeJS.Platform;
  runner: Runner;
  io: PromptIO;
  /** Only read when flags.key === 'stdin'. */
  keyStdin?: NodeJS.ReadableStream;
  packageDir: string;
  pkg: { name: string; version: string };
  homeDir: string;
  now?: () => string;
}

const STATUS = { done: '✔', already: '·', skipped: '–', problem: '✖' } as const;
const nowIso = (ctx: InitCtx): string => (ctx.now ?? (() => new Date().toISOString()))();
const firstLine = (s: string): string => s.trim().split('\n')[0] ?? '';

/** Is `binPath` (resolved off PATH) actually a copy of the named package, not some other `sidewise`? Walks up
 *  from its realpath to the first package.json it finds — a bin file always sits 1-3 levels under the package
 *  root (dist/cli.js, or a bin symlink one level up again). */
function isPackageBin(binPath: string, pkgName: string): boolean {
  try {
    let dir = path.dirname(realpathSync(binPath));
    for (let i = 0; i < 6; i++) {
      const pj = path.join(dir, 'package.json');
      if (existsSync(pj)) {
        const meta = JSON.parse(readFileSync(pj, 'utf8')) as { name?: string };
        return meta.name === pkgName;
      }
      const up = path.dirname(dir);
      if (up === dir) return false;
      dir = up;
    }
  } catch {
    return false;
  }
  return false;
}

function defaultMode(cwd: string, prefixWritable: boolean): InstallMode {
  if (existsSync(path.join(cwd, 'package.json'))) return 'local';
  return prefixWritable ? 'global' : 'user';
}

async function stepCli(flags: InitFlags, ctx: InitCtx): Promise<string[]> {
  const onPath = findOnPath('sidewise', ctx.env, ctx.platform);
  if (onPath && isPackageBin(onPath, ctx.pkg.name) && !flags.mode) {
    return [`cli: ${STATUS.already} already reachable as ${onPath}`];
  }
  const prefix = npmGlobalPrefix(ctx.runner);
  const globalWritable = prefix ? isWritableDir(prefix) : false;
  const mode = flags.mode ?? defaultMode(ctx.cwd, globalWritable);
  const self = detectSelfSpec(ctx.packageDir, ctx.pkg);

  if (mode === 'global') {
    if (!globalWritable) {
      return [`cli: ${STATUS.problem} the global npm prefix needs sudo → re-run "sidewise init --user" instead (never runs sudo for you)`];
    }
    const r = ctx.runner('npm', ['install', '-g', self.spec]);
    if (r.status !== 0) return [`cli: ${STATUS.problem} npm install -g ${self.spec} failed → ${firstLine(r.stderr) || "see npm's own output"}`];
    writeInstallRecord(ctx.env, { mode: 'global', npmPrefix: prefix, installedAt: nowIso(ctx) });
    return [`cli: ${STATUS.done} installed --global (npm prefix ${prefix})`];
  }

  if (mode === 'user') {
    const userPrefix = path.join(ctx.homeDir, '.local');
    const r = ctx.runner('npm', ['install', '-g', '--prefix', userPrefix, self.spec]);
    if (r.status !== 0) return [`cli: ${STATUS.problem} npm install -g --prefix ${userPrefix} ${self.spec} failed → ${firstLine(r.stderr) || "see npm's own output"}`];
    writeInstallRecord(ctx.env, { mode: 'user', npmPrefix: userPrefix, installedAt: nowIso(ctx) });
    const bin = path.join(userPrefix, 'bin');
    const onPathNow = (ctx.env.PATH ?? '').split(path.delimiter).includes(bin);
    const lines = [`cli: ${STATUS.done} installed --user (npm prefix ${userPrefix})`];
    if (!onPathNow) lines.push(`cli: ${STATUS.problem} ${bin} is not on PATH → add this to your shell profile: export PATH="${bin}:$PATH"`);
    return lines;
  }

  // local
  const r = ctx.runner('npm', ['install', '-D', self.spec]);
  if (r.status !== 0) return [`cli: ${STATUS.problem} npm install -D ${self.spec} failed → ${firstLine(r.stderr) || "see npm's own output"}`];
  writeInstallRecord(ctx.env, { mode: 'local', projectDir: ctx.cwd, installedAt: nowIso(ctx) });
  return [`cli: ${STATUS.done} installed --local (run it as npx sidewise, in ${ctx.cwd})`];
}

async function stepKey(flags: InitFlags, ctx: InitCtx): Promise<string[]> {
  if (flags.key === 'no') return [`key: ${STATUS.skipped} skipped (--no-key)`];

  if (flags.key === 'ask') {
    const existing = resolveJevConfig(ctx.env, { resolveStored: () => resolveStoredKey(ctx.runner, ctx.platform, ctx.env) });
    if (hasKey(existing)) {
      const replace = flags.yes ? false : await confirm(`A key already resolves (from ${existing.keySource}). Replace it?`, false, ctx.io);
      if (!replace) return [`key: ${STATUS.already} already set (from ${existing.keySource})`];
    }
  }

  let secret: string;
  if (flags.key === 'stdin') {
    if (!ctx.keyStdin) return [`key: ${STATUS.skipped} skipped (--key-stdin given but nothing to read from)`];
    secret = (await readOneLine(ctx.keyStdin)).trim();
  } else if (flags.yes) {
    secret = '';
  } else {
    secret = (await readHidden('Paste your TypeSafe API key (input hidden; Enter to skip and use the free fake provider): ', ctx.io)).trim();
  }

  if (!secret) return [`key: ${STATUS.skipped} skipped (no key entered — the free fake provider will be used)`];
  if (/\s/u.test(secret)) return [`key: ${STATUS.problem} the pasted value has whitespace in it → paste just the key, with nothing else`];

  let provider: 'typesafe' | 'gateway' = 'typesafe';
  if (flags.key === 'ask' && !flags.yes) {
    const answer = (await readLine('Which provider is this key for? [typesafe/gateway] (default: typesafe): ', ctx.io)).trim().toLowerCase();
    if (answer === 'gateway') provider = 'gateway';
  }

  const stored = storeKey(ctx.runner, ctx.platform, ctx.env, provider, secret);
  return [`key: ${STATUS.done} stored in ${stored.detail} — checked on first real call`];
}

async function stepPlugin(flags: InitFlags, ctx: InitCtx): Promise<string[]> {
  if (flags.claude === false) return [`plugin: ${STATUS.skipped} skipped (--no-claude)`];
  const claudeOnPath = findOnPath('claude', ctx.env, ctx.platform) !== undefined;
  if (flags.claude !== true && !claudeOnPath) return [`plugin: ${STATUS.skipped} skipped (claude not found on PATH)`];

  const lines: string[] = [];
  if (!marketplaceExists(ctx.runner)) {
    const r = addMarketplace(ctx.runner, ctx.packageDir);
    lines.push(r.status === 0 ? `plugin: ${STATUS.done} added the mvp-scale marketplace` : `plugin: ${STATUS.problem} could not add the mvp-scale marketplace → ${firstLine(r.stderr)}`);
  } else {
    lines.push(`plugin: ${STATUS.already} mvp-scale marketplace already added`);
  }

  const scope: PluginScope = flags.scope ?? (flags.mode === 'local' ? 'project' : 'user');
  const status = pluginStatus(ctx.runner);
  if (status.installed && (status.scopes as string[]).includes(scope)) {
    lines.push(`plugin: ${STATUS.already} sidewise@mvp-scale already installed (${scope} scope)`);
    return lines;
  }
  const r = installPlugin(ctx.runner, scope);
  lines.push(r.status === 0 ? `plugin: ${STATUS.done} installed sidewise@mvp-scale (${scope} scope)` : `plugin: ${STATUS.problem} could not install the plugin → ${firstLine(r.stderr)}`);
  return lines;
}

function stepProject(ctx: InitCtx): string[] {
  if (!existsSync(path.join(ctx.cwd, '.git'))) return [`project: ${STATUS.skipped} skipped (not inside a git project)`];
  const paths = pathsFor(ctx.cwd);
  const already = existsSync(paths.dir);
  ensureDir(paths);
  return [`project: ${already ? STATUS.already : STATUS.done} ${already ? 'already has' : 'created'} .sidewise/ (self-ignoring: .sidewise/.gitignore)`];
}

export async function runInit(flags: InitFlags, ctx: InitCtx): Promise<VerbResult> {
  const lines: string[] = [];
  lines.push(...(await stepCli(flags, ctx)));
  lines.push(...(await stepKey(flags, ctx)));
  lines.push(...(await stepPlugin(flags, ctx)));
  lines.push(...stepProject(ctx));

  const insideProject = existsSync(path.join(ctx.cwd, '.git')) || existsSync(path.join(ctx.cwd, '.sidewise'));
  const doctorOut = runDoctor(ctx.env, insideProject ? pathsFor(ctx.cwd) : undefined, process.version, {
    resolveStored: () => resolveStoredKey(ctx.runner, ctx.platform, ctx.env),
    runner: ctx.runner,
    platform: ctx.platform,
  });

  const next = 'next: ask Claude to use Sidewise, or run "sidewise template class" to start by hand';
  return { exit: 0, text: `${lines.join('\n')}\n\n${doctorOut.text}\n${next}\n` };
}
