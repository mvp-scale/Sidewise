// reusedAgeNotes is the "smaller format change" the plan allows for verbs other than view
// (class/drill/replay/sweeps): the existing `reused: [ids]` list stays as-is, and this adds ONE notes: line
// naming each distinct id's own age/commits-since.
import { describe, expect, it } from 'vitest';
import { appendContractRun } from '../../src/ledger/log.ts';
import { reusedAgeNotes } from '../../src/ledger/reuse.ts';
import { sampleContractRun } from '../helpers/runs.ts';
import { tempProject } from '../helpers/project.ts';

describe('reusedAgeNotes', () => {
  it('empty ids: no note at all', () => {
    const { paths } = tempProject({});
    expect(reusedAgeNotes(paths, [])).toEqual([]);
  });

  it('one id: names it with its own age in days', () => {
    const { paths } = tempProject({});
    const threeDaysAgo = Date.now() - 3 * 86_400_000;
    const run = appendContractRun(paths, sampleContractRun(), threeDaysAgo, 'free');
    const notes = reusedAgeNotes(paths, [run.id]);
    expect(notes).toHaveLength(1);
    expect(notes[0]).toBe(`reused: ${run.id} (3d)`);
  });

  it('an id not in the ledger reads as age unknown rather than throwing', () => {
    const { paths } = tempProject({});
    expect(reusedAgeNotes(paths, ['MM3-9999'])).toEqual(['reused: MM3-9999 (age unknown)']);
  });

  it('caps at 5 ids, naming how many more', () => {
    const { paths } = tempProject({});
    const ids: string[] = [];
    for (let i = 0; i < 7; i++) ids.push(appendContractRun(paths, sampleContractRun(), Date.now(), 'free').id);
    const notes = reusedAgeNotes(paths, ids);
    expect(notes).toHaveLength(1);
    expect(notes[0]).toContain('+2 more');
  });
});
