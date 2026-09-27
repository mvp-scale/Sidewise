// sidewise report [hits|patterns|history]: free, read-only, no options beyond the view name. Every view is
// checked on both engines (real SQLite and the linear fallback) — report must work unchanged when the on-disk
// index is absent, exactly like view.ts already does.
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { __testOnly } from '../../src/ledger/index.ts';
import { appendContractRun, appendOutcome } from '../../src/ledger/log.ts';
import { runReport } from '../../src/verbs/report.ts';
import { tempProject } from '../helpers/project.ts';
import { sampleContractRun } from '../helpers/runs.ts';

afterEach(() => {
  __testOnly.forceFallback = false;
});

const ENGINES = [false, true];

describe('runReport', () => {
  it('[C-162] [C-167] defaults to hits, and rejects an unknown view', () => {
    const { paths } = tempProject({});
    const r = runReport(undefined, { paths });
    expect(r.exit).toBe(0);
    expect(r.text).toContain('sidewise report hits');
    const bad = runReport('nonsense', { paths });
    expect(bad.exit).toBe(2);
    expect(bad.text).toBe('✖ report: "nonsense" is not a view → use hits, patterns or history');
  });

  it('hits: no runs yet says so plainly', () => {
    const { paths } = tempProject({});
    expect(runReport('hits', { paths }).text).toBe('sidewise report hits · no runs yet → "sidewise class <request>" starts one');
  });

  it('[C-163] hits: the newest run per place, worst gate first, on both engines', () => {
    const { root, paths } = tempProject({ 'src/user.ts': 'original code' });
    appendContractRun(paths, sampleContractRun({ where: ['src/user.ts'], categories: { guards: 'pass' } }), Date.now(), 'b'); // SW-0001: pass
    appendContractRun(paths, sampleContractRun({ where: ['src/other.ts'], categories: { injection: 'fail' } }), Date.now(), 'b'); // SW-0002: fail
    for (const forceFallback of ENGINES) {
      __testOnly.forceFallback = forceFallback;
      const r = runReport('hits', { paths });
      expect(r.exit).toBe(0);
      const lines = r.text.split('\n');
      expect(lines[0]).toBe('sidewise report hits · 2 rows');
      // worst (fail) first, regardless of place name order.
      expect(lines[1]).toContain('src/other.ts · injection fail · SW-0002');
      expect(lines[2]).toContain('src/user.ts · guards pass · SW-0001');
    }
    void root;
  });

  it('[C-163] hits: flags a one-subject answer as stale once the code at its place has changed', () => {
    const { root, paths } = tempProject({ 'src/user.ts': 'original code' });
    const run = sampleContractRun({
      where: ['src/user.ts'],
      ask: { categories: [{ name: 'guards', pass: 'yes', need: 'all', tags: [], questions: [{ n: 1, kind: 'yesno', text: 'Is it guarded?' }] }], layers: [] },
      categories: { guards: 'pass' },
      keys: { goal: 'k-goal', '1': 'k-1-on-original-code' }, // deliberately not the real hash: forces a mismatch below
    });
    appendContractRun(paths, run, Date.now(), 'b');
    writeFileSync(path.join(root, 'src/user.ts'), 'changed code');
    for (const forceFallback of ENGINES) {
      __testOnly.forceFallback = forceFallback;
      expect(runReport('hits', { paths }).text).toContain('· stale');
    }
  });

  it('[C-164] patterns: no runs yet says so plainly, else groups by question set with pass/fail/places/outcomes', () => {
    const { paths } = tempProject({});
    expect(runReport('patterns', { paths }).text).toBe('sidewise report patterns · no runs yet → "sidewise class <request>" starts one');
    appendContractRun(paths, sampleContractRun({ where: ['src/a.ts'] }), Date.now(), 'b'); // SW-0001
    appendContractRun(paths, sampleContractRun({ where: ['src/b.ts'] }), Date.now(), 'b'); // SW-0002, same question set
    appendOutcome(paths, 'SW-0001', 'held', 'owner');
    for (const forceFallback of ENGINES) {
      __testOnly.forceFallback = forceFallback;
      const r = runReport('patterns', { paths });
      expect(r.exit).toBe(0);
      expect(r.text).toContain('sidewise report patterns · 1 pattern');
      expect(r.text).toMatch(/runs 2 · places 2 · pass 0 fail 2 unsure 0 · held 1 overruled 0 failed 0 open 1/);
    }
  });

  it('[C-165] history: no events yet says so plainly, else merges change results and outcomes newest first', () => {
    const { paths } = tempProject({});
    expect(runReport('history', { paths }).text).toBe('sidewise report history · nothing yet → run "change" or "outcome" to start one');
    const oneQuestion = { name: 'guards', pass: 'yes' as const, need: 'all' as const, tags: [], questions: [{ n: 1, kind: 'yesno' as const, text: 'q1?' }] };
    appendContractRun(paths, sampleContractRun({ where: ['src/a.ts'], categories: { guards: 'fail' } }), Date.now(), 'b'); // SW-0001
    appendContractRun(
      paths,
      sampleContractRun({
        verb: 'change',
        parent: 'SW-0001',
        where: ['src/a.ts'],
        ask: { categories: [oneQuestion], layers: [] },
        // genuinely fixed: before misses, after passes.
        answers: { goal: { kind: 'yesno', p: 0.9 }, 'before:1': { kind: 'yesno', p: 0.1 }, 'after:1': { kind: 'yesno', p: 0.9 } },
        categories: { guards: 'pass' },
      }),
      Date.now(),
      'b',
    ); // SW-0002: fixed
    appendOutcome(paths, 'SW-0001', 'overruled', 'owner');
    // A second parent whose OWN stored gate is stale/misleading relative to this change's real before/after —
    // exactly the SW-0006 shape the reviewer found: internally regressed, but a parent-vs-after comparison
    // would call it "fixed" since parent.categories.guards ('unsure') isn't 'pass' while the change's own
    // stored after-gate is 'pass'.
    const threeQuestions = {
      name: 'guards',
      pass: 'yes' as const,
      need: 'any' as const,
      tags: [],
      questions: [
        { n: 1, kind: 'yesno' as const, text: 'q1?' },
        { n: 2, kind: 'yesno' as const, text: 'q2?' },
        { n: 3, kind: 'yesno' as const, text: 'q3?' },
      ],
    };
    appendContractRun(paths, sampleContractRun({ where: ['src/b.ts'], categories: { guards: 'unsure' } }), Date.now(), 'b'); // SW-0003
    appendContractRun(
      paths,
      sampleContractRun({
        verb: 'change',
        parent: 'SW-0003',
        where: ['src/b.ts'],
        ask: { categories: [threeQuestions], layers: [] },
        answers: {
          goal: { kind: 'yesno', p: 0.9 },
          // q1 regresses (pass -> miss); q3 is fixed (miss -> pass); need:any keeps the category gate 'pass'
          // both before and after, so only the run's own regressed list — never a category-gate comparison —
          // can catch this.
          'before:1': { kind: 'yesno', p: 0.9 },
          'before:2': { kind: 'yesno', p: 0.9 },
          'before:3': { kind: 'yesno', p: 0.1 },
          'after:1': { kind: 'yesno', p: 0.1 },
          'after:2': { kind: 'yesno', p: 0.9 },
          'after:3': { kind: 'yesno', p: 0.9 },
        },
        categories: { guards: 'pass' },
      }),
      Date.now(),
      'b',
    ); // SW-0004: regressed (SW-0006-shaped bug)
    for (const forceFallback of ENGINES) {
      __testOnly.forceFallback = forceFallback;
      const r = runReport('history', { paths });
      expect(r.exit).toBe(0);
      expect(r.text).toContain('src/a.ts · SW-0002 change · fixed');
      expect(r.text).toContain('src/b.ts · SW-0004 change · regressed');
      expect(r.text).toContain('src/a.ts · SW-0001 · overruled by owner');
    }
  });

  it('[C-162] works on the linear-fallback engine too (no on-disk index — the Node < 22.13 test-hook path)', () => {
    const { paths } = tempProject({});
    appendContractRun(paths, sampleContractRun({}), Date.now(), 'b');
    __testOnly.forceFallback = true;
    const r = runReport('hits', { paths });
    expect(r.exit).toBe(0);
    expect(r.text).toContain('sidewise report hits · 1 row');
  });

  it('[C-166] every view caps its rows and says how many more exist, rather than dropping them silently', () => {
    const { paths } = tempProject({});
    for (let i = 0; i < 31; i++) {
      appendContractRun(
        paths,
        sampleContractRun({
          where: [`src/f${i}.ts`],
          ask: { categories: [{ name: `cat${i}`, pass: 'yes', need: 'all', tags: [], questions: [{ n: 1, kind: 'yesno', text: `question ${i}?` }] }], layers: [] },
          categories: { [`cat${i}`]: 'pass' },
        }),
        Date.now(),
        'b',
      );
    }
    const r = runReport('patterns', { paths });
    expect(r.text).toContain('sidewise report patterns · 31 patterns');
    expect(r.text).toContain('… 1 more not shown');
    expect(r.text.split('\n')).toHaveLength(32); // heading + 30 rows + the "more" trailer
  });
});
