/**
 * "Good / bad" pattern pairs: the one-time education Sidewise builds into itself instead of an external doc.
 * `help <verb>` and `help authoring` (src/help/verbs.ts, src/help/topics.ts) render these as prose for a human;
 * `sidewise agent <verb>` (src/help/agent.ts) renders the exact same pairs terse, why-only, for an agent about
 * to write a request. One shared list so the two views can never drift apart — test/unit/help-patterns.test.ts
 * is the proof: every `good` snippet parses and validates for its own `verb`, every `bad` snippet that's
 * actually catchable (today, only the oversized-file one, by evidence/code.ts's own stop) is rejected, and the
 * rest (wording/semantic patterns no validator can see) are marked not-catchable, not silently skipped.
 */
import type { Verb } from '../contract/types.ts';

export interface Pattern {
  /** One full sentence: why the bad version doesn't work — help's own prose. */
  readonly rule: string;
  /** The same point, at most 8 words — agent's terse card. */
  readonly why: string;
  /** A short, complete `side:` request that fails, or just falls short, in the way `rule` describes. */
  readonly bad: string;
  /** The same request, fixed. */
  readonly good: string;
  /** Which verb's own rules `bad`/`good` are checked against (both are complete requests for this verb). */
  readonly verb: Verb;
  /** Which help/agent pages show this pair: verb names, or the `authoring` topic (help only). */
  readonly in: readonly string[];
  /** Whether `bad` is actually rejected before it ever reaches the classifier — by the schema/cross validator,
   *  or (the oversized-file pattern) by the evidence reader's own stop. False for a wording/semantic pattern
   *  only a human or the classifier can judge — schema-valid either way. */
  readonly catchable: boolean;
}

export const PATTERNS: readonly Pattern[] = [
  {
    rule: 'A file this size gets read past the point that actually matters — name the range that does, instead of sending the whole file.',
    why: 'Big whole files refused — name the range',
    verb: 'view',
    in: ['class', 'authoring'],
    catchable: true,
    bad: 'side:\n  goal: This function is safe to merge\n  where: [src/pay/validate.ts]\n',
    good: 'side:\n  goal: This function is safe to merge\n  where: [src/pay/validate.ts:120-180]\n',
  },
  {
    rule: '`where:` is all the code a run sees — a question about anything outside it has nothing to answer from.',
    why: 'Add the range the question is actually about',
    verb: 'view',
    in: ['class', 'authoring'],
    catchable: false,
    bad: 'side:\n  goal: This handler is safe to merge\n  where: [src/pay/handler.ts]\n  ask:\n    injection:\n      pass: no\n      1: Does validateInput() sanitize the amount field?\n',
    good: 'side:\n  goal: This handler is safe to merge\n  where: [src/pay/handler.ts, src/pay/validate.ts]\n  ask:\n    injection:\n      pass: no\n      1: Does validateInput() sanitize the amount field?\n',
  },
  {
    rule: 'With more than one file in `where:`, a question that never names one leaves the classifier guessing which file it means.',
    why: 'Name the file in the question, in backticks',
    verb: 'view',
    in: ['class', 'authoring'],
    catchable: false,
    bad: "side:\n  goal: The payment path is safe to merge\n  where: [src/pay/handler.ts, src/pay/validate.ts]\n  ask:\n    injection:\n      pass: no\n      1: Does it sanitize the amount field before use?\n",
    good: 'side:\n  goal: The payment path is safe to merge\n  where: [src/pay/handler.ts, src/pay/validate.ts]\n  ask:\n    injection:\n      pass: no\n      1: Does `src/pay/validate.ts` sanitize the amount field before use?\n',
  },
  {
    rule: '`{function}` is filled in per item — asking about something outside it answers from evidence that item never sent.',
    why: 'Ask what {function} itself does, not its caller',
    verb: 'scan',
    in: ['scan'],
    catchable: false,
    bad: "side:\n  goal: Handlers don't trust request input\n  depth: quick\n  over:\n    file: src/handlers/*.ts\n    function: each\n  ask:\n    function:\n      injection:\n        pass: no\n        1: Does the caller of {function} sanitize its input first?\n",
    good: "side:\n  goal: Handlers don't trust request input\n  depth: quick\n  over:\n    file: src/handlers/*.ts\n    function: each\n  ask:\n    function:\n      injection:\n        pass: no\n        1: Does {function} sanitize its input before use?\n",
  },
];

const indent = (text: string, pad: string): string[] => text.trimEnd().split('\n').map((l) => `${pad}${l}`);

/** help's prose rendering (src/help/verbs.ts, src/help/topics.ts): '' when no pattern is tagged for `tag`. */
export function proseLines(tag: string): string[] {
  const list = PATTERNS.filter((p) => p.in.includes(tag));
  if (!list.length) return [];
  return [
    '',
    '## Good / bad',
    ...list.flatMap((p, i) => [
      ...(i ? [''] : []),
      `- ${p.rule}`,
      '  bad:',
      ...indent(p.bad, '    '),
      '  good:',
      ...indent(p.good, '    '),
    ]),
  ];
}

/** agent's terse rendering (src/help/agent.ts): same pairs, why-only, no prose. [] when none apply to `tag`. */
export function terseLines(tag: string): string[] {
  const list = PATTERNS.filter((p) => p.in.includes(tag));
  if (!list.length) return [];
  return [
    'patterns:',
    ...list.flatMap((p) => [`- why: ${p.why}`, '  bad:', ...indent(p.bad, '    '), '  good:', ...indent(p.good, '    ')]),
  ];
}
