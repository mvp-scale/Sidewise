/**
 * `sidewise help [verb|topic]`: free, no project needed — the guidance lives in the tool, not beside it.
 * `help` alone prints the one-screen contract card; `help <verb>` (view, class,
 * change, scan, drill, loop) goes deeper on one verb; `help <topic>` (authoring, verdict, wise, reuse) covers a
 * cross-cutting rule. Never spends, never touches the ledger. cli.ts wires this in as the `help` command.
 */
import { VERBS, type Verb } from '../contract/types.ts';
import type { VerbResult } from '../verbs/types.ts';
import { clip, hasControlChars } from '../util/text.ts';
import { card } from './card.ts';
import { reportHelp } from './report.ts';
import { TOPICS, topicHelp, type Topic } from './topics.ts';
import { verbHelp } from './verbs.ts';

/** Re-exported for the CLI's own usage/help text. */
export const HELP_TOPICS: readonly string[] = TOPICS;

const isVerb = (s: string): s is Verb => (VERBS as readonly string[]).includes(s);
const isTopic = (s: string): s is Topic => (TOPICS as readonly string[]).includes(s);

export function runHelp(target?: string): VerbResult {
  if (target === undefined || target === '') return { exit: 0, text: card() };
  if (hasControlChars(target)) return { exit: 2, text: '✖ help: the target has control characters → use a verb or a topic name' };
  if (isVerb(target)) return { exit: 0, text: verbHelp(target) };
  if (isTopic(target)) return { exit: 0, text: topicHelp(target) };
  // report isn't a seventh verb (it's a free read tool outside the 2x3 grid) or a cross-cutting topic — its own
  // recognized target, checked here rather than added to VERBS/help/verbs.ts's Record<Verb, ...> maps.
  if (target === 'report') return { exit: 0, text: reportHelp() };
  return {
    exit: 2,
    text: `✖ help: "${clip(target, 40)}" is not a verb or topic → one of ${VERBS.join(', ')}, or a topic: ${TOPICS.join(', ')}, or "report"`,
  };
}
