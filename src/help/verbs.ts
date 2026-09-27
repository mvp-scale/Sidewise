/**
 * `sidewise help <verb>`: purpose, when to use it, one annotated example, and that verb's own sharp rules —
 * the ones that caused a first-try reject in real use.
 */
import type { Verb } from '../contract/types.ts';
import { ruleLines } from './rules.ts';

const EXAMPLES: Record<Verb, string> = {
  view: 'sidewise view src/handlers          # what does the ledger already know about this folder?\nsidewise view SW-0042               # this run\'s own lineage, up and down',
  class: [
    'side:',
    '  goal: This login handler is safe to merge   # phrase as the exact claim to prove',
    '  depth: quick                                # => exactly 10 yes/no below',
    '  where: [src/user.ts:1-3]                     # include the wiring, not just the handler',
    '  ask:',
    '    injection: {pass: no, 1: Is request text put into a query unvalidated?, ...}',
    'wise: {why: validate, area: auth}',
  ].join('\n'),
  change: 'side:\n  goal: The injection fix works\n  parent: SW-0042\n  compare: {before: main, after: HEAD}',
  scan: [
    'side:',
    '  goal: Handlers don\'t trust request input',
    '  depth: quick',
    '  over: {file: src/handlers/*.ts, function: each}     # scan by file when the file itself is the unit',
    '  ask:',
    '    function:',
    '      injection: {pass: no, 1: Does {function} put request text straight into a query?}',
  ].join('\n'),
  drill: 'sidewise template drill --parent SW-0060 --from src/handlers/user.ts/findUser   # follow next:, don\'t hand-author the ids',
  loop: [
    'side:',
    '  goal: The checkout redesign is sound',
    '  depth: quick',
    '  over:',
    '    part:                              # part and story are SIBLINGS, both under over:',
    '      - name: gateway',
    '        story: [guest checkout, saved cards]',
    '  ask:',
    '    story:',
    '      done: {pass: yes, 1: Is "{story}" testable against {part} as written?}   # asked of EVERY story',
  ].join('\n'),
};

const SHARP: Record<Verb, string[]> = {
  view: ['a code file (not a request) is a place, not a request — view <folder>, ".", a tag, or SW-#### all work'],
  class: ['goal wording changes the verdict (that\'s a feature, not a bug) — phrase it as the claim you need proven'],
  change: [
    'the files must be committed at the ref you name (or use "worktree" for the working tree) — change runs git in the repo that actually holds them',
    'change replays the parent\'s own questions; it never takes ask: (use class for new questions)',
  ],
  scan: ['add a scale question to a layer to rank findings by severity, worst first, instead of an unordered map', 'scan by file when the file itself is the unit that matters, not a function inside it'],
  drill: ['follow the `next:` line rather than hand-authoring parent/from — it already names the id and the category or item'],
  loop: [
    'a sub-layer (like story under part) is a SIBLING key under over:, never nested inside its parent item',
    'a story/part name is one word or kebab-case, at most 20 characters, and never contains "/"',
    'every question under a layer is asked of every item at that layer — phrase it so that holds for all of them',
  ],
};

const PURPOSE: Record<Verb, string> = {
  view: 'Side x Know: what do we already know here? Free — it reads the ledger and never calls out.',
  class: 'Side x Judge: does the evidence support this one goal? One call, one subject.',
  change: 'Side x Prove: did the change work? It replays a parent run\'s questions on two states.',
  scan: 'Wise x Know: where in this code should we look? A sweep across code, read by us.',
  drill: 'Wise x Judge: why did this one thing fail? It goes down from one item in a parent run.',
  loop: 'Wise x Prove: does this idea hold up? A sweep across layers of ideas the agent writes.',
};

const WHEN: Record<Verb, string> = {
  view: 'before any paid call, when entering unfamiliar code, or to find proven questions.',
  class: 'a decision on one subject: merge, choose, triage, check a fix.',
  change: 'after a fix, a refactor, a dependency bump, or to compare fix A with fix B.',
  scan: 'a new codebase, a release check, a PR\'s changed files, or a vague bug with no location yet.',
  drill: 'after a fail or unsure from class, scan, loop or change.',
  loop: 'a design, a plan or a feature request before any code exists.',
};

export function verbHelp(verb: Verb): string {
  return [
    `## ${verb}`,
    PURPOSE[verb],
    `When: ${WHEN[verb]}`,
    '',
    'Example:',
    EXAMPLES[verb],
    '',
    'Sharp rules:',
    ...SHARP[verb].map((s) => `- ${s}.`),
    ...ruleLines(verb),
  ].join('\n');
}
