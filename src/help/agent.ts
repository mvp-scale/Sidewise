/**
 * `sidewise agent [verb|tool]`: free, no project, no ledger, never spends — the terse, agent-facing twin of
 * `help` (src/help/index.ts). `help` is prose for a person reading a terminal; this is a dense card for the
 * agent about to write a request: the same enforced rules (rules.ts's RULES, shared with `help` so they can't
 * drift) then the same good/bad pairs (patterns.ts), why-only, no prose — atomic directives, one instruction
 * per line, imperative, no prose framing or decoration. Every card below — the overview and each verb/tool
 * card — is assembled by the one `renderCard` builder, in one fixed key order: identifier line(s) first
 * (`verb:`/`verbs:` for the six verbs, `tool:`/`tools:` for everything else), then `rules:`, then `patterns:`
 * only when the target has any, then `run:` only when it points further — so no card can quietly drift from
 * another's shape (test/unit/agent.test.ts checks this order holds for every card `agent` prints).
 *
 * `agent` alone (no verb) gives the universal rules plus the verb list and the `tools:` line, and points at
 * `sidewise agent <verb>`/`<tool>` to go deeper, and explicitly at `sidewise agent probe` for the
 * question-shape rules. `probe`/`outcome`/`budget`/`report`/`template` are recognized non-verb targets too
 * (round 3 smoke testing: `outcome` was undocumented in both `help` and `agent`, round3-findings.md's
 * "PRODUCT, confirmed" finding; `budget`/`report` got the same treatment for consistency; `template` — a real
 * command a cold agent needs before writing a request, and until now missing from `agent` entirely — followed
 * the same way) — each its own bare terse card, no citations, no headings, traceable to the shared source
 * `help`'s prose pages use where one exists (rules.ts's PROBE_RULES; report.ts's own
 * outcomeHelp/budgetHelp/reportHelp content, hand-mirrored here terse per that module's own note, since an
 * agent card is why-only with no rule prose to reuse) so the two views can't drift apart. cli.ts wires this in
 * next to `help`; the MCP tool answers it the same way it answers `help`, since both are just another
 * `args[0]` in the same dispatch — and the tool's own description (src/mcp/protocol.ts) now tells a cold agent
 * to call this first, before anything else.
 */
import { VERBS, type Verb } from '../contract/types.ts';
import type { VerbResult } from '../verbs/types.ts';
import { clip, hasControlChars } from '../util/text.ts';
import { terseLines } from './patterns.ts';
import { PROBE_RULES, ruleLines } from './rules.ts';

const isVerb = (s: string): s is Verb => (VERBS as readonly string[]).includes(s);

/** The one shape every agent card is built from: identifier line(s), then `rules:`, then `patterns:` (only
 *  when non-empty — it already carries its own leading `patterns:` line, from terseLines or hand-written
 *  below, so it's spliced in as-is), then `run:` lines (only when given). Never any other order. */
function renderCard(id: readonly string[], rules: readonly string[], patterns: readonly string[] = [], run: readonly string[] = []): string {
  return [...id, 'rules:', ...rules, ...patterns, ...run].join('\n');
}

/** The real commands beyond the six verbs a cold agent needs, in the order shown on `agent`'s own `tools:`
 *  line — setup-only commands (init, uninstall, mcp, doctor) are deliberately left off. `probe` is a rules
 *  topic, not a "tool" a request calls out to, so it's pointed at with its own `run:` line instead (below). */
const AGENT_TOOLS = ['report', 'outcome', 'budget', 'template'] as const;

function overview(): string {
  return renderCard(
    [`verbs: ${VERBS.join(', ')}`, `tools: ${AGENT_TOOLS.join(', ')}`],
    ruleLines('card'),
    [],
    ['run: sidewise agent <verb>', 'run: sidewise agent <tool>', 'run: sidewise agent probe'],
  );
}

function verbCard(verb: Verb): string {
  return renderCard([`verb: ${verb}`], ruleLines(verb), terseLines(verb));
}

function probeCard(): string {
  return renderCard(
    ['tool: probe'],
    PROBE_RULES.map((r) => `- ${r.text}`),
  );
}

function outcomeCard(): string {
  return renderCard(
    ['tool: outcome'],
    [
      '- syntax: sidewise outcome <SW-####> held|overruled|failed --by <actor>',
      '- no --note flag: keep a reason in your own notes, not here',
      "- an actor can't mark its own asked run held: use a different --by, or record overruled or failed",
      '- same outcome, same actor, twice: exit 0, no-op',
    ],
    [
      'patterns:',
      '- why: held needs a second actor; never self-certify',
      '  bad:',
      '    sidewise outcome SW-0002 held --by claude',
      '  good:',
      '    sidewise outcome SW-0002 held --by <the user or a reviewer agent, not you>',
    ],
  );
}

function budgetCard(): string {
  return renderCard(
    ['tool: budget'],
    [
      '- three subcommands: show (default), reset, set',
      '- set needs --usd, --runs, or both',
      '- reset zeroes spend and run count, keeps the caps',
      '- over either cap: exit 3, before spending anything',
    ],
    [
      'patterns:',
      '- why: set with no flags changes nothing',
      '  bad:',
      '    sidewise budget set',
      '  good:',
      '    sidewise budget set --usd 5 --runs 500',
    ],
  );
}

function reportCard(): string {
  return renderCard(
    ['tool: report'],
    ['- free: never calls a provider, never writes to the ledger', '- views: hits (default), patterns, history — nothing else'],
    [
      'patterns:',
      '- why: no view beyond hits, patterns or history exists',
      '  bad:',
      '    sidewise report level2',
      '  good:',
      '    sidewise report patterns',
    ],
  );
}

function templateCard(): string {
  return renderCard(
    ['tool: template'],
    [
      '- syntax: sidewise template <verb> [--parent SW-#### --from <item-or-category>]',
      '- or: sidewise template <verb> --from <request.yaml> [--where <path>]... [--goal <text>]',
      '- free: no project needed, never spends, never writes',
      '- --parent only applies to drill, and needs --from too',
      '- --where/--goal need --from; refused together with --parent',
    ],
    [
      'patterns:',
      '- why: --parent only works with drill',
      '  bad:',
      '    sidewise template class --parent SW-0002 --from injection',
      '  good:',
      '    sidewise template drill --parent SW-0002 --from injection',
    ],
  );
}

/** Non-verb targets `agent` recognizes, beyond the six verbs above. */
const AGENT_TOPICS: Record<string, () => string> = {
  probe: probeCard,
  outcome: outcomeCard,
  budget: budgetCard,
  report: reportCard,
  template: templateCard,
};
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
