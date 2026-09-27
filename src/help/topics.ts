/**
 * `sidewise help <topic>`: cross-cutting rules that don't belong to one verb:
 * authoring (how to write a request), verdict (how to read one), wise (the ledger's own context fields),
 * reuse (what answers are free and why).
 */
import { AREAS, CHANGES, RISKS, STAGES, WHYS } from '../contract/types.ts';
import { proseLines } from './patterns.ts';
import { PROBE_RULES, ruleLines } from './rules.ts';

export const TOPICS = ['authoring', 'verdict', 'wise', 'reuse', 'probe'] as const;
export type Topic = (typeof TOPICS)[number];

function authoring(): string {
  return [
    '## authoring',
    'How to write a request that survives its first try. Under the hood a yes/no question asks the classifier\'s',
    'Noul primitive, a `scale:` asks Score, and a `choice:` asks Choice — one narrow, coherent judgment per',
    'question, so keep each one to a single thing.',
    ...ruleLines('authoring'),
    '- `where:` is ALL the code a run sees — nothing outside it exists, however obvious the wiring seems.',
    '- phrase the goal as the exact claim you need proven ("this handler is safe to merge", not "review this handler") — wording changes the verdict, on purpose.',
    '- a `{blank}` in a sweep question is filled in per item; it must name that layer or one above it.',
    '- a question\'s number is a label for the response only — the model never sees it, so the question text itself has to carry its full meaning on its own.',
    '- a `scale:` level should name a concrete situation that stands on its own ("crashes in production"), not a bare relative point ("high").',
    '- give a `choice:` a genuine no-match option (e.g. `none`) whenever the code might fit none of the others.',
    '- ask everything you need about this evidence in one request — a second call (`drill`) is for when you need to look at something new, not more angles on what you already sent.',
    ...proseLines('authoring'),
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
    '- a probability near 0.50 means the evidence points both ways about equally, not a medium-strength yes — that\'s exactly why it lands in `unsure` rather than a weak pass.',
    '- the answer\'s shape is guaranteed (a number in range, a level that\'s really one of yours) — whether it\'s the RIGHT number is what consensus, escalate and your own reading are for, not the schema.',
    '- a run can fail to answer for different reasons, and the exit code says which: a bad request never reaches the classifier (exit 2); a provider or ledger problem does (exit 1); a blocked budget never spends at all (exit 3) — read which one you got before treating a stop as `unsure`.',
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
    '- reuse keys on the evidence and the question\'s own text, not on how the answer is graded: moving a',
    '  category\'s `pass:` or `need:` re-grades the same free answer instead of re-asking the question.',
  ].join('\n');
}

function probe(): string {
  return [
    '## probe',
    'A valid probe: the shape of a well-formed question, best practice for a higher-quality answer — guidance,',
    "not new validator enforcement. Each rule below is TypeSafe's own published guidance, paraphrased, with its",
    'source page cited.',
    '',
    ...PROBE_RULES.map((r) => `- ${r.text} (TypeSafe: ${r.cite})`),
    '',
    'Round 3 smoke testing found this directly: a goal phrased as the vulnerability ("runs request input as code")',
    'read pass/fail backwards, and its probability stayed at p 0.98 before AND after the fix that removed the',
    "vulnerability — the wording, not the classifier, was wrong. That's rule 7 above.",
  ].join('\n');
}

const BUILDERS: Record<Topic, () => string> = { authoring, verdict, wise, reuse, probe };

export function topicHelp(topic: Topic): string {
  return BUILDERS[topic]();
}
