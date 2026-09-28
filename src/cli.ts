#!/usr/bin/env node
/**
 * The `sidewise` command: a thin shell over the verbs. Exit 0 ok · 1 provider or ledger error · 2 invalid
 * request or usage · 3 budget blocked. Answers go to stdout; stops and errors go to stderr.
 *
 * `runCli(argv, ctx)` is the whole dispatch, side-effect-injectable via `ctx`: it never touches real
 * `process.stdout`/`process.stderr`/`process.exitCode` or real stdin (fd 0) directly — it returns `{exit, text}`
 * instead, and the real entrypoint at the bottom of this file is the only place that writes it out for real.
 * This is what lets `sidewise mcp` (src/mcp/*) run the exact same dispatch in-process, with the MCP tool call's
 * own `stdin` string standing in for fd 0, with no second contract and no subprocess spawned per call.
 */
import { readFileSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs, type ParseArgsConfig } from 'node:util';
import { stringify } from 'yaml';
import pkg from '../package.json' with { type: 'json' };
import { BudgetError, budgetLine, loadBudget, resetBudget, setBudget } from './budget/budget.ts';
import type { ClassifierPort } from './classifier/port.ts';
import { selectProvider } from './classifier/select.ts';
import { JevConfigError } from './classifier/typesafe/config.ts';
import { RUN_ID } from './ledger/ids.ts';
import { LockError, StoreError } from './ledger/lock.ts';
import { appendOutcome, findRun, isContractRun, LedgerError, type Outcome } from './ledger/log.ts';
import { resolvePaths, type SidewisePaths } from './ledger/paths.ts';
import type { Level } from './lens/request.ts';
import { runMcpServer, type McpIo } from './mcp/stdio.ts';
import { resolveStoredKey } from './setup/keystore.ts';
import { runInit, type InitFlags } from './setup/init.ts';
import { realRunner } from './setup/runner.ts';
import type { Runner } from './setup/runner.ts';
import type { PromptIO } from './setup/prompt.ts';
import { runUninstall, type UninstallFlags } from './setup/uninstall.ts';
import { runChange } from './verbs/change.ts';
import { runClass } from './verbs/class.ts';
import { runDoctor } from './verbs/doctor.ts';
import { runDrill } from './verbs/drill.ts';
import { runLoop } from './verbs/loop.ts';
import { runReport } from './verbs/report.ts';
import { runScan } from './verbs/scan.ts';
import { runTemplate } from './verbs/template.ts';
import { runView } from './verbs/view.ts';
import { AGENT_EXTRAS, runAgent } from './help/agent.ts';
import { agentFrontDoorLines } from './help/card.ts';
import { HELP_EXTRAS, HELP_TOPICS, runHelp } from './help/index.ts';
import { VERBS } from './contract/types.ts';
import { resolveMcpActor } from './mcp/actor.ts';
import { nodeVersionStop } from './util/node-version.ts';
import { clip, hasControlChars } from './util/text.ts';

// This package's own root directory (one level above dist/cli.js, or src/cli.ts in dev): init passes it to
// `claude plugin marketplace add`, and reads its own package-lock.json's neighbourhood to detect a local
// tarball install (setup/npm-info.ts's detectSelfSpec).
const PACKAGE_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

// The warning filter for node:sqlite's one ExperimentalWarning (Node 22/24) is installed by ledger/index.ts
// itself, at that module's own top level, before its lazy `import('node:sqlite')` — not here. ESM evaluates an
// imported module's top-level code (all of index.ts, transitively via log.ts above) before this module's own
// remaining statements run, so a process.on('warning', ...) call in this file would already be too late to
// catch a warning index.ts's own top-level await triggers. See ledger/index.ts's isSqliteExperimentalWarning.

// One usage line per command: a usage mistake prints the problem and just the line for that command.
const LINES = {
  view: 'sidewise view <folder | tag | SW-#### | request-file | -> [--level 1|2|3] [--summary]',
  class: 'sidewise class <request-file | -> [--dry-run]',
  change: 'sidewise change <request-file | -> [--dry-run]  ·  or: sidewise change --parent SW-#### --compare <before>..<after> [--dry-run]',
  scan: 'sidewise scan <request-file | -> [--dry-run]',
  drill: 'sidewise drill <request-file | -> [--dry-run]',
  loop: 'sidewise loop <request-file | -> [--dry-run]',
  template:
    'sidewise template <view|class|change|scan|drill|loop> [--parent SW-#### --from <item-or-category>]  ·  or: --from <request.yaml> [--where <path>]... [--goal <text>]',
  help: `sidewise help [${VERBS.join('|')}|${HELP_TOPICS.join('|')}|${HELP_EXTRAS.join('|')}]`,
  agent: `sidewise agent [${VERBS.join('|')}|${AGENT_EXTRAS.join('|')}]`,
  report: 'sidewise report [hits|patterns|history]',
  outcome: 'sidewise outcome <SW-####> held|overruled|failed --by <actor>',
  budget: 'sidewise budget [show | reset | set --usd <n> --runs <n>]',
  doctor: 'sidewise doctor',
  init: 'sidewise init [--global | --user | --local] [--claude | --no-claude] [--scope user|project] [--key-stdin | --no-key] [--yes]',
  uninstall: 'sidewise uninstall [--all] [--keep-key] [--keep-data] [--yes]',
  mcp: 'sidewise mcp',
} as const;
type Command = keyof typeof LINES;
// A bare usage list is unhelpful to someone who has never run this before, and round-4 smoke testing found a
// cold CLI agent makes zero `sidewise` calls at all otherwise — it never discovers `sidewise agent` exists.
// `agentFrontDoorLines()` (help/card.ts) gives, in order: the agent-first directive, the `new here?` hint for a
// human, this tool's own one-line pitch, then a purpose bullet per verb — all shared with `agent`'s overview and
// `help`'s own card, never a second hand-typed copy. [C-191]
const USAGE = `${agentFrontDoorLines().join('\n')}\nusage:\n${Object.values(LINES).map((l) => `  ${l}`).join('\n')}`;
const isCommand = (c: string): c is Command => Object.hasOwn(LINES, c);

// The six verbs plus the four tools `sidewise agent` also carries a card for (report/outcome/budget/template) —
// every other command (help, agent, doctor, init, uninstall, mcp) has no agent card to point at, so a stop from
// one of those never gets the pointer below. Every stop a REQUEST can trigger already ends with this same
// pointer via verbs/request.ts's `stopText` (C-153); the additions here close the remaining gaps that never run
// through that path — a bare CLI usage mistake, a request file cli.ts itself couldn't even read, a missing
// project, and outcome/budget's own argument checks.
const AGENT_POINTABLE = new Set<Command>([...VERBS, 'report', 'outcome', 'budget', 'template']);
const withAgentPointer = (text: string, command: Command): string => (AGENT_POINTABLE.has(command) ? `${text}\n→ see: sidewise agent ${command}` : text);

/** A usage mistake: exit 2 with "✖ args: <problem> → <that command's usage line>", plus the same agent pointer
 *  every other stop ends with, when `command` is one `sidewise agent` actually has a card for. */
class UsageStop extends Error {
  constructor(command: Command, problem: string) {
    super(withAgentPointer(`✖ args: ${problem} → ${LINES[command]}`, command));
    this.name = 'UsageStop';
  }
}

const OUTCOMES: readonly string[] = ['held', 'overruled', 'failed'];
const NO_PROJECT = '✖ project: no .sidewise or .git folder here or above → run inside a project, or "mkdir .sidewise" to start one here';
const MAX_REQUEST_BYTES = 1_048_576;
const TOO_BIG = '✖ request: larger than 1 MB → a request is a short text file; point "where:" at the code instead';

/** Every existing call site prints text with no trailing newline (USAGE, a stop, budgetLine, the outcome
 *  confirmation); every contract response already ends in one (respondText/dryRunText). Add it only when
 *  missing. Pure: builds the `{exit, text}` result runCli returns — writing it out for real is the caller's job
 *  (the bottom of this file for the real CLI, src/mcp/* for a tool call), so this never touches process.* itself. */
function finish(code: number, text: string): { exit: number; text: string } {
  return { exit: code, text: text.endsWith('\n') ? text : `${text}\n` };
}

/** parseArgs, or a UsageStop naming the unknown flag, the missing value or the extra argument. */
function args<T extends ParseArgsConfig>(command: Command, config: T): ReturnType<typeof parseArgs<T>> {
  try {
    return parseArgs(config);
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    const quoted = /'([^']*)'/.exec((e as Error).message)?.[1] ?? '';
    if (code === 'ERR_PARSE_ARGS_UNKNOWN_OPTION') throw new UsageStop(command, `unknown flag ${clip(quoted, 40)}`);
    if (code === 'ERR_PARSE_ARGS_INVALID_OPTION_VALUE') throw new UsageStop(command, `${quoted.split(' ')[0]} needs a value`);
    if (code === 'ERR_PARSE_ARGS_UNEXPECTED_POSITIONAL') throw new UsageStop(command, `extra argument "${clip(quoted, 40)}"`);
    throw new UsageStop(command, 'bad arguments');
  }
}

/** Exactly `min`..`max` positionals, or a UsageStop. */
function positionalCount(command: Command, positionals: readonly string[], min: number, max: number): void {
  if (positionals.length < min) throw new UsageStop(command, 'missing arguments');
  if (positionals.length > max) throw new UsageStop(command, `extra argument "${clip(positionals[max]!, 40)}"`);
}

/** A flag given twice is a stop, not last-wins: "--by a --by b" must never quietly pick one. */
function givenTwice(argv: readonly string[], names: readonly string[]): string | undefined {
  const name = names.find((n) => argv.filter((a) => a === `--${n}` || a.startsWith(`--${n}=`)).length > 1);
  return name === undefined ? undefined : `✖ --${name}: given twice → give it once`;
}

/** The request text, or a stop: a folder, a missing file, over 1 MB, or binary. `stdinSource` stands in for fd
 *  0 when `file === '-'` — the real CLI reads real stdin; the MCP path hands back the tool call's own `stdin`
 *  string instead, so a `-` positional means the same thing either way. */
function readRequest(file: string, stdinSource: () => Buffer): { text: string } | { stop: string } {
  if (hasControlChars(file)) return { stop: '✖ request: the file name has control characters → pass a plain path, or - to read stdin' };
  const shown = clip(file, 60);
  let bytes: Buffer;
  try {
    if (file !== '-') {
      const st = statSync(file);
      if (st.isDirectory()) return { stop: `✖ request: ${shown} is a folder → pass a request file, or - to read stdin` };
      if (st.size > MAX_REQUEST_BYTES) return { stop: TOO_BIG };
    }
    bytes = file === '-' ? stdinSource() : readFileSync(file);
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') return { stop: `✖ request: ${shown} not found → check the path, or pass - to read stdin` };
    return { stop: `✖ request: cannot read ${shown} (${code ?? 'error'}) → check the path and its permissions` };
  }
  if (bytes.length > MAX_REQUEST_BYTES) return { stop: TOO_BIG };
  if (bytes.includes(0)) return { stop: `✖ request: ${file === '-' ? 'stdin' : shown} is binary, not text → write the request as YAML, starting "side:"` };
  return { text: bytes.toString('utf8') };
}

const BUDGET_EXAMPLE = 'e.g. sidewise budget set --usd 5 --runs 500';

/** A --usd/--runs value as a positive finite number, or a stop naming the bad value. */
function cap(flag: string, raw: string): number | string {
  const n = Number(raw);
  return raw.trim() !== '' && Number.isFinite(n) && n > 0 ? n : `✖ budget: --${flag} must be a positive number, got "${raw}" → ${BUDGET_EXAMPLE}`;
}

const RUNNERS = { class: runClass, scan: runScan, drill: runDrill, loop: runLoop } as const;

// Item H (batch G): a key stored in the OS keychain or the user file (~/.config/sidewise/env), with no env
// var set, must behave identically everywhere a provider is chosen or identified — not just in doctor/agent,
// which already pass this same lookup. One helper, reused at every call site below, so a future provider- or
// identity-selection call can't be added without it by accident the way selectProvider/providerIdentity were.
const resolveStoredFor = (c: CliCtx) => () => resolveStoredKey(c.runner, c.platform, c.env);

/** Most provider-selection failures (no key) are bucketed as provider errors (exit 1); a JevConfigError can
 *  instead carry exit 2 — a bad SIDEWISE_BASE_URL is a config mistake to fix, not a runtime provider failure. */
const providerExit = (e: unknown): 1 | 2 => (e instanceof JevConfigError ? e.exit : 1);

/** Everything a dispatch needs instead of reaching for `process.*` directly, so the same dispatch runs for real
 *  (the bottom of this file, with real streams) or in-process for an MCP tool call (src/mcp/stdio.ts, with the
 *  tool call's own `stdin` string and no real stdout/stderr ever touched). `io` is only exercised by `init`/
 *  `uninstall`'s interactive prompts — the MCP path gives them a stream that closes immediately, so a stray
 *  `args: ["init"]` resolves with skipped/default answers instead of hanging the server. */
export interface CliCtx {
  env: Record<string, string | undefined>;
  cwd: string;
  platform: NodeJS.Platform;
  runner: Runner;
  packageDir: string;
  pkg: { name: string; version: string };
  homeDir: string;
  /** `process.version`-shaped ("v22.13.0") — injectable so a test never depends on the machine's own Node
   *  (see util/node-version.ts's guard, checked at the top of dispatch). */
  nodeVersion: string;
  stdin: () => Buffer;
  io: PromptIO;
}

/** class, scan, drill and loop share one shape: a request file (or -), optional --dry-run. */
async function runSweptVerb(command: keyof typeof RUNNERS, rest: string[], paths: SidewisePaths, ctx: CliCtx): Promise<{ exit: number; text: string }> {
  const twice = givenTwice(rest, ['dry-run']);
  if (twice) return finish(2, withAgentPointer(twice, command));
  const { values, positionals } = args(command, { args: rest, allowPositionals: true, options: { 'dry-run': { type: 'boolean', default: false } } });
  positionalCount(command, positionals, 1, 1);
  const read = readRequest(positionals[0]!, ctx.stdin);
  if ('stop' in read) return finish(2, withAgentPointer(read.stop, command));
  let provider: ClassifierPort;
  try {
    provider = selectProvider(ctx.env, { chaosState: path.join(paths.dir, 'chaos.json'), resolveStored: resolveStoredFor(ctx) });
  } catch (e) {
    return finish(providerExit(e), (e as Error).message);
  }
  const r = await RUNNERS[command](read.text, { paths, provider, env: ctx.env, dryRun: values['dry-run'], resolveStored: resolveStoredFor(ctx) });
  return finish(r.exit, r.text);
}

/** The whole dispatch, exhaustive over `Command` by construction: every branch returns `{exit, text}`, and
 *  nothing here ever touches `process.*` — see the module doc and `CliCtx`. */
async function dispatch(argv: string[], ctx: CliCtx): Promise<{ exit: number; text: string }> {
  const [command = '', ...rest] = argv;
  if (command === '') return finish(2, USAGE);
  if (command === '--help' || command === '-h') return finish(0, USAGE);
  if (command === '--version' || command === '-v') return finish(0, ctx.pkg.version);
  if (!isCommand(command)) {
    const later = argv.find(isCommand);
    if (command.startsWith('-') && later) throw new UsageStop(later, `"${clip(command, 40)}" comes before the command`);
    return finish(2, `✖ args: "${clip(command, 40)}" is not a command → use view, class, change, scan, drill, loop, template, help, agent, report, outcome, budget, doctor, init, uninstall or mcp (sidewise --help)`);
  }

  // "<command> --help"/"-h" is answered here, generically, for every command, before that command's own
  // parseArgs ever sees it — otherwise a command with no --help option of its own (every one of them; none
  // defines a -h shorthand) would reject it as an unknown flag (this is what "doctor --help" used to do).
  // Only the six verbs have a deeper per-verb page (help <verb> / agent <verb> — see src/help/index.ts and
  // src/help/agent.ts); every other command (help, agent, report, outcome, budget, doctor, init, uninstall,
  // mcp, template) has no such page today, so it gets just its usage line, not a pointer to a page that
  // doesn't exist. Runs ahead of the Node-version guard below: like the bare --help/-h above, this never
  // spends or touches the ledger, so it's free even on too old a Node.
  if (rest.includes('--help') || rest.includes('-h')) {
    const seeMore = (VERBS as readonly string[]).includes(command) ? `\n→ see: sidewise help ${command} · sidewise agent ${command}` : '';
    return finish(0, `${LINES[command]}${seeMore}`);
  }

  // Node ≥ 22.13 is a hard requirement: everything but `doctor` (which still runs and reports the problem,
  // see below) and `mcp` (which must still start the server and answer initialize/tools/list — its own
  // tools/call wrapper below applies this same guard to every actual call) stops here.
  if (command !== 'doctor' && command !== 'mcp') {
    const nodeStop = nodeVersionStop(ctx.nodeVersion);
    if (nodeStop) return finish(2, nodeStop);
  }

  // template needs no project to run: it never spends and never writes. When --parent is given, it still tries
  // a project (to shape the sample to that run) but never insists on one — no project, or the id not in its
  // ledger, just falls back to the sweep sample (runTemplate's own drillSampleFile).
  if (command === 'template') {
    const twice = givenTwice(rest, ['parent', 'from', 'goal']);
    if (twice) return finish(2, withAgentPointer(twice, command));
    const { values, positionals } = args('template', {
      args: rest,
      allowPositionals: true,
      options: { parent: { type: 'string' }, from: { type: 'string' }, where: { type: 'string', multiple: true }, goal: { type: 'string' } },
    });
    positionalCount('template', positionals, 1, 1);
    const r = runTemplate(
      positionals[0]!,
      { parent: values.parent, from: values.from, where: values.where, goal: values.goal },
      resolvePaths(ctx.cwd, ctx.env),
      ctx.packageDir,
    );
    return finish(r.exit, r.text);
  }

  // help: free, no project needed, never spends or writes — same free-standing shape as
  // template/doctor above. `help` alone is the one-screen contract card; `help <verb>` or `help <topic>` goes
  // deeper (src/help/*).
  if (command === 'help') {
    const { positionals } = args('help', { args: rest, allowPositionals: true, options: {} });
    positionalCount('help', positionals, 0, 1);
    const r = runHelp(positionals[0]);
    return finish(r.exit, r.text);
  }

  // agent: help's terse, agent-facing twin — same free-standing shape, no project needed, never spends or
  // writes. `agent` alone is the universal rules and the verb list; `agent <verb>` goes dense per verb
  // (src/help/agent.ts). Every request-validation stop's "→ see:" pointer names this, not help (request.ts).
  if (command === 'agent') {
    const { positionals } = args('agent', { args: rest, allowPositionals: true, options: {} });
    positionalCount('agent', positionals, 0, 1);
    const r = runAgent(positionals[0], ctx.env, { resolveStored: () => resolveStoredKey(ctx.runner, ctx.platform, ctx.env) });
    return finish(r.exit, r.text);
  }

  // doctor needs no project either: it reports whether one is found rather than insisting on one, and it
  // never spends or writes — free, so it never has to wait for preflight's own project/budget/ledger checks.
  if (command === 'doctor') {
    const { positionals } = args('doctor', { args: rest, allowPositionals: true, options: {} });
    positionalCount('doctor', positionals, 0, 0);
    const r = runDoctor(ctx.env, resolvePaths(ctx.cwd, ctx.env), ctx.nodeVersion, {
      resolveStored: () => resolveStoredKey(ctx.runner, ctx.platform, ctx.env),
      runner: ctx.runner,
      platform: ctx.platform,
    });
    return finish(r.exit, r.text);
  }

  // mcp: a stdio MCP server, run until the client (or real stdin) closes, then exit 0. No project needed up
  // front — each tool call re-enters this same dispatch and resolves its own project as normal.
  if (command === 'mcp') {
    const { positionals } = args('mcp', { args: rest, allowPositionals: true, options: {} });
    positionalCount('mcp', positionals, 0, 0);
    // initialize/tools/list/ping (protocol.ts) never call runOne, so they answer normally even on too old a
    // Node — a client's handshake never hangs. Every real tools/call does go through runOne: on too old a
    // Node this returns the same ✖ line as isError, for ANY requested command (doctor included) — checked
    // once per call, before dispatch even runs, so Claude tells the user instead of the call silently using a
    // degraded ledger.
    await runMcpServer(
      ctx.io as McpIo,
      (a, stdinText, project) => {
        const nodeStop = nodeVersionStop(ctx.nodeVersion);
        if (nodeStop) return Promise.resolve(finish(2, nodeStop));
        // runCli, not dispatch: dispatch can throw (LedgerError/BudgetError/UsageStop/...), and protocol.ts's
        // own tools/call catch would then re-wrap an already-formed "✖ field: ..." message as "✖ sidewise:
        // ...", doubling the glyph. runCli's own catch normalizes every throw into one clean {exit, text}
        // first, exactly like the real CLI entrypoint at the bottom of this file. [C-140]
        //
        // `project` (from the tool call's own arguments) stands in for SIDEWISE_HOME for this one call — the
        // plugin's own cwd is wherever Claude launched, not necessarily the project. The plugin never sets
        // SIDEWISE_ACTOR, so without this every run/outcome would come through as `by: agent`; default an
        // MCP-driven call to "claude" instead (never a git identity — see src/mcp/actor.ts for why), but only
        // when the caller hasn't already set one — an explicit value must still win.
        const env = { ...ctx.env };
        if (project) env.SIDEWISE_HOME = project;
        if (!env.SIDEWISE_ACTOR?.trim()) env.SIDEWISE_ACTOR = resolveMcpActor();
        return runCli(a, { ...ctx, env, stdin: () => Buffer.from(stdinText ?? '', 'utf8') });
      },
      ctx.pkg.version,
    );
    return { exit: 0, text: '' };
  }

  // init/uninstall need no project up front either: they check process.cwd() for a git project themselves
  // (init's per-project steps; uninstall's .sidewise/ step), rather than resolvePaths()'s upward walk.
  if (command === 'init') {
    const twice = givenTwice(rest, ['scope']);
    if (twice) return finish(2, twice);
    const { values, positionals } = args('init', {
      args: rest,
      allowPositionals: true,
      options: {
        global: { type: 'boolean', default: false },
        user: { type: 'boolean', default: false },
        local: { type: 'boolean', default: false },
        claude: { type: 'boolean', default: false },
        'no-claude': { type: 'boolean', default: false },
        scope: { type: 'string' },
        'key-stdin': { type: 'boolean', default: false },
        'no-key': { type: 'boolean', default: false },
        yes: { type: 'boolean', default: false },
      },
    });
    positionalCount('init', positionals, 0, 0);
    if ([values.global, values.user, values.local].filter(Boolean).length > 1) {
      return finish(2, '✖ init: give at most one of --global, --user or --local');
    }
    if (values.claude && values['no-claude']) return finish(2, '✖ init: give at most one of --claude or --no-claude');
    if (values['key-stdin'] && values['no-key']) return finish(2, '✖ init: give at most one of --key-stdin or --no-key');
    if (values.scope !== undefined && values.scope !== 'user' && values.scope !== 'project') {
      return finish(2, `✖ --scope: "${clip(values.scope, 20)}" is not user or project → use --scope user or --scope project`);
    }
    const flags: InitFlags = {
      mode: values.global ? 'global' : values.user ? 'user' : values.local ? 'local' : undefined,
      claude: values.claude ? true : values['no-claude'] ? false : undefined,
      scope: values.scope as 'user' | 'project' | undefined,
      key: values['key-stdin'] ? 'stdin' : values['no-key'] ? 'no' : 'ask',
      yes: values.yes,
    };
    const r = await runInit(flags, {
      env: ctx.env,
      cwd: ctx.cwd,
      platform: ctx.platform,
      runner: ctx.runner,
      io: ctx.io,
      keyStdin: flags.key === 'stdin' ? ctx.io.input : undefined,
      packageDir: ctx.packageDir,
      pkg: ctx.pkg,
      homeDir: ctx.homeDir,
    });
    return finish(r.exit, r.text);
  }

  if (command === 'uninstall') {
    const { values, positionals } = args('uninstall', {
      args: rest,
      allowPositionals: true,
      options: {
        all: { type: 'boolean', default: false },
        'keep-key': { type: 'boolean', default: false },
        'keep-data': { type: 'boolean', default: false },
        yes: { type: 'boolean', default: false },
      },
    });
    positionalCount('uninstall', positionals, 0, 0);
    const flags: UninstallFlags = { all: values.all, keepKey: values['keep-key'], keepData: values['keep-data'], yes: values.yes };
    const r = await runUninstall(flags, {
      env: ctx.env,
      cwd: ctx.cwd,
      platform: ctx.platform,
      runner: ctx.runner,
      io: ctx.io,
      homeDir: ctx.homeDir,
      pkgName: ctx.pkg.name,
    });
    return finish(r.exit, r.text);
  }

  const paths = resolvePaths(ctx.cwd, ctx.env);
  if (!paths) return finish(2, withAgentPointer(NO_PROJECT, command));
  switch (command) {
    case 'view': {
      const twice = givenTwice(rest, ['level']);
      if (twice) return finish(2, withAgentPointer(twice, command));
      const { values, positionals } = args('view', {
        args: rest,
        allowPositionals: true,
        options: { level: { type: 'string', default: '1' }, summary: { type: 'boolean', default: false } },
      });
      positionalCount('view', positionals, 1, 1);
      if (!['1', '2', '3'].includes(values.level)) {
        return finish(2, withAgentPointer(`✖ --level: "${clip(values.level, 20)}" is not a level → use --level 1, 2 or 3`, command));
      }
      const arg = positionals[0]!;
      // `arg` is always the thing the caller actually named — never overwritten by a file's own bytes. `content`
      // (whatever text was actually read for it, if any) is passed separately so runView can probe it for
      // request mode without ever mistaking a real source file's own content for a garbled place/id.
      let content: string | undefined;
      if (arg === '-') {
        content = ctx.stdin().toString('utf8');
      } else {
        try {
          if (statSync(arg).isFile()) content = readFileSync(arg, 'utf8');
        } catch {
          // not a file: treat arg itself as the place/id
        }
      }
      const r = runView(arg, Number(values.level) as Level, { paths, env: ctx.env, resolveStored: resolveStoredFor(ctx) }, content, values.summary);
      return finish(r.exit, r.text);
    }
    case 'report': {
      const { positionals } = args('report', { args: rest, allowPositionals: true, options: {} });
      positionalCount('report', positionals, 0, 1);
      const r = runReport(positionals[0], { paths, env: ctx.env, runner: ctx.runner, platform: ctx.platform });
      return finish(r.exit, r.text);
    }
    case 'class':
    case 'scan':
    case 'drill':
    case 'loop':
      return runSweptVerb(command, rest, paths, ctx);
    case 'change': {
      const twice = givenTwice(rest, ['dry-run', 'parent', 'compare', 'expect']);
      if (twice) return finish(2, withAgentPointer(twice, command));
      const { values, positionals } = args('change', {
        args: rest,
        allowPositionals: true,
        options: { 'dry-run': { type: 'boolean', default: false }, parent: { type: 'string' }, compare: { type: 'string' }, expect: { type: 'string' } },
      });
      const usingFlags = values.parent !== undefined || values.compare !== undefined;
      let text: string;
      if (usingFlags) {
        if (values.parent === undefined || values.compare === undefined) {
          return finish(2, withAgentPointer('✖ --parent/--compare: give both, or neither → sidewise change --parent SW-#### --compare <before>..<after>', command));
        }
        positionalCount('change', positionals, 0, 0);
        const sep = values.compare.indexOf('..');
        if (sep <= 0 || sep >= values.compare.length - 2) {
          return finish(2, withAgentPointer(`✖ --compare: "${clip(values.compare, 60)}" is not <before>..<after> → e.g. --compare main..HEAD`, command));
        }
        // The goal comes from the parent run itself (not a fixed placeholder): a real parent's own goal is what
        // "did the fix work?" is asking about. When the parent can't supply one (missing, or predates the
        // contract), the placeholder is never read — runChange's own findRun/isContractRun checks bail first.
        const parentRun = findRun(paths, values.parent);
        const goal = parentRun && isContractRun(parentRun) ? parentRun.goal : 'The change works';
        // expect: (plan 2b, required): --expect names specific concerns (comma-separated) this change should
        // turn to pass — the agent's own prediction, never a default. Omitting it defeats the point (the agent
        // must actually predict), so the flag form requires it exactly like the file form's schema does.
        const expect = values.expect
          ? values.expect.split(',').map((s) => s.trim()).filter(Boolean)
          : [];
        if (expect.length === 0) {
          const concernNames = parentRun && isContractRun(parentRun) ? parentRun.ask.categories.filter((c) => c.section !== 'decisions').map((c) => c.name) : [];
          const sample = concernNames.length > 0 ? concernNames.join(',') : 'injection,guards';
          return finish(
            2,
            withAgentPointer(`✖ --expect: name the concerns this change should fix → sidewise change --parent SW-#### --compare <before>..<after> --expect ${sample}`, command),
          );
        }
        text = stringify({ side: { goal, parent: values.parent, compare: { before: values.compare.slice(0, sep), after: values.compare.slice(sep + 2) }, expect } });
      } else {
        positionalCount('change', positionals, 1, 1);
        const read = readRequest(positionals[0]!, ctx.stdin);
        if ('stop' in read) return finish(2, withAgentPointer(read.stop, command));
        text = read.text;
      }
      let provider: ClassifierPort;
      try {
        provider = selectProvider(ctx.env, { chaosState: path.join(paths.dir, 'chaos.json'), resolveStored: resolveStoredFor(ctx) });
      } catch (e) {
        return finish(providerExit(e), (e as Error).message);
      }
      const r = await runChange(text, { paths, provider, env: ctx.env, dryRun: values['dry-run'], resolveStored: resolveStoredFor(ctx) });
      return finish(r.exit, r.text);
    }
    case 'outcome': {
      const twice = givenTwice(rest, ['by']);
      if (twice) return finish(2, withAgentPointer(twice, command));
      const { values, positionals } = args('outcome', { args: rest, allowPositionals: true, options: { by: { type: 'string' } } });
      positionalCount('outcome', positionals, 2, 2);
      const [id = '', outcome = ''] = positionals;
      if (!RUN_ID.test(id)) {
        return finish(2, withAgentPointer(`✖ outcome: "${clip(id, 40)}" is not a run id → use the SW-#### that class printed, e.g. SW-0001`, command));
      }
      if (!OUTCOMES.includes(outcome)) {
        return finish(2, withAgentPointer(`✖ outcome: "${clip(outcome, 40)}" is not an outcome → use held, overruled or failed`, command));
      }
      const by = values.by?.trim();
      if (!by) return finish(2, withAgentPointer('✖ --by: missing → add --by <who judged the run>', command));
      const { record, repeat } = appendOutcome(paths, id, outcome as Outcome, by);
      return finish(0, `sidewise outcome ${record.of} ${record.outcome} · ${repeat ? 'already recorded ' : ''}by ${record.by}`);
    }
    case 'budget': {
      const [sub = 'show', ...more] = rest;
      if (sub === 'show' || sub === 'reset') {
        positionalCount('budget', more, 0, 0);
        if (sub === 'show') return finish(0, budgetLine(loadBudget(paths).state));
        return finish(0, `reset · ${budgetLine(resetBudget(paths))}`);
      }
      if (sub !== 'set') throw new UsageStop('budget', `"${clip(sub, 40)}" is not show, reset or set`);
      const twice = givenTwice(more, ['usd', 'runs']);
      if (twice) return finish(2, withAgentPointer(twice, command));
      const { usd, runs } = args('budget', { args: more, options: { usd: { type: 'string' }, runs: { type: 'string' } } }).values;
      if (usd === undefined && runs === undefined) return finish(2, withAgentPointer(`✖ budget: set needs --usd or --runs → ${BUDGET_EXAMPLE}`, command));
      const capUsd = usd === undefined ? undefined : cap('usd', usd);
      const capRuns = runs === undefined ? undefined : cap('runs', runs);
      const stops = [capUsd, capRuns].filter((v): v is string => typeof v === 'string');
      if (stops.length) return finish(2, withAgentPointer(stops.join('\n'), command));
      const caps = {
        ...(typeof capUsd === 'number' ? { capUsd } : {}),
        ...(typeof capRuns === 'number' ? { capRuns } : {}),
      };
      return finish(0, `set · ${budgetLine(setBudget(paths, caps))}`);
    }
  }
  // Unreachable by construction: `Command` minus the early-return branches above is exactly this switch's case
  // list. Kept only so `dispatch`'s return type stays `{exit, text}` on every path, including a future Command
  // added to LINES without a matching case here.
  return finish(1, `✖ sidewise: internal: unhandled command "${command}"`);
}

/**
 * The whole CLI, side-effect-injectable: never touches real `process.*` — see `CliCtx` and the module doc.
 * Every failure (a thrown UsageStop/BudgetError/LedgerError/JevConfigError/LockError/StoreError, or anything
 * else) is mapped here to the same one-line-on-stderr shape the real CLI has always produced, so the MCP path
 * (src/mcp/*) gets identical error handling with no second copy of this mapping.
 */
export async function runCli(argv: string[], ctx: CliCtx): Promise<{ exit: number; text: string }> {
  try {
    return await dispatch(argv, ctx);
  } catch (e: unknown) {
    if (e instanceof UsageStop) return finish(2, e.message);
    if (e instanceof BudgetError) return finish(3, e.message);
    if (e instanceof LedgerError) return finish(e.exit, e.message);
    if (e instanceof JevConfigError) return finish(e.exit, e.message);
    if (e instanceof LockError || e instanceof StoreError) return finish(1, e.message);
    const text = (e instanceof Error ? e.message : String(e)).split('\n')[0]!.slice(0, 200);
    return finish(1, `✖ sidewise: ${text} → retry; if it repeats, report it with the command you ran`);
  }
}

/** The real ctx: real env/cwd/platform, the real runner, real stdin/stdout for prompts, and fd 0 for a `-`
 *  positional — used only by the real entrypoint below, never by a test (which builds its own CliCtx).
 *  `io` is a GETTER, not a plain field: merely referencing `process.stdin` (even without reading from it) makes
 *  Node initialize it as a stream, which then fights a later synchronous `readFileSync(0)` for a large piped
 *  request (`class -` on >1 MB of stdin threw EAGAIN once `io` was built eagerly for every command — verified
 *  directly). A command that never touches `ctx.io` (class, doctor, template, ...) must never touch
 *  `process.stdin` either, exactly like before this refactor. */
function realCtx(): CliCtx {
  return {
    env: process.env,
    cwd: process.cwd(),
    platform: process.platform,
    runner: realRunner,
    packageDir: PACKAGE_DIR,
    pkg: { name: pkg.name, version: pkg.version },
    homeDir: os.homedir(),
    nodeVersion: process.version,
    stdin: () => readFileSync(0),
    get io(): PromptIO {
      return { input: process.stdin, output: process.stdout };
    },
  };
}

// Only run for real when this file is the process's own entrypoint (`node dist/cli.js ...` / `node
// bin/sidewise.mjs ...`) — not when something (a test, src/mcp/*) imports `runCli` from it as a module, which
// must never also kick off a real run against real process.argv/stdin/stdout as a side effect of the import.
if (import.meta.url === `file://${process.argv[1]}`) {
  runCli(process.argv.slice(2), realCtx())
    .then((r) => {
      if (r.text) (r.exit === 0 ? process.stdout : process.stderr).write(r.text);
      process.exitCode = r.exit;
    })
    .catch((e: unknown) => {
      // Last line of defence: runCli already catches everything dispatch can throw, so this is only for a
      // failure in realCtx() itself or in runCli's own signature — never a stack trace to the user either way.
      process.stderr.write(`✖ sidewise: ${e instanceof Error ? e.message : String(e)} → retry; if it repeats, report it with the command you ran\n`);
      process.exitCode = 1;
    });
}
