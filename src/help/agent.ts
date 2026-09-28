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
 * `probe`/`verdict`/`outcome`/`budget`/`report`/`template` are recognized non-verb targets too
 * (round 3 smoke testing: `outcome` was undocumented in both `help` and `agent`, round3-findings.md's
 * "PRODUCT, confirmed" finding; `budget`/`report` got the same treatment for consistency; `template` — a real
 * command a cold agent needs before writing a request, and until now missing from `agent` entirely — followed
 * the same way; `verdict` — how to read a response, round-4 smoke testing's "response vocabulary never taught
 * before it appears" finding — is the newest) — each its own bare terse card, no citations, no headings,
 * traceable to the shared source `help`'s prose pages use where one exists (rules.ts's PROBE_RULES and
 * VERDICT_FACTS; report.ts's own outcomeHelp/budgetHelp/reportHelp content, hand-mirrored here terse per that
 * module's own note, since an agent card is why-only with no rule prose to reuse) so the two views can't drift
 * apart. cli.ts wires this in next to `help`; the MCP tool answers it the same way it answers `help`, since
 * both are just another `args[0]` in the same dispatch — and the tool's own description (src/mcp/protocol.ts)
 * now tells a cold agent to call this first, before anything else.
 *
 * Every verb card also splices verbs.ts's `SHARP[verb]` bullets into its `rules:` list, alongside
 * `ruleLines(verb)` (round-4 finding: `agent drill`/`agent change` rendered an empty `rules:` section since
 * neither RULES nor patterns.ts had anything tagged for either verb, even though `help <verb>` already had
 * real prose for both — SHARP was just unreachable from here). The overview's own `rules:` list carries one
 * hand-written line beyond RULES too (`PROJECT_SCOPE_RULE` below): `where:` resolves against the MCP `project`
 * argument or `SIDEWISE_HOME`, not session cwd — a runtime fact, not a request-schema one, so it doesn't
 * belong in rules.ts's RULES (built only from schema-check.ts/validate.ts constants); it's stated only here,
 * not in `help`'s card, since an agent is the one that actually passes `project`/sets `SIDEWISE_HOME`.
 */
import { hasKey, resolveJevConfig, type ResolveStored } from '../classifier/typesafe/client.ts';
import { resolveConfig } from '../config/load.ts';
import { BLASTS, VERBS, type Verb } from '../contract/types.ts';
import { CHAIN_LEVELS, effectiveWiseFields, MAX_WISE_LINES, UNKNOWN_VALUE, WISE_FIELDS, closedValues, type WiseField } from '../contract/wise-fields.ts';
import type { SidewisePaths } from '../ledger/paths.ts';
import { inPluginContext, NO_KEY_PLUGIN_HINT } from '../setup/plugin.ts';
import type { VerbResult } from '../verbs/types.ts';
import { clip, hasControlChars } from '../util/text.ts';
import { terseLines } from './patterns.ts';
import { TOOL_LINE } from './report.ts';
import { BAD_PROBE_EXAMPLE, FAMILY_ROLES, PROBE_RULES, ruleLines, VERDICT_FACTS } from './rules.ts';
import { SHARP, VERB_LINE } from './verbs.ts';

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
/** The `where:`/`SIDEWISE_HOME` fact: a runtime/environment rule, not a request-schema one, so it's hand-
 *  written rather than pulled from rules.ts's RULES (which is built only from schema-check.ts/validate.ts
 *  constants — see that file's own header comment). Defined once, here, since only `agent`'s overview states
 *  it: an agent is the one that actually passes the MCP `project` arg or sets `SIDEWISE_HOME`, so a cold
 *  agent — not a human reading `help` — is who needs this before its first call (round-4 finding: an agent
 *  had to fail once, `✖ side.where: cannot read "app/routes/contributions.js"`, to learn `where:` resolves
 *  against `project`/`SIDEWISE_HOME`, not session cwd). [C-195] */
const PROJECT_SCOPE_RULE =
  "- where: resolves against the MCP `project` argument or `SIDEWISE_HOME` (CLI), never your session cwd — pass `project` (or set `SIDEWISE_HOME`) when you started elsewhere.";

/** Plan 2b: the overview points at the probe-writing skill in its first lines (the first bullet under
 *  `rules:`, right after the verb/tool lists) — before an agent writes a single probe, not after it fails one. */
const PROBE_SKILL_RULE = '- before writing or editing any request, read the sidewise-probe skill (or run `sidewise agent probe`): what makes a probe worth asking.';

function overview(env: Record<string, string | undefined>, deps: { resolveStored?: ResolveStored }): string {
  return renderCard(
    [
      'verbs (pick by goal):',
      ...VERBS.map((v) => `- ${v}: ${VERB_LINE[v]}`),
      'tools:',
      ...AGENT_TOOLS.map((t) => `- ${t}: ${TOOL_LINE[t]}`),
    ],
    [PROBE_SKILL_RULE, ...ruleLines('card'), PROJECT_SCOPE_RULE],
    [],
    [
      'run: sidewise agent <verb|tool> — before writing that request',
      'run: sidewise agent probe — before writing questions: how to phrase one',
      'run: sidewise agent verdict — before reading a response: how to read it',
      ...noKeyRunLine(env, deps),
    ],
  );
}

/** SHARP[verb] first (verbs.ts's own gotcha prose, e.g. drill's "follow next:" and change's "never ask:") then
 *  ruleLines(verb) — one shared `rules:` list, never a second copy; every verb gets SHARP now, not just
 *  drill/change (round-4 finding: `agent drill`/`agent change` rendered an empty `rules:` section because
 *  neither RULES nor patterns.ts had anything tagged for them, even though this prose already existed in
 *  verbs.ts's SHARP, just unreachable from `agent`). [C-192] */
function verbCard(verb: Verb): string {
  return renderCard([`verb: ${verb}`], [...SHARP[verb].map((s) => `- ${s}.`), ...ruleLines(verb)], terseLines(verb));
}

/** PROBE_RULES (TypeSafe's own published guidance, cited in `help probe`, bare here) then `ruleLines('probe')`
 *  — Sidewise's own hard validator rules that also apply while writing a question (today: the per-question
 *  character cap), tagged 'probe' in rules.ts so they reach this card without a second copy. [C-194] */
function probeCard(): string {
  return renderCard(
    ['tool: probe'],
    [
      ...PROBE_RULES.map((r) => `- ${r.text}`),
      ...ruleLines('probe'),
      ...FAMILY_ROLES.map((f) => `- ${f.family}: ${f.roles.join(' · ')}`),
      `- bad: "${BAD_PROBE_EXAMPLE.bad}" — ${BAD_PROBE_EXAMPLE.why}`,
      ...BAD_PROBE_EXAMPLE.good.map((g) => `- good: ${g}`),
      '- see: the sidewise-probe skill for the full model and worked examples',
    ],
  );
}

/** rules.ts's `VERDICT_FACTS` bare, no headings, no prose framing — the same list `help verdict`'s prose wraps.
 *  Round-4 finding: this response-side vocabulary (consensus, escalate, stale, reused, fixed/still/regressed,
 *  what unsure means, goal vs category gates) was never taught before a response first showed it. [C-196] */
function verdictCard(): string {
  return renderCard(['tool: verdict'], [...ruleLines('verdict'), ...VERDICT_FACTS.map((f) => `- ${f}`)]);
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

/** `sidewise agent doctor`'s card (plan 2c B1b). Bare `doctor` is the full system report (provider/key/project/
 *  node/config); `doctor <file|->` is a narrower, standalone check — no project, no ledger, no classifier — of
 *  ONE document, auto-detecting whether it's a request (`side:`) or a `.sidewise/config.yaml`-shaped file. */
function doctorCard(): string {
  return renderCard(
    ['tool: doctor'],
    [
      '- syntax: sidewise doctor  ·  or: sidewise doctor <file | ->',
      '- free: no call, no spend, never writes',
      '- bare form: reports provider/route/key/project/node/config in one pass — also validates .sidewise/config.yaml when present',
      '- <file|-> form: checks ONE document, no project needed — a side: key means a request (same checks as --dry-run); anything else is checked as config',
      '- <file|-> never touches the ledger, reuse or budget, even inside a project',
    ],
  );
}

function reportCard(): string {
  return renderCard(
    ['tool: report'],
    [
      '- free: never calls a provider, never writes to the ledger',
      '- views: hits (default), patterns, history, web — nothing else',
      '- web writes one file, .sidewise/viewer.html, and tries to open it — the only view that writes anything',
    ],
    [
      'patterns:',
      '- why: no view beyond hits, patterns, history or web exists',
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

/** `sidewise agent config`'s card (plan 2c B1): `sidewise config` is free, never writes, and works with or
 *  without a project. Terse like every other tool card here — the full key list lives in `sidewise config`'s
 *  own output (it prints every effective value plus its source), not repeated here. */
function configCard(): string {
  return renderCard(
    ['tool: config'],
    [
      '- syntax: sidewise config',
      '- free: never writes, never spends, works with or without a project',
      '- prints every effective setting (budget, provider, baseURL, model, pricing, timeoutMs, retries, backoffMs, sweep, requestMaxBytes, reuse, wise) and which of default/config/env it came from',
      '- reads .sidewise/config.yaml if present — sparse overrides only, precedence env > config > default',
      '- a bad config.yaml shows its ✖ problems here too, then the rest of the effective table underneath',
    ],
  );
}

/** `sidewise agent wise`'s legend card (plan 2c A5) — deliberately NOT built through `renderCard`: it has its
 *  own fixed shape (FIELDS/ARCHITECTURE/WRITE IT FLAT/EXAMPLE, no `rules:`/`patterns:`/`run:`), spelled out
 *  verbatim by the plan, so it's exempt from the "every card follows the same key order" invariant
 *  (test/unit/agent.test.ts's NON_VERBS list deliberately leaves `wise` out for this reason). The FIELDS block's
 *  values and notes come from `wise-fields.ts`'s WISE_FIELDS table (not retyped here); a unit test cross-checks
 *  every table entry still appears in this text, so the two can't silently drift apart. Phase B makes this
 *  config-aware (the table gains overrides); today it's the built-in defaults only. */
/** blast's own values (types.ts's BLASTS) are ordered narrowest-first (validation only cares about set
 *  membership) — the card shows them widest-first (person, the biggest blast radius, first) since that's the
 *  order a reader scans the C4 levels in. Card-display order only; validation still goes through closedValues. */
const BLAST_CARD_ORDER = ['person', 'system', 'container', 'component', 'code'];

/** A field's note, plus its project alias (`wise.<field>.as`, plan 2c B1) when it has one — an alias ADDS a
 *  name (the original key still works too, per wise-fields.ts's effectiveWiseFields), so the card says so
 *  rather than silently relabeling the field and hiding the original. */
function noteWithAlias(field: WiseField): string {
  return field.alias ? `${field.note ?? ''}${field.note ? ' ' : ''}(also: wise.${field.alias})` : (field.note ?? '');
}

/** `wiseFields` (plan 2c B1, F2): the caller's effective (project-config-aware) table — defaults to the
 *  built-in WISE_FIELDS, the exact card `sidewise agent wise` always printed before config overrides existed.
 *  Values/notes come straight from whichever table is given; `blast`'s card-display order (below) falls back to
 *  the built-in widest-first BLAST_CARD_ORDER only when its values are still the built-in default — an override
 *  is shown in its own given order instead. */
function wiseCard(wiseFields: readonly WiseField[] = WISE_FIELDS): string {
  const [why, area, stage, change, risk, problem, uses, blast, touches] = wiseFields as unknown as [
    WiseField, WiseField, WiseField, WiseField, WiseField, WiseField, WiseField, WiseField, WiseField,
  ];
  const blastValues = blast.values === BLASTS ? BLAST_CARD_ORDER : closedValues(blast).slice(0, -1);
  return [
    `tool: wise — optional, free, ≤${MAX_WISE_LINES} lines. Flat keys; the only nesting is a list.`,
    "Every field is optional: fill what you know, omit what doesn't apply.",
    '',
    'FIELDS',
    `  why      ${closedValues(why).slice(0, -1).join(' | ')}${why.alias ? `  (also: wise.${why.alias})` : ''}`,
    `  area     ${closedValues(area).slice(0, -1).join(' | ')}          (list ≤${area.maxList}; ${noteWithAlias(area)})`,
    `  stage    ${closedValues(stage).slice(0, -1).join(' | ')}   (${noteWithAlias(stage)})`,
    `  change   ${closedValues(change).slice(0, -1).join(' | ')}   (${noteWithAlias(change)})`,
    `  risk     ${closedValues(risk).slice(0, -1).join(' | ')}         ${noteWithAlias(risk)}`,
    `  problem  ${noteWithAlias(problem)}`,
    `  uses     ${noteWithAlias(uses)}`,
    `  blast    ${blastValues.join(' | ')}   ${noteWithAlias(blast)}`,
    `  touches  ${noteWithAlias(touches)}`,
    `  <other>  any kebab-case key: one line ≤160 or a list ≤5, recorded as-is`,
    `  ${UNKNOWN_VALUE}  allowed as a value for any closed field`,
    '',
    'ARCHITECTURE: the C4 model (c4model.com). Five levels, each inside the one above:',
    '',
    '  system: shop',
    '  └── container: web-app                      an app or data store',
    '  │   ├── component: orders-handler           a group of code inside a container',
    '  │   │   └── code: createOrder               your own function (not a built-in)',
    '  │   └── component: orders-dao',
    '  └── container: database',
    '  person: customer                             outside the system',
    '  system: payment-service                      an outside service is its own system',
    '',
    'WRITE IT FLAT',
    '  inside  →  parent/child in the name:  component:web-app/orders-handler',
    '  uses    →  ->  between parts:         a -> b -> c',
    '  guessed or not built yet  →  end any part with ?:  component:web-app/refunds?  system:email-service?',
    '',
    '  chain   :=  part ( " -> " part )*',
    '  part    :=  level ":" name ( "/" name )* [ "?" ]',
    `  level   :=  ${CHAIN_LEVELS.join(' | ')}`,
    '  name    :=  lowercase kebab-case, or a code identifier at the code level',
    '',
    'EXAMPLE',
    '  wise:',
    '    why: validate',
    '    problem: request input reaches a raw query in order creation',
    '    uses:',
    '      - person:customer -> container:web-app',
    '      - component:web-app/orders-handler -> component:web-app/orders-dao -> container:database',
    '    blast: container',
    '    touches: [Order, amount]',
  ].join('\n');
}

/** Non-verb targets `agent` recognizes, beyond the six verbs above. `wise` (plan 2c) is deliberately not a
 *  `renderCard`-shaped tool card — see wiseCard's own comment. */
const AGENT_TOPICS: Record<string, () => string> = {
  probe: probeCard,
  verdict: verdictCard,
  outcome: outcomeCard,
  budget: budgetCard,
  report: reportCard,
  template: templateCard,
  wise: wiseCard,
  config: configCard,
  doctor: doctorCard,
};
const agentExtras = (): string[] => Object.keys(AGENT_TOPICS);
/** Re-exported for the CLI's own usage line, the same way help/index.ts's HELP_EXTRAS already is. */
export const AGENT_EXTRAS: readonly string[] = Object.keys(AGENT_TOPICS);

/** `env`/`deps` default to an empty environment (no key, not inside the plugin) so every existing caller that
 *  doesn't care about the no-key hint — every verb/tool card is unaffected by either — keeps working
 *  unchanged; cli.ts's real wiring passes `ctx.env` and the same `resolveStored` doctor uses. `deps.paths`
 *  (plan 2c B1, additive): when given, `sidewise agent wise` reads that project's own `.sidewise/config.yaml`
 *  `wise:` overrides and generates the card from the EFFECTIVE table instead of the built-in one; omitted
 *  (every existing caller/test), the card stays exactly the built-in one it always was. */
export function runAgent(
  target?: string,
  env: Record<string, string | undefined> = {},
  deps: { resolveStored?: ResolveStored; paths?: SidewisePaths } = {},
): VerbResult {
  if (target === undefined || target === '') return { exit: 0, text: overview(env, deps) };
  if (hasControlChars(target)) return { exit: 2, text: '✖ agent: the target has control characters → use a verb name' };
  if (isVerb(target)) return { exit: 0, text: verbCard(target) };
  if (target === 'wise' && deps.paths) return { exit: 0, text: wiseCard(effectiveWiseFields(resolveConfig(deps.paths, env).config.wise)) };
  if (Object.hasOwn(AGENT_TOPICS, target)) return { exit: 0, text: AGENT_TOPICS[target]!() };
  return { exit: 2, text: `✖ agent: "${clip(target, 40)}" is not a verb → one of ${VERBS.join(', ')}, or ${agentExtras().map((t) => `"${t}"`).join(', ')}` };
}
