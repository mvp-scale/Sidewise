/**
 * One rule list shared by the validator and `help`: every fact here is built from the
 * SAME constants schema-check.ts/validate.ts check against (contract/types.ts), never retyped as a separate
 * literal — so a future change to a closed list or a count shows up in `help` for free, and the two can't drift
 * apart again. test/unit/help.test.ts asserts every entry's text appears verbatim in the `help` output it names.
 */
import { MAX_QUESTION_CHARS } from '../contract/schema-check.ts';
import { AREAS, CHANGES, DEPTH_COUNT, MAX_EXTRAS, RISKS, STAGES, WHYS } from '../contract/types.ts';

/** Oxford-ish "a, b or c" — matches schema-check.ts's own `list()` wording in stop text. */
const list = (xs: readonly string[]): string => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} or ${xs.at(-1)}` : xs[0]!);

interface Rule {
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
  {
    // Round-4 finding: a cold agent hit `✖ question 1: is longer than 160 characters` with zero prior warning
    // in `agent view`/`agent probe` — this is Sidewise's own hard validator cap (schema-check.ts's
    // MAX_QUESTION_CHARS), not TypeSafe guidance, so it lives here rather than in PROBE_RULES below; tagged
    // 'probe' too so `agent probe`/`help probe` carry it alongside TypeSafe's own question-shape rules. [C-194]
    text: `a question (or the goal) is at most ${MAX_QUESTION_CHARS} characters, one line — longer text is rejected outright`,
    in: ['card', 'authoring', 'class', 'scan', 'drill', 'loop', 'view', 'probe'],
  },
  { text: `pass: yes clears at >= 0.70; pass: no clears at <= 0.30; in between is unsure`, in: ['card', 'verdict'] },
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

/**
 * The "teach a valid probe" rules: the shape of a well-formed Sidewise question, TypeSafe's own published
 * guidance, labelled as best practice for higher-quality answers — guidance, not new validator enforcement.
 * `help probe` (topics.ts) renders these WITH their TypeSafe citation; `agent probe` (agent.ts) renders the
 * same text bare, no citation — one shared list so the two views can't drift apart, same discipline as
 * RULES/ruleLines above.
 */
interface ProbeRule {
  readonly text: string;
  /** Terse citation of the TypeSafe source page, e.g. "primitives/noul.md". */
  readonly cite: string;
}

export const PROBE_RULES: readonly ProbeRule[] = [
  {
    text: 'One narrow judgment per question — break a complex or ill-defined question into separate questions that each evaluate one property.',
    cite: 'concepts/how-to-build-with-system-one.md',
  },
  {
    text: "The question carries its full meaning on its own — a question's number is a label for the response only; the model never sees it.",
    cite: 'concepts/how-to-build-with-system-one.md',
  },
  {
    text: "It's answerable from the code in where: — name the file in backticks when there's more than one, and send only the context the question needs.",
    cite: 'concepts/how-to-build-with-system-one.md',
  },
  {
    text: 'Yes/no questions keep one polarity per category — phrase so "yes" is the affirmative you mean, not an inverted "is free of…".',
    cite: 'primitives/noul.md',
  },
  {
    text: "Scale levels describe concrete situations, not relative points — every level is judged on its own; the model sees neither its number nor its neighbours.",
    cite: 'primitives/score.md',
  },
  {
    text: 'Choice options include a "none fits" outcome for when nothing else matches.',
    cite: 'primitives/choice.md',
  },
  {
    text: 'Phrase the goal as the safe state ("X rejects Y"), not the vulnerability ("X runs input as code") — a goal is asked as a yes/no, so the same affirmative-alignment rule applies to it.',
    cite: 'primitives/noul.md',
  },
  {
    text: 'Add the visible-scope probe as a recommended extra question: "Can this be answered from the code shown?"',
    cite: 'concepts/how-to-build-with-system-one.md',
  },
];

/**
 * The response-side vocabulary a verdict is read with: `help verdict` (topics.ts) renders these with its own
 * prose framing around them, `agent verdict` (agent.ts) renders the same list bare — one shared list so the
 * two views can't state the verdict rules differently (same discipline as PROBE_RULES above). Round-4 finding:
 * this vocabulary (`consensus`, `escalate`, `stale`, `reused`, fixed/still/regressed) was documented only in
 * `help report`'s own prose (and change.ts's/report.ts's doc comments), never surfaced before a response ever
 * showed it. [C-196]
 */
export const VERDICT_FACTS: readonly string[] = [
  '`need:` on a category: `all` (default, every answer clears the bar) · `most` (>= 2/3 clear, none a clear miss) · `any` (at least one clears)',
  "the gate passes only when the goal and every category pass; in a sweep, an item passes only when its own categories and every child does too",
  '`consensus` (STRONG · SPLIT · WEAK): whether the yes/no answers agree with each other — shown on `class`, and `drill` on a one-subject parent; a sweep or `change` response never computes it',
  "`escalate: true` on non-STRONG consensus, `depth: thorough`, or a goal that reads as irreversible (delete, deploy, drop, pay, migrate, secret, credential) — don't act on this alone",
  "a probability near 0.50 means the evidence points both ways about equally, not a medium-strength yes — that's exactly why it lands in `unsure` rather than a weak pass",
  "the answer's shape is guaranteed (a number in range, a level that's really one of yours) — whether it's the RIGHT number is what consensus, escalate and your own reading are for, not the schema",
  "`change`'s per-category grade: `fixed` (failed or unsure before, passes now), `still` (failed or unsure before, still doesn't), `regressed` (passed before, not any more — regressed alone fails the gate even when every `after` category passes)",
  '`reused: [SW-####]` names prior runs an answer\'s evidence and question text matched exactly — free, not a new call',
  "`sidewise report hits` flags a one-subject answer `stale` once the code at its own `where` has changed since — re-run it rather than trust it",
  'a run can fail to answer for different reasons, and the exit code says which: a bad request never reaches the classifier (exit 2); a provider or ledger problem does (exit 1); a blocked budget never spends at all (exit 3) — read which one you got before treating a stop as `unsure`',
  'a stop always reads `✖ field: problem → fix`; run `sidewise help <verb>` when one doesn\'t make sense',
];
