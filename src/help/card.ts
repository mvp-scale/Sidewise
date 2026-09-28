/**
 * `sidewise help`: the one-screen contract card, free and no project needed. `help <verb>`/`help <topic>` go
 * deeper; this stays one screen. The verb bullets and the "## Tools" bullets render from verbs.ts's `VERB_LINE`
 * and report.ts's `TOOL_LINE` — the same shared, one-atomic-line-per-command text `agent`'s overview
 * (help/agent.ts) renders, so the two can't state a different purpose for the same command. [C-189]
 */
import { VERBS } from '../contract/types.ts';
import { TOOL_LINE } from './report.ts';
import { ruleLines } from './rules.ts';
import { VERB_LINE } from './verbs.ts';

export function card(): string {
  return [
    'Sidewise turns a short numbered yes/no checklist into a calibrated pass/fail/unsure verdict — evidence,',
    'never a command. Think of it as a citable second opinion, not a linter.',
    '',
    '## Invoke it',
    'In Claude Code: call the `sidewise` MCP tool directly — same args as the CLI (e.g. args: ["class", "-"]),',
    'the request YAML as stdin — no PATH lookup needed. Elsewhere: use `sidewise` if it\'s',
    'on PATH, else `npx --no-install sidewise`; if neither works, tell the user to run',
    '"npx @mvpscale/sidewise init" and stop.',
    '',
    '## Pick your verb',
    '| Grid | Know | Judge | Prove |',
    '|---|---|---|---|',
    '| Side — solve it with what\'s proven   | view (free) | class (1 call) | change (up to 2 calls) |',
    '| Wise — find what\'s new, and learn it | scan (1 call) | drill (1 call) | loop (1 call/layer) |',
    '',
    ...VERBS.map((v) => `- ${v}: ${VERB_LINE[v]}`),
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
    '(authoring, verdict, wise, reuse).',
    '',
    '## Tools',
    `- report: ${TOOL_LINE.report} (\`sidewise help report\`)`,
    `- outcome: ${TOOL_LINE.outcome} (\`sidewise help outcome\`)`,
    `- budget: ${TOOL_LINE.budget} (\`sidewise help budget\`)`,
    `- template: ${TOOL_LINE.template}`,
  ].join('\n');
}
