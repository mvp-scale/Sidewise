/**
 * `sidewise agent [verb|topic]`: free, no project, no ledger, never spends — the terse, agent-facing twin of
 * `help` (src/help/index.ts). `help` is prose for a person reading a terminal; this is a dense card for the
 * agent about to write a request: the same enforced rules (rules.ts's RULES, shared with `help` so they can't
 * drift) then the same good/bad pairs (patterns.ts), why-only, no prose — atomic directives, one instruction
 * per line, imperative, no prose framing or decoration. `agent` alone (no verb) gives the universal rules and
 * points at `sidewise agent <verb>` to go deeper on one, and explicitly at `sidewise agent probe` for the
 * question-shape rules. `probe` is a recognized non-verb target too: the 8 rules bare, no citations, rendered
 * from the same shared source (rules.ts's PROBE_RULES) `help probe`'s prose renders with citations, so the two
 * views can't drift apart. cli.ts wires this in next to `help`; the MCP tool answers it the same way it answers
 * `help`, since both are just another `args[0]` in the same dispatch.
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

/** Non-verb targets `agent` recognizes, beyond the six verbs above. */
const AGENT_TOPICS: Record<string, () => string> = { probe: probeCard };
const agentExtras = (): string[] => Object.keys(AGENT_TOPICS);

export function runAgent(target?: string): VerbResult {
  if (target === undefined || target === '') return { exit: 0, text: overview() };
  if (hasControlChars(target)) return { exit: 2, text: '✖ agent: the target has control characters → use a verb name' };
  if (isVerb(target)) return { exit: 0, text: verbCard(target) };
  if (Object.hasOwn(AGENT_TOPICS, target)) return { exit: 0, text: AGENT_TOPICS[target]!() };
  return { exit: 2, text: `✖ agent: "${clip(target, 40)}" is not a verb → one of ${VERBS.join(', ')}, or ${agentExtras().map((t) => `"${t}"`).join(', ')}` };
}
