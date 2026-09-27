/**
 * `sidewise help`: the one-screen contract card, free and no project needed — seeded from the play agent's own
 * onboarding notes (lab/research/2026-09-27-play-agent/AGENT.md), which is proven content: it's what got a real
 * agent from zero to its first successful run. `help <verb>`/`help <topic>` go deeper; this stays one screen.
 */
import { ruleLines } from './rules.ts';

export function card(): string {
  return [
    'Sidewise turns a short numbered yes/no checklist into a calibrated pass/fail/unsure verdict — evidence,',
    'never a command. Think of it as a citable second opinion (SW-0017), not a linter.',
    '',
    '## Invoke it',
    'In Claude Code: call the `sidewise` MCP tool directly — same args as the CLI (e.g. args: ["class", "-"]),',
    'the request YAML as stdin. There is no CLI on PATH; don\'t look for one. Elsewhere: use `sidewise` if it\'s',
    'on PATH, else `npx --no-install sidewise`; if neither works, tell the user to run',
    '"npx @mvpscale/sidewise init" and stop.',
    '',
    '## Pick your verb',
    '| Grid | Know | Judge | Prove |',
    '|---|---|---|---|',
    '| Side — solve it with what\'s proven   | view (free) | class (1 call) | change (~1 call) |',
    '| Wise — find what\'s new, and learn it | scan (1 call) | drill (1 call) | loop (1 call/layer) |',
    '',
    '## The contract (memorize — these cause most first-try rejects)',
    ...ruleLines('card'),
    '- every question in a category must point the same way as its pass: (one reversed question fails the whole gate).',
    '',
    '## Read the verdict',
    'Read `goal` (+ any `choice`) first, then the failing category, then follow the `next:` line. A stop always',
    'reads `✖ field: problem → fix` — the error text names exactly what to change.',
    '',
    'Go deeper: `sidewise help <verb>` (view, class, change, scan, drill, loop) or `sidewise help <topic>`',
    '(authoring, verdict, wise, reuse). `sidewise template <verb>` prints a commented, filled-in sample.',
    '`sidewise report [hits|patterns|history]` reads back what the ledger has learned across every place, free —',
    'not a seventh verb, just a read tool (`sidewise help report`).',
  ].join('\n');
}
