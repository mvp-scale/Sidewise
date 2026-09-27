/**
 * `sidewise agent [verb]`: free, no project, no ledger, never spends — the terse, agent-facing twin of `help`
 * (src/help/index.ts). `help` is prose for a person reading a terminal; this is a dense card for the agent
 * about to write a request: the same enforced rules (rules.ts's RULES, shared with `help` so they can't drift)
 * then the same good/bad pairs (patterns.ts), why-only, no prose — atomic directives, one instruction per line,
 * imperative, no prose framing or decoration. `agent` alone (no verb) gives the universal rules, the verb list
 * to go deeper on, and points explicitly at `sidewise agent probe` for the question-shape rules. cli.ts wires
 * this in next to `help`; the MCP tool answers it the same way it answers `help`, since both are just another
 * `args[0]` in the same dispatch.
 */
import { VERBS, type Verb } from '../contract/types.ts';
import type { VerbResult } from '../verbs/types.ts';
import { clip, hasControlChars } from '../util/text.ts';
import { terseLines } from './patterns.ts';
import { ruleLines } from './rules.ts';

const isVerb = (s: string): s is Verb => (VERBS as readonly string[]).includes(s);

function overview(): string {
  return ['verbs: ' + VERBS.join(', '), 'rules:', ...ruleLines('card'), 'run: sidewise agent <verb>', 'run: sidewise agent probe'].join('\n');
}

function verbCard(verb: Verb): string {
  return [`verb: ${verb}`, 'rules:', ...ruleLines(verb), ...terseLines(verb)].join('\n');
}

export function runAgent(target?: string): VerbResult {
  if (target === undefined || target === '') return { exit: 0, text: overview() };
  if (hasControlChars(target)) return { exit: 2, text: '✖ agent: the target has control characters → use a verb name' };
  if (!isVerb(target)) return { exit: 2, text: `✖ agent: "${clip(target, 40)}" is not a verb → one of ${VERBS.join(', ')}` };
  return { exit: 0, text: verbCard(target) };
}
