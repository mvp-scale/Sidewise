/**
 * `sidewise agent [verb|topic]`: free, no project, no ledger, never spends — the terse, agent-facing twin of
 * `help` (src/help/index.ts). `help` is prose for a person reading a terminal; this is a dense card for the
 * agent about to write a request: the same enforced rules (rules.ts's RULES, shared with `help` so they can't
 * drift) then the same good/bad pairs (patterns.ts), why-only, no prose — atomic directives, one instruction
 * per line, imperative, no prose framing or decoration. `agent` alone (no verb) gives the universal rules and
 * points at `sidewise agent <verb>` to go deeper on one, and explicitly at `sidewise agent probe` for the
 * question-shape rules. `probe`/`outcome`/`budget`/`report` are recognized non-verb targets too (round 3 smoke
 * testing: `outcome` was undocumented in both `help` and `agent`, round3-findings.md's "PRODUCT, confirmed"
 * finding; `budget`/`report` get the same treatment for consistency) — each its own bare terse card, no
 * citations, no headings, traceable to the shared source `help`'s prose pages use (rules.ts's PROBE_RULES;
 * report.ts's outcomeHelp/budgetHelp/reportHelp content, hand-mirrored here terse) so the two views can't drift
 * apart. cli.ts wires this in next to `help`; the MCP tool answers it the same way it answers `help`, since both
 * are just another `args[0]` in the same dispatch.
 */
import { VERBS, type Verb } from '../contract/types.ts';
import type { VerbResult } from '../verbs/types.ts';
import { clip, hasControlChars } from '../util/text.ts';
import { terseLines } from './patterns.ts';
import { PROBE_RULES, ruleLines } from './rules.ts';

const isVerb = (s: string): s is Verb => (VERBS as readonly string[]).includes(s);

function overview(): string {
  return ['verbs: ' + VERBS.join(', '), 'rules:', ...ruleLines('card'), 'run: sidewise agent <verb>', 'run: sidewise agent probe'].join('\n');
}

function verbCard(verb: Verb): string {
  return [`verb: ${verb}`, 'rules:', ...ruleLines(verb), ...terseLines(verb)].join('\n');
}

function probeCard(): string {
  return ['target: probe', 'rules:', ...PROBE_RULES.map((r) => `- ${r.text}`)].join('\n');
}

function outcomeCard(): string {
  return [
    'target: outcome',
    'rules:',
    '- syntax: sidewise outcome <SW-####> held|overruled|failed --by <actor>',
    '- no --note flag: keep a reason in your own notes, not here',
    "- an actor can't mark its own asked run held: use a different --by, or record overruled or failed",
    '- same outcome, same actor, twice: exit 0, no-op',
    'patterns:',
    "- why: can't self-certify a run as held",
    '  bad:',
    '    sidewise outcome SW-0002 held --by claude',
    '  good:',
    '    sidewise outcome SW-0002 overruled --by claude',
  ].join('\n');
}

function budgetCard(): string {
  return [
    'target: budget',
    'rules:',
    '- three subcommands: show (default), reset, set',
    '- set needs --usd, --runs, or both',
    '- reset zeroes spend and run count, keeps the caps',
    '- over either cap: exit 3, before spending anything',
    'patterns:',
    '- why: set with no flags changes nothing',
    '  bad:',
    '    sidewise budget set',
    '  good:',
    '    sidewise budget set --usd 5 --runs 500',
  ].join('\n');
}

function reportCard(): string {
  return [
    'target: report',
    'rules:',
    '- free: never calls a provider, never writes to the ledger',
    '- views: hits (default), patterns, history — nothing else',
    'patterns:',
    '- why: no view beyond hits, patterns or history exists',
    '  bad:',
    '    sidewise report level2',
    '  good:',
    '    sidewise report patterns',
  ].join('\n');
}

/** Non-verb targets `agent` recognizes, beyond the six verbs above. */
const AGENT_TOPICS: Record<string, () => string> = { probe: probeCard, outcome: outcomeCard, budget: budgetCard, report: reportCard };
const agentExtras = (): string[] => Object.keys(AGENT_TOPICS);
/** Re-exported for the CLI's own usage line, the same way help/index.ts's HELP_EXTRAS already is. */
export const AGENT_EXTRAS: readonly string[] = Object.keys(AGENT_TOPICS);

export function runAgent(target?: string): VerbResult {
  if (target === undefined || target === '') return { exit: 0, text: overview() };
  if (hasControlChars(target)) return { exit: 2, text: '✖ agent: the target has control characters → use a verb name' };
  if (isVerb(target)) return { exit: 0, text: verbCard(target) };
  if (Object.hasOwn(AGENT_TOPICS, target)) return { exit: 0, text: AGENT_TOPICS[target]!() };
  return { exit: 2, text: `✖ agent: "${clip(target, 40)}" is not a verb → one of ${VERBS.join(', ')}, or ${agentExtras().map((t) => `"${t}"`).join(', ')}` };
}
