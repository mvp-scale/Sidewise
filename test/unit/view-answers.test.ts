import { describe, expect, it } from 'vitest';
import { appendContractRun, appendRun } from '../../src/ledger/log.ts';
import { runView } from '../../src/verbs/view.ts';
import { tempProject } from '../helpers/project.ts';
import { sampleContractRun, sampleRun } from '../helpers/runs.ts';

describe('view: --answers [C-215]', () => {
  it('a one-subject run id lists each question: text, answer, reuse origin and key', () => {
    const { paths } = tempProject({});
    appendContractRun(paths, sampleContractRun({ reusedFrom: { goal: 'MM3-0099' } }), Date.now(), 'b'); // MM3-0001
    const r = runView('MM3-0001', 1, { paths, env: {} }, undefined, false, true);
    expect(r.exit).toBe(0);
    const lines = r.text.split('\n');
    expect(lines).toContain('  answers 2:');
    expect(lines).toContain('    goal "The handler is safe to merge" · p 0.2 · reused MM3-0099 · key k-goal');
    expect(lines).toContain('    1 "Is request text in the query?" · p 0.9 · key k-1');
  });

  it('is ignored unless explicitly requested — the default output has no answers block', () => {
    const { paths } = tempProject({});
    appendContractRun(paths, sampleContractRun(), Date.now(), 'b'); // MM3-0001
    expect(runView('MM3-0001', 1, { paths, env: {} }).text).not.toContain('answers');
  });

  it("a sweep's questions are its items' own (`<item id>#<n>`, filled in) — not the empty request-level ask", () => {
    const { paths } = tempProject({});
    const run = sampleContractRun({
      verb: 'scan',
      where: [],
      ask: {
        categories: [],
        layers: [{ name: 'file', categories: [{ name: 'injection', section: 'concerns', pass: 'no', need: 'all', tags: [], questions: [{ n: 1, kind: 'yesno', text: 'Is {file} safe?' }] }] }],
      },
      items: { 'src/a.ts': { layer: 'file', fill: { file: 'src/a.ts' }, status: 'asked', gate: 'fail', categories: { injection: 'fail' } } },
      categories: {},
      answers: { 'src/a.ts#1': { kind: 'yesno', p: 0.7 } },
      keys: { 'src/a.ts#1': 'k-item-1' },
      reusedFrom: {},
    });
    appendContractRun(paths, run, Date.now(), 'b'); // MM3-0001
    const lines = runView('MM3-0001', 1, { paths, env: {} }, undefined, false, true).text.split('\n');
    expect(lines).toContain('  answers 1:');
    expect(lines).toContain('    src/a.ts#1 "Is src/a.ts safe?" · p 0.7 · key k-item-1');
  });

  it('a legacy (Plan 1) run id is a silent no-op, same idiom as --level above 1 (C-123)', () => {
    const { paths } = tempProject({});
    appendRun(paths, sampleRun({ focus: 'legacy' }));
    const withFlag = runView('MM3-0001', 1, { paths, env: {} }, undefined, false, true).text;
    const withoutFlag = runView('MM3-0001', 1, { paths, env: {} }).text;
    expect(withFlag).toBe(withoutFlag);
  });

  it('is ignored for a place/tag target, same restriction --summary has in reverse (C-124)', () => {
    const { paths } = tempProject({});
    appendContractRun(paths, sampleContractRun(), Date.now(), 'b'); // MM3-0001, where: [src/api/user.ts]
    const withFlag = runView('src', 1, { paths, env: {} }, undefined, false, true).text;
    const withoutFlag = runView('src', 1, { paths, env: {} }).text;
    expect(withFlag).toBe(withoutFlag);
  });
});
