// stale.ts's staleNotes: one note per DISTINCT ORIGIN of a now-stale answer, never one per ledger record —
// several fully-reused copies of the same origin must not burn the note budget on duplicates.
import { describe, expect, it } from 'vitest';
import { staleNotes } from '../../src/ledger/stale.ts';
import { appendContractRun } from '../../src/ledger/log.ts';
import { tempProject } from '../helpers/project.ts';
import { sampleContractRun } from '../helpers/runs.ts';

const GUARDS = { name: 'guards', pass: 'yes' as const, need: 'all' as const, tags: [], questions: [{ n: 1, kind: 'yesno' as const, text: 'Is it guarded?' }] };

describe('staleNotes', () => {
  it('dedupes by origin: several reuse copies of one run produce exactly one stale note, not one each', () => {
    const { paths } = tempProject({ 'src/user.ts': 'original code' });
    // SW-0001: the origin, answered question 1 on the original code.
    appendContractRun(
      paths,
      sampleContractRun({
        where: ['src/user.ts'],
        ask: { categories: [GUARDS], layers: [] },
        keys: { goal: 'k-goal', '1': 'k-1-old' },
        answers: { goal: { kind: 'yesno', p: 0.5 }, '1': { kind: 'yesno', p: 0.94 } },
        reusedFrom: {},
      }),
      Date.now(),
      'b',
    );
    // SW-0002/3/4: three runs that all reused SW-0001's answer to question 1 (same key, same value), each
    // recorded at the same place.
    for (let i = 0; i < 3; i++) {
      appendContractRun(
        paths,
        sampleContractRun({
          where: ['src/user.ts'],
          ask: { categories: [GUARDS], layers: [] },
          keys: { goal: 'k-goal', '1': 'k-1-old' },
          answers: { goal: { kind: 'yesno', p: 0.5 }, '1': { kind: 'yesno', p: 0.94 } },
          reusedFrom: { '1': 'SW-0001' },
        }),
        Date.now(),
        'b',
      );
    }
    // Asking the same question again now that the code (and so the evidence key) has changed: every one of
    // the four ledger records above matches and holds a stale key, but all four trace back to the same origin.
    const toAsk = [[{ id: '1', n: 1, kind: 'yesno' as const, text: 'Is it guarded?' }, 'k-1-new'] as const];
    const notes = staleNotes(paths, ['src/user.ts'], toAsk);
    expect(notes).toHaveLength(1);
    expect(notes[0]).toContain('SW-0001 answered "Is it guarded?" on older code (p 0.94)');
  });

  it('distinct origins each still get their own note, up to the cap', () => {
    const { paths } = tempProject({ 'src/user.ts': 'original code' });
    for (let i = 0; i < 4; i++) {
      appendContractRun(
        paths,
        sampleContractRun({
          where: ['src/user.ts'],
          ask: { categories: [GUARDS], layers: [] },
          keys: { goal: 'k-goal', '1': `k-1-old-${i}` },
          answers: { goal: { kind: 'yesno', p: 0.5 }, '1': { kind: 'yesno', p: 0.94 } },
          reusedFrom: {},
        }),
        Date.now(),
        'b',
      );
    }
    const toAsk = [[{ id: '1', n: 1, kind: 'yesno' as const, text: 'Is it guarded?' }, 'k-1-new'] as const];
    const notes = staleNotes(paths, ['src/user.ts'], toAsk);
    expect(notes).toHaveLength(3); // capped at MAX_STALE_NOTES, four distinct origins available
  });
});
