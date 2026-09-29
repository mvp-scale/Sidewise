// Phase B's index additions (ledger/index.ts): patternFingerprint, and the four IndexHandle methods
// `sidewise report` is built on — distinctPlaces, patternCounts, recentReplays, recentOutcomes. Same discipline
// as ledger-index.test.ts: every read is checked on both engines (real SQLite and the in-memory fallback), via
// the same `__testOnly.forceFallback` toggle.
import { afterEach, describe, expect, it } from 'vitest';
import { appendContractRun, appendOutcome } from '../../src/ledger/log.ts';
import { __testOnly, patternFingerprint, withIndex } from '../../src/ledger/index.ts';
import { tempProject } from '../helpers/project.ts';
import { sampleContractRun } from '../helpers/runs.ts';

afterEach(() => {
  __testOnly.forceFallback = false;
});

const ENGINES = [false, true]; // real SQLite, then the linear fallback

describe('patternFingerprint', () => {
  it('is stable for the same question set regardless of category order, and differs for a different one', () => {
    const a = { name: 'injection', section: 'concerns' as const, pass: 'no' as const, need: 'all' as const, tags: [], questions: [{ n: 1, kind: 'yesno' as const, text: 'Is X?' }] };
    const b = { name: 'guards', section: 'concerns' as const, pass: 'yes' as const, need: 'all' as const, tags: [], questions: [{ n: 2, kind: 'yesno' as const, text: 'Is Y?' }] };
    const run1 = sampleContractRun({ ask: { categories: [a, b], layers: [] } });
    const run2 = sampleContractRun({ ask: { categories: [b, a], layers: [] } }); // reordered
    const run3 = sampleContractRun({ ask: { categories: [a], layers: [] } }); // fewer questions
    expect(patternFingerprint({ ...run1, kind: 'run', v: 2, id: 'SW-0001', uid: 'u', ts: 't', response: '' })).toBe(
      patternFingerprint({ ...run2, kind: 'run', v: 2, id: 'SW-0002', uid: 'u', ts: 't', response: '' }),
    );
    expect(patternFingerprint({ ...run1, kind: 'run', v: 2, id: 'SW-0001', uid: 'u', ts: 't', response: '' })).not.toBe(
      patternFingerprint({ ...run3, kind: 'run', v: 2, id: 'SW-0003', uid: 'u', ts: 't', response: '' }),
    );
  });
});

describe('report views', () => {
  it('distinctPlaces dedupes across repeated places, on both engines', () => {
    const { paths } = tempProject({});
    appendContractRun(paths, sampleContractRun({ where: ['src/a.ts'] }), Date.now(), 'b');
    appendContractRun(paths, sampleContractRun({ where: ['src/a.ts'] }), Date.now(), 'b'); // same place again
    appendContractRun(paths, sampleContractRun({ where: ['src/b.ts'] }), Date.now(), 'b');
    for (const forceFallback of ENGINES) {
      __testOnly.forceFallback = forceFallback;
      const places = withIndex(paths, (h) => h.distinctPlaces(), { readOnly: true });
      expect(places.filter((p) => p.kind === 'where').map((p) => p.val).sort()).toEqual(['src/a.ts', 'src/b.ts']);
    }
  });

  it('patternCounts groups by question set, with pass/fail/unsure, places and outcomes, on both engines', () => {
    const { paths } = tempProject({});
    // SW-0001, SW-0002: the same question set (sampleContractRun's default ask), different places, both fail.
    appendContractRun(paths, sampleContractRun({ where: ['src/api/user.ts'] }), Date.now(), 'b');
    appendContractRun(paths, sampleContractRun({ where: ['src/other.ts'] }), Date.now(), 'b');
    // SW-0003: a different question set, passes.
    appendContractRun(
      paths,
      sampleContractRun({
        ask: { categories: [{ name: 'guards', section: 'concerns', pass: 'yes', need: 'all', tags: [], questions: [{ n: 1, kind: 'yesno', text: 'Is Y checked?' }] }], layers: [] },
        categories: { guards: 'pass' },
        gate: 'pass',
      }),
      Date.now(),
      'b',
    );
    appendOutcome(paths, 'SW-0001', 'held', 'owner');
    for (const forceFallback of ENGINES) {
      __testOnly.forceFallback = forceFallback;
      const rows = withIndex(paths, (h) => h.patternCounts(), { readOnly: true });
      expect(rows).toHaveLength(2);
      const shared = rows.find((r) => r.runs === 2)!;
      expect(shared).toMatchObject({ runs: 2, pass: 0, fail: 2, unsure: 0, places: 2, outcomes: { held: 1, overruled: 0, failed: 0, open: 1 } });
      const solo = rows.find((r) => r.runs === 1)!;
      expect(solo).toMatchObject({ runs: 1, pass: 1, fail: 0, unsure: 0, places: 1, outcomes: { held: 0, overruled: 0, failed: 0, open: 1 } });
      expect(shared.pattern).not.toBe(solo.pattern);
    }
  });

  it('recentReplays lists only replay-verb runs, newest first, on both engines', () => {
    const { paths } = tempProject({});
    appendContractRun(paths, sampleContractRun({}), Date.now(), 'b'); // SW-0001: class
    appendContractRun(paths, sampleContractRun({ verb: 'replay', parent: 'SW-0001' }), Date.now(), 'b'); // SW-0002: replay
    appendContractRun(paths, sampleContractRun({}), Date.now(), 'b'); // SW-0003: class again
    appendContractRun(paths, sampleContractRun({ verb: 'replay', parent: 'SW-0001' }), Date.now(), 'b'); // SW-0004: replay
    for (const forceFallback of ENGINES) {
      __testOnly.forceFallback = forceFallback;
      const rows = withIndex(paths, (h) => h.recentReplays(10), { readOnly: true });
      expect(rows.map((r) => r.id)).toEqual(['SW-0004', 'SW-0002']);
    }
  });

  it('recentOutcomes lists every recorded outcome, newest first, capped at limit, on both engines', () => {
    const { paths } = tempProject({});
    appendContractRun(paths, sampleContractRun({}), Date.now(), 'b'); // SW-0001
    appendContractRun(paths, sampleContractRun({ where: ['src/other.ts'] }), Date.now(), 'b'); // SW-0002
    appendOutcome(paths, 'SW-0001', 'held', 'owner');
    appendOutcome(paths, 'SW-0002', 'overruled', 'owner');
    for (const forceFallback of ENGINES) {
      __testOnly.forceFallback = forceFallback;
      const rows = withIndex(paths, (h) => h.recentOutcomes(10), { readOnly: true });
      expect(rows.map((r) => [r.runId, r.outcome])).toEqual([
        ['SW-0002', 'overruled'],
        ['SW-0001', 'held'],
      ]);
      const capped = withIndex(paths, (h) => h.recentOutcomes(1), { readOnly: true });
      expect(capped).toHaveLength(1);
      expect(capped[0]!.runId).toBe('SW-0002');
    }
  });
});
