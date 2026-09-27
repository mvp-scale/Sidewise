/**
 * One rule list shared by the validator and `help` (lessons-2026-09-27.md §3): every fact here is built from the
 * SAME constants schema-check.ts/validate.ts check against (contract/types.ts), never retyped as a separate
 * literal — so a future change to a closed list or a count shows up in `help` for free, and the two can't drift
 * apart again. test/unit/help.test.ts asserts every entry's text appears verbatim in the `help` output it names.
 */
import { AREAS, CHANGES, DEPTH_COUNT, MAX_EXTRAS, RISKS, STAGES, WHYS } from '../contract/types.ts';

/** Oxford-ish "a, b or c" — matches schema-check.ts's own `list()` wording in stop text. */
const list = (xs: readonly string[]): string => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} or ${xs.at(-1)}` : xs[0]!);

export interface Rule {
  readonly text: string;
  /** Which `help` output(s) must contain this text verbatim: 'card', a verb name, or a topic name. */
  readonly in: readonly string[];
}

export const RULES: readonly Rule[] = [
  {
    text: `depth: quick|standard|thorough = exactly ${DEPTH_COUNT.quick}, ${DEPTH_COUNT.standard} or ${DEPTH_COUNT.thorough} yes/no questions (a sweep: at most that many items per layer)`,
    in: ['card', 'authoring', 'class', 'scan', 'loop'],
  },
  { text: `where: at most 5 path entries — this is all the code a run sees`, in: ['card', 'authoring', 'class', 'view'] },
  { text: `pass: yes clears at P(yes) >= 0.70; pass: no clears at P(yes) <= 0.30; in between is unsure`, in: ['card', 'verdict'] },
  { text: `every question in a category must point the same way as its pass:`, in: ['authoring'] },
  { text: `wise.why is one of ${list(WHYS)}`, in: ['wise'] },
  { text: `wise.area is one of ${list(AREAS)}`, in: ['wise'] },
  { text: `wise.stage is one of ${list(STAGES)}`, in: ['wise'] },
  { text: `wise.change is one of ${list(CHANGES)}`, in: ['wise'] },
  { text: `wise.risk is one of ${list(RISKS)}`, in: ['wise'] },
  { text: `at most ${MAX_EXTRAS} scale or choice questions per request`, in: ['authoring'] },
];

/** Every rule text tagged for a given card/verb/topic, one per line, "- <text>." */
export function ruleLines(tag: string): string[] {
  return RULES.filter((r) => r.in.includes(tag)).map((r) => `- ${r.text}.`);
}
