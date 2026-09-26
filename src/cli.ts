#!/usr/bin/env node
/**
 * The `sidewise` command: a thin shell over the verbs. Exit 0 ok · 1 provider or ledger error · 2 invalid
 * request or usage · 3 budget blocked. Answers go to stdout; stops and errors go to stderr.
 */
import { readFileSync, statSync } from 'node:fs';
import { parseArgs, type ParseArgsConfig } from 'node:util';
import { BudgetError, budgetLine, loadBudget, resetBudget, setBudget } from './budget/budget.ts';
import type { ClassifierPort } from './classifier/port.ts';
import { selectProvider } from './classifier/select.ts';
import { RUN_ID } from './ledger/ids.ts';
import { LockError, StoreError } from './ledger/lock.ts';
import { appendOutcome, LedgerError, type Outcome } from './ledger/log.ts';
import { resolvePaths } from './ledger/paths.ts';
import type { Level } from './lens/request.ts';
import { runClass } from './verbs/class.ts';
import { runView } from './verbs/view.ts';
import { clip, hasControlChars } from './util/text.ts';

// One usage line per command: a usage mistake prints the problem and just the line for that command.
const LINES = {
  class: 'sidewise class <request-file | ->',
  view: 'sidewise view <folder | tag | SW-####> [--level 1|2|3]',
  outcome: 'sidewise outcome <SW-####> held|overruled|failed --by <actor>',
  budget: 'sidewise budget [show | reset | set --usd <n> --runs <n>]',
} as const;
type Command = keyof typeof LINES;
const USAGE = `usage:\n${Object.values(LINES).map((l) => `  ${l}`).join('\n')}`;
const isCommand = (c: string): c is Command => Object.hasOwn(LINES, c);

/** A usage mistake: exit 2 with "✖ args: <problem> → <that command's usage line>". */
class UsageStop extends Error {
  constructor(command: Command, problem: string) {
    super(`✖ args: ${problem} → ${LINES[command]}`);
    this.name = 'UsageStop';
  }
}

const OUTCOMES: readonly string[] = ['held', 'overruled', 'failed'];
const NO_PROJECT = '✖ project: no .sidewise or .git folder here or above → run inside a project, or "mkdir .sidewise" to start one here';
const MAX_REQUEST_BYTES = 1_048_576;
const TOO_BIG = '✖ request: larger than 1 MB → a request is a short text file; point "where:" at the code instead';

function finish(code: number, text: string): void {
  (code === 0 ? process.stdout : process.stderr).write(`${text}\n`);
  process.exitCode = code;
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

/** The request text, or a stop: a folder, a missing file, over 1 MB, or binary. */
function readRequest(file: string): { text: string } | { stop: string } {
  if (hasControlChars(file)) return { stop: '✖ request: the file name has control characters → pass a plain path, or - to read stdin' };
  const shown = clip(file, 60);
  let bytes: Buffer;
  try {
    if (file !== '-') {
      const st = statSync(file);
      if (st.isDirectory()) return { stop: `✖ request: ${shown} is a folder → pass a request file, or - to read stdin` };
      if (st.size > MAX_REQUEST_BYTES) return { stop: TOO_BIG };
    }
    bytes = readFileSync(file === '-' ? 0 : file);
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') return { stop: `✖ request: ${shown} not found → check the path, or pass - to read stdin` };
    return { stop: `✖ request: cannot read ${shown} (${code ?? 'error'}) → check the path and its permissions` };
  }
  if (bytes.length > MAX_REQUEST_BYTES) return { stop: TOO_BIG };
  if (bytes.includes(0)) return { stop: `✖ request: ${file === '-' ? 'stdin' : shown} is binary, not text → write the request as plain text, starting "sidewise class L1"` };
  return { text: bytes.toString('utf8') };
}

const BUDGET_EXAMPLE = 'e.g. sidewise budget set --usd 5 --runs 500';

/** A --usd/--runs value as a positive finite number, or a stop naming the bad value. */
function cap(flag: string, raw: string): number | string {
  const n = Number(raw);
  return raw.trim() !== '' && Number.isFinite(n) && n > 0 ? n : `✖ budget: --${flag} must be a positive number, got "${raw}" → ${BUDGET_EXAMPLE}`;
}

async function main(argv: string[]): Promise<void> {
  const [command = '', ...rest] = argv;
  if (command === '') return finish(2, USAGE);
  if (command === '--help' || command === '-h') return finish(0, USAGE);
  if (!isCommand(command)) {
    const later = argv.find(isCommand);
    if (command.startsWith('-') && later) throw new UsageStop(later, `"${clip(command, 40)}" comes before the command`);
    return finish(2, `✖ args: "${clip(command, 40)}" is not a command → use class, view, outcome or budget (sidewise --help)`);
  }
  const paths = resolvePaths();
  if (!paths) return finish(2, NO_PROJECT);
  switch (command) {
    case 'class': {
      const { positionals } = args('class', { args: rest, allowPositionals: true, options: {} });
      positionalCount('class', positionals, 1, 1);
      const read = readRequest(positionals[0]!);
      if ('stop' in read) return finish(2, read.stop);
      let provider: ClassifierPort;
      try {
        provider = selectProvider(process.env);
      } catch (e) {
        return finish(1, (e as Error).message);
      }
      const r = await runClass(read.text, { paths, provider, env: process.env });
      return finish(r.exit, r.text);
    }
    case 'view': {
      const twice = givenTwice(rest, ['level']);
      if (twice) return finish(2, twice);
      const { values, positionals } = args('view', { args: rest, allowPositionals: true, options: { level: { type: 'string', default: '1' } } });
      positionalCount('view', positionals, 1, 1);
      if (!['1', '2', '3'].includes(values.level)) return finish(2, `✖ --level: "${clip(values.level, 20)}" is not a level → use --level 1, 2 or 3`);
      const r = runView(positionals[0]!, Number(values.level) as Level, { paths, env: process.env });
      return finish(r.exit, r.text);
    }
    case 'outcome': {
      const twice = givenTwice(rest, ['by']);
      if (twice) return finish(2, twice);
      const { values, positionals } = args('outcome', { args: rest, allowPositionals: true, options: { by: { type: 'string' } } });
      positionalCount('outcome', positionals, 2, 2);
      const [id = '', outcome = ''] = positionals;
      if (!RUN_ID.test(id)) return finish(2, `✖ outcome: "${clip(id, 40)}" is not a run id → use the SW-#### that class printed, e.g. SW-0001`);
      if (!OUTCOMES.includes(outcome)) return finish(2, `✖ outcome: "${clip(outcome, 40)}" is not an outcome → use held, overruled or failed`);
      const by = values.by?.trim();
      if (!by) return finish(2, '✖ --by: missing → add --by <who judged the run>');
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
      if (twice) return finish(2, twice);
      const { usd, runs } = args('budget', { args: more, options: { usd: { type: 'string' }, runs: { type: 'string' } } }).values;
      if (usd === undefined && runs === undefined) return finish(2, `✖ budget: set needs --usd or --runs → ${BUDGET_EXAMPLE}`);
      const capUsd = usd === undefined ? undefined : cap('usd', usd);
      const capRuns = runs === undefined ? undefined : cap('runs', runs);
      const stops = [capUsd, capRuns].filter((v): v is string => typeof v === 'string');
      if (stops.length) return finish(2, stops.join('\n'));
      const caps = {
        ...(typeof capUsd === 'number' ? { capUsd } : {}),
        ...(typeof capRuns === 'number' ? { capRuns } : {}),
      };
      return finish(0, `set · ${budgetLine(setBudget(paths, caps))}`);
    }
  }
}

// Last line of defence: every failure is one line on stderr with a fix, never a stack trace.
main(process.argv.slice(2)).catch((e: unknown) => {
  if (e instanceof UsageStop) return finish(2, e.message);
  if (e instanceof BudgetError) return finish(3, e.message);
  if (e instanceof LedgerError) return finish(e.exit, e.message);
  if (e instanceof LockError || e instanceof StoreError) return finish(1, e.message);
  const text = (e instanceof Error ? e.message : String(e)).split('\n')[0]!.slice(0, 200);
  finish(1, `✖ sidewise: ${text} → retry; if it repeats, report it with the command you ran`);
});
