/**
 * `sidewise help [verb|topic]`: free, no project needed — the guidance lives in the tool, not beside it.
 * `help` alone prints the one-screen contract card; `help <verb>` (view, class, replay, scan, drill, loop) goes
 * deeper on one verb; `help <topic>` (authoring, verdict, wise, reuse, probe) covers a cross-cutting rule;
 * `help report|outcome|budget|doctor` covers the free/record tools outside the 2x3 verb grid (report.ts). Never
 * spends, never touches the ledger. cli.ts wires this in as the `help` command.
 */
import { VERBS, type Verb } from '../contract/types.ts';
import type { VerbResult } from '../verbs/types.ts';
import { clip, hasControlChars } from '../util/text.ts';
import { card } from './card.ts';
import { budgetHelp, doctorHelp, outcomeHelp, reportHelp } from './report.ts';
import { TOPICS, topicHelp, type Topic } from './topics.ts';
import { verbHelp } from './verbs.ts';

/** Re-exported for the CLI's own usage/help text. */
export const HELP_TOPICS: readonly string[] = TOPICS;

/** report/outcome/budget aren't verbs (none takes ask:, none calls the classifier) or cross-cutting topics —
 *  their own recognized targets, checked here rather than added to VERBS/help/verbs.ts's Record<Verb, ...>
 *  maps. Re-exported (HELP_EXTRAS) for the CLI's own usage line, the same way HELP_TOPICS already is. */
const EXTRAS: Record<string, () => string> = { report: reportHelp, outcome: outcomeHelp, budget: budgetHelp, doctor: doctorHelp };
export const HELP_EXTRAS: readonly string[] = Object.keys(EXTRAS);

const isVerb = (s: string): s is Verb => (VERBS as readonly string[]).includes(s);
const isTopic = (s: string): s is Topic => (TOPICS as readonly string[]).includes(s);

export function runHelp(target?: string): VerbResult {
  if (target === undefined || target === '') return { exit: 0, text: card() };
  if (hasControlChars(target)) return { exit: 2, text: '✖ help: the target has control characters → use a verb or a topic name' };
  if (isVerb(target)) return { exit: 0, text: verbHelp(target) };
  if (isTopic(target)) return { exit: 0, text: topicHelp(target) };
  if (Object.hasOwn(EXTRAS, target)) return { exit: 0, text: EXTRAS[target]!() };
  return {
    exit: 2,
    text: `✖ help: "${clip(target, 40)}" is not a verb or topic → one of ${VERBS.join(', ')}, or a topic: ${TOPICS.join(', ')}, or ${HELP_EXTRAS.map((t) => `"${t}"`).join(', ')}`,
  };
}
