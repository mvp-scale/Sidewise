/**
 * `sidewise help <topic>`: cross-cutting rules that don't belong to one verb (lessons-2026-09-27.md §3.3):
 * authoring (how to write a request), verdict (how to read one), wise (the ledger's own context fields),
 * reuse (what answers are free and why).
 */
import { AREAS, CHANGES, RISKS, STAGES, WHYS } from '../contract/types.ts';
import { ruleLines } from './rules.ts';

export const TOPICS = ['authoring', 'verdict', 'wise', 'reuse'] as const;
export type Topic = (typeof TOPICS)[number];

function authoring(): string {
  return [
    '## authoring',
    'How to write a request that survives its first try:',
    ...ruleLines('authoring'),
    '- `where:` is ALL the code a run sees — nothing outside it exists, however obvious the wiring seems.',
    '- phrase the goal as the exact claim you need proven ("this handler is safe to merge", not "review this handler") — wording changes the verdict, on purpose.',
    '- a `{blank}` in a sweep question is filled in per item; it must name that layer or one above it.',
  ].join('\n');
}

function verdict(): string {
  return [
    '## verdict',
    'How to read what comes back:',
    ...ruleLines('verdict'),
    '- `need:` on a category: `all` (default, every answer clears the bar) · `most` (>= 2/3 clear, none a clear miss) · `any` (at least one clears).',
    '- the gate passes only when the goal and every category pass; in a sweep, an item passes only when its own categories and every child does too.',
    '- `consensus` (STRONG · SPLIT · WEAK): whether the yes/no answers agree with each other — shown on `class`, and `drill` on a one-subject parent; a sweep or `change` response never computes it.',
    '- `escalate: true` on non-STRONG consensus, `depth: thorough`, or a goal that reads as irreversible (delete, deploy, drop, pay, migrate, secret, credential) — don\'t act on this alone.',
    '- a stop always reads `✖ field: problem → fix`; run `sidewise help <verb>` when one doesn\'t make sense.',
  ].join('\n');
}

function wise(): string {
  return [
    '## wise',
    'wise: is optional context that never reaches the classifier — it only shapes what the ledger learns:',
    '',
    '| field | closed values | what you get back |',
    '|---|---|---|',
    `| why    | ${WHYS.join(', ')} | why this run happened, for later pattern-mining |`,
    `| area   | ${AREAS.join(', ')} | which slice of the system it touched |`,
    `| stage  | ${STAGES.join(', ')} | where in the workflow it landed |`,
    `| change | ${CHANGES.join(', ')} | what kind of change was under review |`,
    `| risk   | ${RISKS.join(', ')} | how risky the change looked going in |`,
    '',
    ...ruleLines('wise'),
    '- every field is optional; the response always echoes back which ones were recorded as `wise: {recorded: [...]}`, or `{recorded: none}`.',
  ].join('\n');
}

function reuse(): string {
  return [
    '## reuse',
    'The exact same question, asked of the exact same code, is answered for free from the ledger — no call, no',
    'spend, and the response says so. This is exact-match reuse: same evidence, same question text, same',
    'provider and model; nothing here is a semantic or fuzzy match.',
    '- `view <request-file>` checks this before you spend anything: it shows `reuse: SW-####` when the exact',
    '  question set was already asked on unchanged code.',
    '- a sweep (scan, loop, drill on a sweep parent) reuses per item: unchanged items cost nothing, and the',
    '  response counts how many were reused.',
    '- a fully-reused run should never be blocked by the spend cap, since it spends nothing — if you see that,',
    '  it\'s a bug, not a feature.',
  ].join('\n');
}

const BUILDERS: Record<Topic, () => string> = { authoring, verdict, wise, reuse };

export function topicHelp(topic: Topic): string {
  return BUILDERS[topic]();
}
