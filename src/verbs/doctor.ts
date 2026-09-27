/**
 * doctor: plumbing, not a verb (owner ruling, P5: the one exception to "no new tools"). Free — no classifier
 * call, no budget touched, no ledger write — so an agent can check what a real call WOULD do before spending
 * anything: which provider/route/base URL would answer, whether a key is set and where it came from (never its
 * value), the pinned model, whether a project/ledger is reachable from here, the Node/node:sqlite runtime, how
 * the CLI itself was installed, and whether the Claude Code plugin is set up. A bad config (a floating
 * JEV_MODEL, a bad SIDEWISE_BASE_URL) stops here at exit 2 with the exact same ✖ message a paid verb would
 * give, just without ever risking a spend to find it out.
 *
 * doctor is the one command cli.ts's own Node-version guard (util/node-version.ts) still runs on too old a
 * Node, rather than stopping outright: it reports the problem in the `node:`/`index:` fields below (instead of
 * every other command's own generic ✖ line) but still exits 2, same as they do — never a silent 0. [C-106]
 *
 * The `key`/`cli`/`plugin` lines, and the project line's "plugin enabled here", all take their real answer from
 * an injected `deps.resolveStored`/`deps.runner` — omitted (as every existing caller of this function still
 * does), they read conservatively (env-only key, "not on PATH", "not installed") rather than ever touching a
 * real keychain, npm or claude. Only cli.ts's own production call wires the real implementations
 * (setup/keystore.ts, setup/npm-info.ts, setup/plugin.ts).
 */
import path from 'node:path';
import { CHAOS_MODEL } from '../classifier/chaos.ts';
import { FAKE_MODEL } from '../classifier/fake.ts';
import { hasKey, JevConfigError, resolveJevConfig, routeLabel, type JevConfig, type ResolveStored } from '../classifier/typesafe/client.ts';
import { emit, m, type Value } from '../contract/emit.ts';
import { sqliteAvailable } from '../ledger/index.ts';
import type { SidewisePaths } from '../ledger/paths.ts';
import { envFilePath, looseFileModeWarning, readEnvFile } from '../setup/env-file.ts';
import { readInstallRecord } from '../setup/install-record.ts';
import { findOnPath } from '../setup/npm-info.ts';
import { pluginStatus } from '../setup/plugin.ts';
import type { Runner } from '../setup/runner.ts';
import { doctorNodeValue, DOCTOR_INDEX_TOO_OLD, nodeVersionOk } from '../util/node-version.ts';
import type { VerbResult } from './types.ts';

interface Identity {
  adapter: string;
  route: string;
  model: string;
  wireModel?: string;
  baseURL: string | null;
}

/** Same key-selection rule as selectProvider (select.ts), but never builds a client — this never calls out. */
function identityFor(env: Record<string, string | undefined>, config: JevConfig): Identity {
  const wanted = env.SIDEWISE_PROVIDER?.trim();
  if (wanted === 'chaos') return { adapter: 'chaos', route: 'chaos', model: CHAOS_MODEL, baseURL: null };
  const usingTypesafe = wanted === 'typesafe' || (wanted !== 'fake' && hasKey(config));
  if (!usingTypesafe) return { adapter: 'fake', route: 'fake', model: FAKE_MODEL, baseURL: null };
  const route = routeLabel(config);
  return {
    adapter: 'typesafe',
    route,
    model: config.model,
    baseURL: config.baseURL,
    ...(config.route === 'gateway' ? { wireModel: config.wireModel } : {}),
  };
}

const octal4 = (mode: number): string => mode.toString(8).padStart(4, '0');

/** Fix #18: the `actor:` value — every run/outcome defaults to `by: agent` unless SIDEWISE_ACTOR is set (the
 *  same fallback pay.ts's actorOf uses; duplicated rather than imported, matching this module's own low-
 *  dependency style). On a real MCP call, cli.ts's mcp wiring sets this from git's user.name (or "claude")
 *  before dispatch ever reaches here — see src/mcp/actor.ts — so this line shows what will actually be used. */
function actorLine(env: Record<string, string | undefined>): string {
  const set = env.SIDEWISE_ACTOR?.trim();
  return set || 'agent (default) → set SIDEWISE_ACTOR to change';
}

// Each of these builds the VALUE half only — emit()'s m() already renders "key: <value>" from the map entry,
// so a literal "key: " here would double up (caught by doctor.test.ts before this file ever shipped it).

/** The `key:` value, plus, when the env file's mode is looser than 0600 or it has an ignored line, a matching
 *  note. `deps.resolveStored` omitted (the default for every caller but cli.ts) never looks past env — see the
 *  module doc. */
function keyLine(env: Record<string, string | undefined>, config: JevConfig, deps: { resolveStored?: ResolveStored }): { value: string; note?: string } {
  if (!config.apiKey) return { value: 'no  → run "sidewise init" to add one' };
  if (config.keySource === 'keychain') {
    return { value: 'yes · from OS keychain (encrypted, per user)' };
  }
  if (config.keySource === 'file') {
    const file = envFilePath(env);
    const read = readEnvFile(file);
    const mode = read?.mode ?? 0o600;
    const note = read
      ? (looseFileModeWarning(file, mode) ?? (read.ignoredLines > 0 ? `✖ credentials: ${file} has ${read.ignoredLines} line(s) sidewise ignored (not "export NAME='value'" for an allowed name)` : undefined))
      : undefined;
    return { value: `yes · from user file ${file} (${octal4(mode)}, not encrypted)`, note };
  }
  // config.keySource === 'env' (or, for a bare call with no deps.resolveStored, simply undefined — env is the
  // only source it could have come from either way): a stored key elsewhere only matters for the note below.
  const envVar = config.route === 'gateway' ? 'AI_GATEWAY_API_KEY' : 'TYPESAFE_API_KEY';
  const stored = deps.resolveStored?.();
  return { value: `yes · from env ${envVar}${stored ? ' (overrides stored)' : ''}` };
}

/** The `cli:` value: where `sidewise` resolves on PATH (a pure, always-safe filesystem walk — never gated on
 *  deps), plus how init installed it, from install.json, when that record exists. */
function cliLine(env: Record<string, string | undefined>, platform: NodeJS.Platform): string {
  const resolved = findOnPath('sidewise', env, platform);
  const record = readInstallRecord(env);
  if (!resolved && !record) return 'not on PATH → run "sidewise init" to install it';
  const shown = resolved ?? '(not currently on PATH)';
  if (!record) return `${shown} · on PATH`;
  const flag = record.mode === 'global' ? '--global' : record.mode === 'user' ? '--user' : '--local';
  const detail = record.mode === 'local' ? `project ${record.projectDir ?? '?'}` : `npm prefix ${record.npmPrefix ?? '?'}`;
  return `${shown} · installed ${flag} (${detail})`;
}

/** The `plugin:` value. `deps.runner` omitted (every caller but cli.ts) never actually spawns `claude` — it
 *  reads the same as "not installed", which is also the honest answer when `claude` isn't on PATH at all. */
function pluginLine(deps: { runner?: Runner }): string {
  const status = deps.runner ? pluginStatus(deps.runner) : { installed: false, scopes: [] };
  if (!status.installed) return 'not installed → "sidewise init --claude"';
  return `sidewise@mvp-scale · ${status.scopes[0] ?? 'user'} scope`;
}

/** Using is per project (an owner ruling): the `project:` value names the root, then whether the plugin is
 *  enabled for THIS project specifically. `project` scope is already project-specific — checked from wherever
 *  this process runs, which is how Claude Code's own project scope is itself resolved. `user` scope counts too:
 *  a user-scope install applies to every project, this one included. `local` scope also ties to one project,
 *  but `claude plugin list --json`'s real shape carries no per-entry project path this task could verify (see
 *  setup/plugin.ts's own header comment on that) — rather than guess at an unconfirmed field, `local` is
 *  treated the same permissive way as `project`: a documented best-effort, not a real path match. */
function projectLine(root: string, deps: { runner?: Runner }): string {
  const status = deps.runner ? pluginStatus(deps.runner) : { installed: false, scopes: [] };
  const scopes = status.scopes as string[];
  const enabled = scopes.includes('project') || scopes.includes('user') || scopes.includes('local');
  return `${root} · plugin enabled here: ${enabled ? 'yes' : 'no'}`;
}

export function runDoctor(
  env: Record<string, string | undefined>,
  paths: SidewisePaths | undefined,
  nodeVersion: string = process.version,
  deps: { resolveStored?: ResolveStored; runner?: Runner; platform?: NodeJS.Platform } = {},
): VerbResult {
  let config: JevConfig;
  try {
    config = resolveJevConfig(env, { resolveStored: deps.resolveStored });
  } catch (e) {
    if (e instanceof JevConfigError) return { exit: 2, text: `${e.message}\n` };
    throw e;
  }

  const who = identityFor(env, config);
  const project = paths ? projectLine(path.relative(process.cwd(), paths.root) || '.', deps) : 'none';
  const { value: key, note: keyNote } = keyLine(env, config, deps);
  const notes = [
    'free: no call, no spend',
    ...(paths ? [] : ['no project found here or above → run inside one, or set SIDEWISE_HOME']),
    ...(keyNote ? [keyNote] : []),
  ];

  const doc = m(
    [
      'doctor',
      m(
        ['provider', who.adapter],
        ['route', who.route],
        ...(who.baseURL ? [['baseURL', who.baseURL] as [string, Value]] : []),
        ['model', who.model],
        ...(who.wireModel ? [['wireModel', who.wireModel] as [string, Value]] : []),
        ['key', key],
        ['project', project],
        ['actor', actorLine(env)],
        ['node', doctorNodeValue(nodeVersion)],
        ['index', nodeVersionOk(nodeVersion) ? (sqliteAvailable() ? 'node:sqlite' : 'unavailable (unexpected on Node 22.13+)') : DOCTOR_INDEX_TOO_OLD],
        ['cli', cliLine(env, deps.platform ?? process.platform)],
        ['plugin', pluginLine(deps)],
      ),
    ],
    ['notes', notes],
  );
  // Node < 22.13 (owner ruling): doctor still runs and reports it (the node:/index: fields above), but the
  // process exits 2 just like every other command's version stop — never a silent 0.
  return { exit: nodeVersionOk(nodeVersion) ? 0 : 2, text: emit(doc) };
}
