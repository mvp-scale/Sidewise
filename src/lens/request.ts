/**
 * What's left of Plan 1's request model after the YAML contract retired its text format: `Level`
 * (view's L1/2/3) and `Place` (the plain-text place/id-mode run history, and the legacy `RunRecord.where`
 * shape `ledger/log.ts` still reads). `VERBS`/`Verb` live in `contract/types.ts` now; nothing else here
 * survived.
 */
export type Level = 1 | 2 | 3;

export interface Place {
  path: string;
  /** "10" or "10-24", 1-indexed, inclusive. */
  lines?: string;
  area?: string;
}
