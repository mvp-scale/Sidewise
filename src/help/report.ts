/**
 * `sidewise help report`: report isn't a seventh verb (it's outside the 2x3 grid — a free read tool, not a
 * Know/Judge/Prove action), so it isn't in help/verbs.ts's `Record<Verb, ...>` maps; help/index.ts routes here
 * as its own recognized target instead.
 */
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
  ].join('\n');
}
