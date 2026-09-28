/**
 * `sidewise help`: the one-screen contract card, free and no project needed. `help <verb>`/`help <topic>` go
 * deeper; this stays one screen. The verb bullets and the "## Tools" bullets render from verbs.ts's `VERB_LINE`
 * and report.ts's `TOOL_LINE` — the same shared, one-atomic-line-per-command text `agent`'s overview
 * (help/agent.ts) renders, so the two can't state a different purpose for the same command. [C-189]
 *
 * `PITCH`/`agentFrontDoorLines` below are this card's own opening pitch, factored out so `cli.ts`'s bare
 * `USAGE` text can splice the same wording ahead of its usage block instead of a third, hand-typed copy
 * (round-4 smoke testing: a cold CLI agent made zero `sidewise` calls at all — it never discovered `sidewise
 * agent` exists — so every human-facing entry surface now points a cold agent there first). [C-191]
 */
import { VERBS } from '../contract/types.ts';
import { TOOL_LINE } from './report.ts';
import { ruleLines } from './rules.ts';
import { VERB_LINE } from './verbs.ts';

const PITCH_LINE_1 = 'Sidewise turns a short numbered yes/no checklist into a calibrated pass/fail/unsure verdict — evidence,';
const PITCH_LINE_2 = 'never a command. Think of it as a citable second opinion, not a linter.';
/** The same two sentences above, unwrapped to one line — `agentFrontDoorLines` below (cli.ts's usage header)
 *  reuses this verbatim rather than hand-typing a shorter pitch of its own. Not exported: nothing outside this
 *  file needs the pitch on its own, only through `card()` or `agentFrontDoorLines()`. */
const PITCH = `${PITCH_LINE_1} ${PITCH_LINE_2}`;

export function card(): string {
  return [
    PITCH_LINE_1,
    PITCH_LINE_2,
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
    '| Side — solve it with what\'s proven   | view (free) | class (1 call) | replay (up to 2 calls) |',
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
    'Go deeper: `sidewise help <verb>` (view, class, replay, scan, drill, loop) or `sidewise help <topic>`',
    '(authoring, verdict, wise, reuse).',
    '',
    '## Tools',
    `- report: ${TOOL_LINE.report} (\`sidewise help report\`)`,
    `- outcome: ${TOOL_LINE.outcome} (\`sidewise help outcome\`)`,
    `- budget: ${TOOL_LINE.budget} (\`sidewise help budget\`)`,
    `- template: ${TOOL_LINE.template}`,
  ].join('\n');
}

/**
 * Ready for `cli.ts` to splice ahead of its own `USAGE` block, in this exact order: the front-door directive,
 * the existing `new here?` hint (verbatim — matches `USAGE`'s own current wording/case), this card's own
 * pitch (`PITCH` above, not a second hand-typed copy), then one purpose bullet per verb (`VERB_LINE`, the same
 * shared text `agent`'s overview and this card's own "Pick your verb" list already render — [C-189]). A bare
 * `sidewise`/`sidewise --help` was the one entry surface round-4 smoke testing found with no pointer at
 * `sidewise agent` at all.
 */
export function agentFrontDoorLines(): string[] {
  return ['Agents: run "sidewise agent" first', 'new here? → sidewise init', PITCH, ...VERBS.map((v) => `- ${v}: ${VERB_LINE[v]}`)];
}
