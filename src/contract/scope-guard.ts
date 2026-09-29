/**
 * The scope guard: out-of-scope evidence is the root of every unreliable answer — a question that depends on
 * code outside `where` still gets a confident-looking mid-range number back from the classifier. This is a
 * hidden per-category probe, "can this be judged from the code shown?", plus what a low answer does to that
 * category's own gate.
 *
 * BUILT BUT NOT WIRED IN. Wiring this in changes what gets asked, so it needs a before/after measurement on a
 * small fixed set first, plus an owner call on the result. These two functions are ready and unit-tested, but
 * nothing calls them yet. Wiring this in later needs:
 *   1. one extra `scopeProbeQuestion(name)` added alongside a category's own questions in class.ts (only for
 *      categories being freshly asked, not reused — a reused answer already came from evidence that passed
 *      this check once);
 *   2. one more id in that call's `askAll` question list, and its answer read back the same way any other
 *      yes/no answer is (contract/grade.ts's `toAnswer`-shaped handling in verbs/pay.ts);
 *   3. `applyScopeGuard` folded into `gradeCategory`'s own result (contract/grade.ts) so the forced `unsure`
 *      and its note reach the category's gate and the response's `notes:`, the same way any other note does.
 */
import { markOf } from './grade.ts';
import type { AskedQuestion } from './translate.ts';
import type { Gate } from './types.ts';

/** One hidden yes/no question per category: never authored by the caller, never shown as a numbered question
 *  in the request or response — its id (`<category>__scope`) is namespaced so it can never collide with a
 *  real question's own "1".."N" id. */
export function scopeProbeQuestion(categoryName: string): AskedQuestion {
  return {
    id: `${categoryName}__scope`,
    n: null,
    kind: 'yesno',
    text: `Can ${categoryName} be judged from only the code shown, with nothing important left out?`,
  };
}

/** `probeP`: P(yes) that the probe above was answerable from the code shown. A clear miss (<= 1 - BAR, the
 *  same bar every other yes/no answer clears) means the evidence was out of scope: the category's gate is
 *  forced to `unsure` regardless of what it graded to on its own, with a note saying so. A clear pass or a
 *  mid-range probe leaves the gate exactly as it was, no note. */
export function applyScopeGuard(gate: Gate, probeP: number, categoryName: string): { gate: Gate; note?: string } {
  if (markOf(probeP) !== 'miss') return { gate };
  return { gate: 'unsure', note: `evidence not in scope for ${categoryName} → add more of the surrounding code` };
}
