/**
 * `sidewise agent [verb|tool]`: free, no project, no ledger, never spends — the terse, agent-facing twin of
 * `help` (src/help/index.ts). `help` is prose for a person reading a terminal; this is a dense card for the
 * agent about to write a request: the same enforced rules (rules.ts's RULES, shared with `help` so they can't
 * drift) then the same good/bad pairs (patterns.ts), why-only, no prose — atomic directives, one instruction
 * per line, imperative, no prose framing or decoration. Every card below — the overview and each verb/tool
 * card — is assembled by the one `renderCard` builder, in one fixed key order: identifier line(s) first
 * (`verb:`/`verbs:` for the six verbs, `tool:`/`tools:` for everything else — the overview's `verbs (pick by
 * goal):`/`tools:` sections are themselves multi-line, one purpose-bearing bullet per entry, but still land
 * before `rules:`), then `rules:`, then `patterns:` only when the target has any, then `run:` only when it
 * points further — so no card can quietly drift from another's shape (test/unit/agent.test.ts checks this
 * order holds for every card `agent` prints).
 *
 * `agent` alone (no verb) gives the universal rules plus a `verbs (pick by goal):` list and a `tools:` list,
 * each entry one atomic line naming what it's for — not just its name — so an agent holding a goal ("is this
 * handler safe to merge?") rather than a verb name can map straight to the right one, and points at
 * `sidewise agent <verb>`/`<tool>` to go deeper, and explicitly at `sidewise agent probe` for the
 * question-shape rules. Those purpose lines are never invented here: verbs.ts's `VERB_LINE` and report.ts's
 * `TOOL_LINE` are the one shared source `help`'s own one-screen card (card.ts) renders too, so the two views
 * can't state a different purpose for the same command. [C-189]
 *
 * The overview also carries one extra `run:` line, appended only when no key is configured: inside the
 * plugin's own MCP server it points at `/plugin → Sidewise → Configure`, everywhere else at `sidewise init` —
 * the same detection and the same wording `doctor`'s `key:` line uses (setup/plugin.ts's `inPluginContext` and
 * `NO_KEY_PLUGIN_HINT`), so the two views can't drift on how to add a key.
 *
 * `probe`/`outcome`/`budget`/`report`/`template` are recognized non-verb targets too
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
import { hasKey, resolveJevConfig, type ResolveStored } from '../classifier/typesafe/client.ts';
import { VERBS, type Verb } from '../contract/types.ts';
import { inPluginContext, NO_KEY_PLUGIN_HINT } from '../setup/plugin.ts';
import type { VerbResult } from '../verbs/types.ts';
import { clip, hasControlChars } from '../util/text.ts';
import { terseLines } from './patterns.ts';
import { TOOL_LINE } from './report.ts';
import { PROBE_RULES, ruleLines } from './rules.ts';
import { VERB_LINE } from './verbs.ts';

const isVerb = (s: string): s is Verb => (VERBS as readonly string[]).includes(s);

/** The one shape every agent card is built from: identifier line(s), then `rules:`, then `patterns:` (only
 *  when non-empty — it already carries its own leading `patterns:` line, from terseLines or hand-written
 *  below, so it's spliced in as-is), then `run:` lines (only when given). Never any other order. */
function renderCard(id: readonly string[], rules: readonly string[], patterns: readonly string[] = [], run: readonly string[] = []): string {
  return [...id, 'rules:', ...rules, ...patterns, ...run].join('\n');
}

/** The real commands beyond the six verbs a cold agent needs, in the order shown on `agent`'s own `tools:`
 *  section — setup-only commands (init, uninstall, mcp, doctor) are deliberately left off. `probe` is a rules
 *  topic, not a "tool" a request calls out to, so it's pointed at with its own `run:` line instead (below). */
export const AGENT_TOOLS = ['report', 'outcome', 'budget', 'template'] as const;

/** One extra `run:` line, appended only when no key is configured: the same plugin-context detection doctor's
 *  `key:` line uses (setup/plugin.ts's `inPluginContext`), so a cold agent reading the overview sees how to add
 *  one without a separate `doctor` call. `resolveJevConfig` can throw on a bad `SIDEWISE_BASE_URL` — that's
 *  `doctor`'s stop to report, not this free card's, so a bad config here just skips the hint rather than
 *  crashing the overview. */
function noKeyRunLine(env: Record<string, string | undefined>, deps: { resolveStored?: ResolveStored }): string[] {
  let config;
  try {
    config = resolveJevConfig(env, deps);
  } catch {
    return [];
  }
  if (hasKey(config)) return [];
  return [inPluginContext(env) ? `run: no key (sample answers only) → ${NO_KEY_PLUGIN_HINT}` : 'run: no key → sidewise init to add one'];
}

/** `verbs (pick by goal):` then `tools:`, each followed by one `- name: purpose` bullet per entry, from the
 *  same VERB_LINE/TOOL_LINE text `help`'s card renders (verbs.ts, report.ts) — never a second, divergent
 *  copy. [C-189] */
function overview(env: Record<string, string | undefined>, deps: { resolveStored?: ResolveStored }): string {
  return renderCard(
    [
      'verbs (pick by goal):',
      ...VERBS.map((v) => `- ${v}: ${VERB_LINE[v]}`),
      'tools:',
      ...AGENT_TOOLS.map((t) => `- ${t}: ${TOOL_LINE[t]}`),
    ],
    ruleLines('card'),
    [],
    [
      'run: sidewise agent <verb|tool> — before writing that request',
      'run: sidewise agent probe — before writing questions: how to phrase one',
      ...noKeyRunLine(env, deps),
    ],
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

/** `env`/`deps` default to an empty environment (no key, not inside the plugin) so every existing caller that
 *  doesn't care about the no-key hint — every verb/tool card is unaffected by either — keeps working
 *  unchanged; cli.ts's real wiring passes `ctx.env` and the same `resolveStored` doctor uses. */
export function runAgent(
  target?: string,
  env: Record<string, string | undefined> = {},
  deps: { resolveStored?: ResolveStored } = {},
): VerbResult {
  if (target === undefined || target === '') return { exit: 0, text: overview(env, deps) };
  if (hasControlChars(target)) return { exit: 2, text: '✖ agent: the target has control characters → use a verb name' };
  if (isVerb(target)) return { exit: 0, text: verbCard(target) };
  if (Object.hasOwn(AGENT_TOPICS, target)) return { exit: 0, text: AGENT_TOPICS[target]!() };
  return { exit: 2, text: `✖ agent: "${clip(target, 40)}" is not a verb → one of ${VERBS.join(', ')}, or ${agentExtras().map((t) => `"${t}"`).join(', ')}` };
}
