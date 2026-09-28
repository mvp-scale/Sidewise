/**
 * `sidewise help report|outcome|budget`: none of the three is a verb (none takes ask:, none calls the
 * classifier), so none is in help/verbs.ts's `Record<Verb, ...>` maps — help/index.ts routes each here as its
 * own recognized target instead. Round 3 smoke testing hit `outcome` directly: it appeared in neither `help`
 * nor `agent` (round3-findings.md's "PRODUCT, confirmed" finding), and every one of its own rejects
 * (STOPS.md #4-9) had no page to read first; `budget` had the same gap even though it never actually
 * tripped in that round.
 *
 * `CliPair`s are these three targets' own good/bad pairs — the same discipline as `patterns.ts`'s `Pattern`,
 * but for a bare CLI invocation rather than a `side:` request (there's no verb to validate one against), so
 * they're hand-written and hand-verified against the real stop text instead of proven by a schema/evidence
 * check. `help/agent.ts` hand-writes its own terse cards for these targets rather than importing these (an
 * agent card is why-only with no rule prose to reuse), so these types stay internal to this module's own
 * prose rendering.
 *
 * `TOOL_LINE` below is the one exception: a one-atomic-line-each summary for all four tools — the three above
 * plus `template` (whose own full human help page doesn't exist yet, only `agent`'s terse card) — shared
 * verbatim between `help`'s one-screen card (card.ts's "Tools" list) and `agent`'s overview (agent.ts), the
 * same discipline as verbs.ts's `VERB_LINE`. [C-189]
 */
export const TOOL_LINE: Record<'report' | 'outcome' | 'budget' | 'template', string> = {
  report: 'brief from history; free, no new checks',
  outcome: 'record held/overruled/failed on a run (held needs a second actor)',
  budget: 'show or set the spend and run caps',
  template: 'print a valid starting request for a verb',
};

interface CliPair {
  /** One full sentence: why the bad version doesn't work — help's own prose. */
  readonly rule: string;
  /** The failing invocation, then the exact stop text it produces (as separate lines). */
  readonly bad: readonly string[];
  /** The fixed invocation. */
  readonly good: readonly string[];
}

const REPORT_PAIRS: readonly CliPair[] = [
  {
    rule: 'there is no view beyond hits, patterns and history — nothing else to ask it for.',
    bad: ['sidewise report level2', '→ ✖ report: "level2" is not a view → use hits, patterns or history'],
    good: ['sidewise report patterns'],
  },
];

const OUTCOME_PAIRS: readonly CliPair[] = [
  {
    rule: "an agent can't certify its own run as correct — `held` needs a second party.",
    bad: [
      'sidewise outcome SW-0002 held --by claude   # claude is the actor that asked SW-0002',
      '→ ✖ outcome: claude asked SW-0002, so it can\'t mark it held → another agent or the owner records "held"',
    ],
    good: ['sidewise outcome SW-0002 held --by <the user or a reviewer agent, not you>'],
  },
  {
    rule: '`outcome` takes no reason field.',
    bad: [
      'sidewise outcome SW-0002 overruled --by claude --note "wrong file blamed"',
      '→ ✖ args: unknown flag --note → sidewise outcome <SW-####> held|overruled|failed --by <actor>',
    ],
    good: ['sidewise outcome SW-0002 overruled --by claude   # keep the reason in your own notes'],
  },
];

const BUDGET_PAIRS: readonly CliPair[] = [
  {
    rule: '`set` with no flags changes nothing and has nothing to report.',
    bad: ['sidewise budget set', '→ ✖ budget: set needs --usd or --runs → e.g. sidewise budget set --usd 5 --runs 500'],
    good: ['sidewise budget set --usd 5 --runs 500'],
  },
];

const indent = (lines: readonly string[], pad: string): string[] => lines.map((l) => `${pad}${l}`);

/** help's prose rendering: one `- <rule>` / `bad:` / `good:` block per pair, blank line between pairs. */
function proseCliPairs(pairs: readonly CliPair[]): string[] {
  return [
    '',
    '## Good / bad',
    ...pairs.flatMap((p, i) => [...(i ? [''] : []), `- ${p.rule}`, '  bad:', ...indent(p.bad, '    '), '  good:', ...indent(p.good, '    ')]),
  ];
}

export function reportHelp(): string {
  return [
    '## report',
    "A free, read-only view across everything the ledger holds, not one place: what's known, what recurs, what changed.",
    'When: briefing a teammate or picking up a codebase cold, instead of hand-assembling several `view` calls.',
    '',
    'Example:',
    'sidewise report            # same as: sidewise report hits',
    'sidewise report patterns',
    'sidewise report history',
    '',
    'Sharp rules:',
    '- free: never calls a provider, never writes to the ledger, and works even with no on-disk index.',
    '- no options beyond the view name — hits (default), patterns or history; anything else is a stop.',
    '- `hits`: the newest run\'s own gate per place, worst first; a one-subject answer is flagged `stale` once the code there has changed since.',
    '- `patterns`: every distinct question set ever run, with its pass/fail/unsure split, places touched, and outcomes.',
    '- `history`: a merged, newest-first feed of `change` results (fixed/regressed) and recorded outcomes.',
    '- every view caps its rows and says plainly how many more exist, rather than dropping them silently.',
    ...proseCliPairs(REPORT_PAIRS),
  ].join('\n');
}

export function outcomeHelp(): string {
  return [
    '## outcome',
    'Records what happened to a run after the fact, so weak spots roll up later in `sidewise report history`: ' +
      '`held` (it was right), `overruled` (it was wrong) or `failed` (it was useless). Not a side:-YAML verb: ' +
      'it never calls a provider, only appends one line to the ledger.',
    '',
    'Example:',
    'sidewise outcome SW-0002 overruled --by claude',
    'sidewise outcome SW-0002 held --by the-owner       # a different actor than the one who asked it',
    '',
    'Sharp rules:',
    '- exact form: sidewise outcome <SW-####> held|overruled|failed --by <actor> — no other flags (there is no `--note`; keep a reason in your own notes, not here).',
    "- the agent that asked a run can't mark it `held` itself — `overruled` and `failed` have no such restriction.",
    '- recording the exact same outcome, by the exact same actor, again is a no-op (exit 0, "already recorded by <actor>"), not a second entry.',
    ...proseCliPairs(OUTCOME_PAIRS),
  ].join('\n');
}

export function budgetHelp(): string {
  return [
    '## budget',
    "Shows or changes the project's spend cap. Not a side:-YAML verb: it never calls a provider. `show` (the " +
      'default) prints the current spend and run count; `reset` zeroes both but keeps the caps; `set` changes ' +
      'either or both caps without touching the spend already counted.',
    '',
    'Example:',
    'sidewise budget                          # same as: sidewise budget show',
    'sidewise budget set --usd 5 --runs 500   # the defaults',
    '',
    'Sharp rules:',
    '- three subcommands only: `show` (default), `reset`, `set`.',
    "- `set` needs at least one of `--usd`/`--runs` — giving neither is a stop.",
    '- by convention only the project owner runs `reset` — nothing in the code stops any agent from running it.',
    '- any verb call that would go over either cap stops at exit 3 before it spends anything.',
    ...proseCliPairs(BUDGET_PAIRS),
  ].join('\n');
}
