#!/usr/bin/env node
/**
 * The `sidewise` command: a thin shell over the verbs. Exit 0 ok · 1 provider or ledger error · 2 invalid
 * request or usage · 3 budget blocked. Answers go to stdout; stops and errors go to stderr.
 */
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { BudgetError, budgetLine, loadBudget, resetBudget, setBudget } from './budget/budget.ts';
import { selectProvider } from './classifier/select.ts';
import { LockError } from './ledger/lock.ts';
import { appendOutcome, LedgerError, type Outcome } from './ledger/log.ts';
import { resolvePaths } from './ledger/paths.ts';
import type { Level } from './lens/request.ts';
import { runClass } from './verbs/class.ts';
import { runView } from './verbs/view.ts';

const USAGE = `usage:
  sidewise class <request-file | ->
  sidewise view <folder | tag | SW-####> [--level 1|2|3]
  sidewise outcome <SW-####> held|overruled|failed --by <actor>
  sidewise budget [show | reset | set --usd <n> --runs <n>]`;

const OUTCOMES: readonly string[] = ['held', 'overruled', 'failed'];

function finish(code: number, text: string): void {
  (code === 0 ? process.stdout : process.stderr).write(`${text}\n`);
  process.exitCode = code;
}

async function main(argv: string[]): Promise<void> {
  const [command, ...rest] = argv;
  const paths = resolvePaths();
  switch (command) {
    case 'class': {
      const file = rest[0];
      if (!file) return finish(2, USAGE);
      let text: string;
      try {
        text = readFileSync(file === '-' ? 0 : file, 'utf8');
      } catch (e) {
        return finish(2, `✖ request: cannot read ${file} (${(e as Error).message}) → check the path`);
      }
      const r = await runClass(text, { paths, provider: selectProvider(process.env), env: process.env });
      return finish(r.exit, r.text);
    }
    case 'view': {
      const { values, positionals } = parseArgs({ args: rest, allowPositionals: true, options: { level: { type: 'string', default: '1' } } });
      const level = Number(values.level);
      const target = positionals[0];
      if (!target || (level !== 1 && level !== 2 && level !== 3)) return finish(2, USAGE);
      const r = runView(target, level as Level, paths);
      return finish(r.exit, r.text);
    }
    case 'outcome': {
      const { values, positionals } = parseArgs({ args: rest, allowPositionals: true, options: { by: { type: 'string' } } });
      const [id, outcome] = positionals;
      if (!id || !outcome || !OUTCOMES.includes(outcome) || !values.by) return finish(2, USAGE);
      const rec = appendOutcome(paths, id, outcome as Outcome, values.by);
      return finish(0, `sidewise outcome ${rec.of} ${rec.outcome} · by ${rec.by}`);
    }
    case 'budget': {
      const [sub = 'show', ...more] = rest;
      if (sub === 'show') return finish(0, budgetLine(loadBudget(paths).state));
      if (sub === 'reset') return finish(0, `reset · ${budgetLine(resetBudget(paths))}`);
      if (sub === 'set') {
        const { values } = parseArgs({ args: more, options: { usd: { type: 'string' }, runs: { type: 'string' } } });
        const caps = {
          ...(values.usd !== undefined ? { capUsd: Number(values.usd) } : {}),
          ...(values.runs !== undefined ? { capRuns: Number(values.runs) } : {}),
        };
        return finish(0, `set · ${budgetLine(setBudget(paths, caps))}`);
      }
      return finish(2, USAGE);
    }
    default:
      return finish(2, USAGE);
  }
}

main(process.argv.slice(2)).catch((e: unknown) => {
  if (e instanceof BudgetError) return finish(3, e.message);
  if (e instanceof LedgerError || e instanceof LockError) return finish(1, e.message);
  finish(1, `✖ sidewise: ${(e as Error).message}`);
});
