/**
 * Stale notes: "same question, code changed at that place" today re-asks blind;
 * this says so instead. `class.ts` already knows, per question about to be asked fresh, the key its CURRENT
 * evidence hashes to (`toAsk`) — no new file read needed here. This just asks the ledger: did an older run at
 * an overlapping place answer the exact same question text under a DIFFERENT key? If so, the evidence changed
 * since. Scoped to one-subject (class) runs only this round — a sweep's item-shaped evidence isn't
 * reconstructed here; that's future work, not a gap in this feature's own correctness.
 */
import type { AskedQuestion } from '../contract/translate.ts';
import type { Question } from '../contract/types.ts';
import { clip } from '../util/text.ts';
import { readRecordAt, stripLines, withIndex } from './index.ts';
import { isContractRun } from './log.ts';
import type { SidewisePaths } from './paths.ts';

const MAX_STALE_NOTES = 3;

/** Same kind, text and (for scale/choice) the same fixed options — everything that makes two questions "the
 *  same question" independent of the evidence answerKey also hashes in. */
function sameQuestion(older: Question, asking: AskedQuestion): boolean {
  if (older.kind !== asking.kind || older.text !== asking.text) return false;
  if (older.kind === 'scale') return JSON.stringify(older.levels) === JSON.stringify(asking.levels);
  if (older.kind === 'choice') return JSON.stringify(older.options) === JSON.stringify(asking.options);
  return true;
}

/** One note per older run holding a now-stale answer (never one per question — that would clutter the response
 *  for one code change touching several questions at once), capped at `MAX_STALE_NOTES`. */
export function staleNotes(paths: SidewisePaths, where: readonly string[], toAsk: readonly (readonly [AskedQuestion, string])[]): string[] {
  if (!toAsk.length || !where.length) return [];
  const places = [...new Set(where.map(stripLines))];
  return withIndex(
    paths,
    (handle) => {
      const offsets = new Set<number>();
      for (const place of places) for (const c of handle.placeCandidates(place)) offsets.add(c.offset);
      const notes: string[] = [];
      for (const offset of offsets) {
        if (notes.length >= MAX_STALE_NOTES) break;
        const rec = readRecordAt(paths.log, offset);
        if (!rec || !isContractRun(rec) || rec.items !== null) continue; // class-only scope: skip sweeps
        const olderQuestions = rec.ask.categories.flatMap((c) => c.questions);
        for (const [q, key] of toAsk) {
          const match = olderQuestions.find((rq) => sameQuestion(rq, q));
          if (!match) continue;
          const oldKey = rec.keys[String(match.n)];
          if (oldKey === undefined || oldKey === key) continue; // no prior answer, or the evidence hasn't changed
          const ans = rec.answers[String(match.n)];
          const p = ans && ans.kind === 'yesno' ? ` (p ${ans.p.toFixed(2)})` : '';
          notes.push(`stale: ${rec.id} answered "${clip(q.text, 50)}" on older code${p}`);
          break; // one note per older run
        }
      }
      return notes;
    },
    { readOnly: true },
  );
}
