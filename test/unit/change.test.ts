// change: replays a one-subject parent's questions on two states; fixed/still/regressed, a legacy or sweep parent stops.
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ClassifierAnswer, ClassifierPort, ClassifierState } from '../../src/classifier/port.ts';
import { EVIDENCE_LIMITS } from '../../src/evidence/code.ts';
import { hasGit } from '../../src/evidence/git.ts';
import { appendContractRun, appendRun, isContractRun, readLedger } from '../../src/ledger/log.ts';
import { runChange } from '../../src/verbs/change.ts';
import { runClass } from '../../src/verbs/class.ts';
import { gitCommit, gitInit, tempProject } from '../helpers/project.ts';
import { sampleContractRun, sampleRun } from '../helpers/runs.ts';
import { stubProvider } from '../helpers/stub-provider.ts';

const env = { SIDEWISE_ACTOR: 'r' };
const T = Date.parse('2026-09-26T12:00:00Z');

/** Answers by inspecting the evidence text itself ("does state.code contain <marker>?"), not the question id
 *  or which state it's asking about — so a test using this proves fixed/still/regressed come from real content. */
function markerProvider(): ClassifierPort {
  return {
    adapter: 'stub',
    model: 'stub-1',
    async ask(questions, state: ClassifierState) {
      const code = (state.code ?? {}) as Record<string, string>;
      const text = Object.values(code).join('\n');
      const answers: Record<string, ClassifierAnswer> = {};
      for (const q of questions) {
        if (q.type !== 'noul') continue;
        const marker = /contain (\w+)\?/.exec(q.ask)?.[1];
        answers[q.id] = { type: 'noul', probability: marker && text.includes(marker) ? 0.9 : 0.05 };
      }
      return { answers, costUsd: 0 };
    },
  };
}

describe('change', () => {
  it('a class parent that has since been fixed on the worktree: fixed, no regression', async () => {
    const { paths, root } = tempProject({ 'src/a.ts': 'export function f(x) { return db.query(`SELECT * FROM t WHERE id = ${x}`); }\n' });
    const classText =
      'side:\n  goal: fix sql injection\n  depth: quick\n  where: [src/a.ts]\n  ask:\n    injection:\n      pass: no\n      1: Does f put request text into a query?\n      2: q2?\n      3: q3?\n      4: q4?\n      5: q5?\n      6: q6?\n      7: q7?\n      8: q8?\n      9: q9?\n      10: q10?\n';
    await runClass(classText, { paths, provider: stubProvider({ yes: () => 0.9 }), env });
    writeFileSync(path.join(root, 'src/a.ts'), 'export function f(x) { return db.query("SELECT * FROM t WHERE id = ?", [x]); }\n');
    const changeText = 'side:\n  goal: The fix works\n  parent: SW-0001\n  compare: {before: worktree, after: worktree}\n';
    // (before === after === worktree here only to exercise the plumbing without a real git repo; git-evidence.test.ts covers refs.)
    const r = await runChange(changeText, { paths, provider: stubProvider({ yes: () => 0.05 }), env });
    expect(r.exit).toBe(0);
    expect(r.text).toContain('injection: {before: pass, after: pass}');
    expect(r.text).toContain('regressed: []');
    expect(r.text).toContain('reading whole files: line ranges may not match the parent run');
    const [run] = readLedger(paths).filter((x) => isContractRun(x) && x.verb === 'change');
    expect(run).toMatchObject({ verb: 'change', parent: 'SW-0001' });
  });

  it('a sweep parent stops, naming the fix', async () => {
    const { paths } = tempProject({});
    appendContractRun(paths, sampleContractRun({ items: {} }), T, 'b'); // SW-0001: items !== null, a sweep
    const r = await runChange('side:\n  goal: check the fix\n  parent: SW-0001\n  compare: {before: worktree, after: worktree}\n', {
      paths,
      provider: stubProvider(),
      env,
    });
    expect(r.exit).toBe(2);
    expect(r.text).toBe('✖ side.parent: SW-0001 was a sweep → run the sweep again (unchanged items are reused for free)');
  });

  it('a legacy (Plan 1) parent stops', async () => {
    const { paths } = tempProject({});
    appendRun(paths, sampleRun()); // SW-0001: a Plan 1 run, no v: 2
    const r = await runChange('side:\n  goal: check the fix\n  parent: SW-0001\n  compare: {before: worktree, after: worktree}\n', {
      paths,
      provider: stubProvider(),
      env,
    });
    expect(r.exit).toBe(2);
    expect(r.text).toBe('✖ side.parent: SW-0001 predates the YAML contract → run class again on this code');
  });

  it('a parent not in the ledger stops, naming the id', async () => {
    const { paths } = tempProject({});
    const r = await runChange('side:\n  goal: check the fix\n  parent: SW-0042\n  compare: {before: worktree, after: worktree}\n', {
      paths,
      provider: stubProvider(),
      env,
    });
    expect(r.exit).toBe(2);
    expect(r.text).toBe('✖ side.parent: SW-0042 is not in the ledger → check the id');
  });

  it('regressed populated when something got worse: the top-level gate fails even though every "after" category can grade fine on its own', async () => {
    const { paths } = tempProject({ 'src/a.ts': 'anything\n' });
    const parent = sampleContractRun({
      where: ['src/a.ts'],
      ask: {
        categories: [
          {
            name: 'injection',
            pass: 'no',
            need: 'all',
            tags: [],
            questions: [
              { n: 1, kind: 'yesno', text: 'q1?' },
              { n: 2, kind: 'yesno', text: 'q2?' },
            ],
          },
        ],
        layers: [],
      },
      answers: { goal: { kind: 'yesno', p: 0.1 }, '1': { kind: 'yesno', p: 0.05 }, '2': { kind: 'yesno', p: 0.05 } },
      keys: { goal: 'k-goal', '1': 'k-1', '2': 'k-2' },
      categories: { injection: 'pass' },
      gate: 'pass',
    });
    appendContractRun(paths, parent, T, 'b'); // SW-0001

    // Grading is driven entirely by question id here (not file content): question 2 regresses on "after".
    const provider = stubProvider({ yes: (q) => (q.id === 'after:2' ? 0.95 : 0.05) });
    const r = await runChange('side:\n  goal: verify no regressions\n  parent: SW-0001\n  compare: {before: worktree, after: worktree}\n', {
      paths,
      provider,
      env,
    });

    expect(r.exit).toBe(0);
    expect(r.text).toContain('gate: fail');
    expect(r.text).toContain('regressed: [2]');
    expect(r.text).toContain('injection: {before: pass, after: fail}');
  });

  it('the top gate fails from a regression alone, even though the "after" category still passes on its own (need: any)', async () => {
    const { paths } = tempProject({ 'src/a.ts': 'anything\n' });
    const parent = sampleContractRun({
      where: ['src/a.ts'],
      ask: {
        categories: [
          {
            name: 'injection',
            pass: 'no',
            need: 'any', // only one question needs to pass for the category itself to pass
            tags: [],
            questions: [
              { n: 1, kind: 'yesno', text: 'q1?' },
              { n: 2, kind: 'yesno', text: 'q2?' },
            ],
          },
        ],
        layers: [],
      },
      answers: { goal: { kind: 'yesno', p: 0.1 }, '1': { kind: 'yesno', p: 0.05 }, '2': { kind: 'yesno', p: 0.05 } },
      keys: { goal: 'k-goal', '1': 'k-1', '2': 'k-2' },
      categories: { injection: 'pass' },
      gate: 'pass',
    });
    appendContractRun(paths, parent, T, 'b'); // SW-0001

    // goal passes; question 1 passes both before and after; only question 2 regresses. With need: any, the
    // "after" category grades pass on its own (question 1 alone clears it) and so would combine() alone — only
    // the regressed-length override (change.ts) can be forcing gate: fail here, which is what this test pins.
    const provider = stubProvider({ yes: (q) => (q.id === 'goal' ? 0.9 : q.id === 'after:2' ? 0.95 : 0.05) });
    const r = await runChange('side:\n  goal: verify no regressions\n  parent: SW-0001\n  compare: {before: worktree, after: worktree}\n', {
      paths,
      provider,
      env,
    });

    expect(r.exit).toBe(0);
    expect(r.text).toContain('injection: {before: pass, after: pass}'); // the "after" category is clean on its own
    expect(r.text).toContain('regressed: [2]');
    expect(r.text).toContain('gate: fail'); // ...yet the top gate still fails, from the regression alone
  });

  it('two real git refs: fixed/still/regressed come from the actual file content across two commits, not the ref name or question id', async (ctx) => {
    if (!hasGit()) return ctx.skip();
    const { paths, root } = tempProject({ 'src/a.ts': 'export function f(x) {\n  return db.query(`SELECT * FROM t WHERE id = ${x}`); // VULN STILL_BAD\n}\n' });
    gitInit(root);
    const beforeRef = gitCommit(root, 'vulnerable');

    const parent = sampleContractRun({
      where: ['src/a.ts'],
      ask: {
        categories: [
          {
            name: 'injection',
            pass: 'no',
            need: 'all',
            tags: [],
            questions: [
              { n: 1, kind: 'yesno', text: 'Does the file contain VULN?' },
              { n: 2, kind: 'yesno', text: 'Does the file contain STILL_BAD?' },
              { n: 3, kind: 'yesno', text: 'Does the file contain NEW_BUG?' },
            ],
          },
        ],
        layers: [],
      },
      answers: { goal: { kind: 'yesno', p: 0.1 }, '1': { kind: 'yesno', p: 0.9 }, '2': { kind: 'yesno', p: 0.9 }, '3': { kind: 'yesno', p: 0.05 } },
      keys: { goal: 'k-goal', '1': 'k-1', '2': 'k-2', '3': 'k-3' },
      categories: { injection: 'fail' },
      gate: 'fail',
    });
    appendContractRun(paths, parent, T, 'b'); // SW-0001

    // A partial fix: VULN is gone (fixed), STILL_BAD remains (still), and the refactor introduces NEW_BUG (regressed).
    writeFileSync(path.join(root, 'src/a.ts'), 'export function f(x) {\n  return db.query("SELECT * FROM t WHERE id = ?", [x]); // STILL_BAD NEW_BUG\n}\n');
    const afterRef = gitCommit(root, 'partial fix, new bug');

    const r = await runChange(`side:\n  goal: verify the partial fix\n  parent: SW-0001\n  compare: {before: ${beforeRef}, after: ${afterRef}}\n`, {
      paths,
      provider: markerProvider(),
      env,
    });

    expect(r.exit).toBe(0);
    expect(r.text).toContain('injection: {before: fail, after: fail, fixed: [1], still: [2]}');
    expect(r.text).toContain('regressed: [3]');
    expect(r.text).toContain('gate: fail');
  });

  it('the "reading whole files" note appears once, even though both states are read', async () => {
    const { paths } = tempProject({ 'src/a.ts': 'anything\n' });
    appendContractRun(paths, sampleContractRun({ where: ['src/a.ts'] }), T, 'b'); // SW-0001
    const provider = stubProvider({ yes: () => 0.05 });
    const r = await runChange('side:\n  goal: check note dedupe\n  parent: SW-0001\n  compare: {before: worktree, after: worktree}\n', { paths, provider, env });
    expect(r.exit).toBe(0);
    expect(r.text.match(/reading whole files/g)).toHaveLength(1);
  });

  it('two line-ranges on the same file in the parent are read (and charged) once, not twice', async () => {
    const a = 'x'.repeat(EVIDENCE_LIMITS.perFileChars); // exactly the per-file cap: no per-file truncation note on its own
    const b = 'y'.repeat(100);
    const { paths } = tempProject({ 'src/a.ts': a, 'src/b.ts': b });
    const parent = sampleContractRun({
      where: ['src/a.ts:1-10', 'src/a.ts:20-30', 'src/a.ts:40-50', 'src/b.ts'], // 3 ranges on a.ts, deduped to one file read
      ask: { categories: [{ name: 'injection', pass: 'no', need: 'all', tags: [], questions: [{ n: 1, kind: 'yesno', text: 'q1?' }] }], layers: [] },
      answers: { goal: { kind: 'yesno', p: 0.1 }, '1': { kind: 'yesno', p: 0.05 } },
      keys: { goal: 'k-goal', '1': 'k-1' },
      categories: { injection: 'pass' },
      gate: 'pass',
    });
    appendContractRun(paths, parent, T, 'b'); // SW-0001
    const provider = stubProvider({ yes: () => 0.05 });
    const r = await runChange('side:\n  goal: check file dedupe\n  parent: SW-0001\n  compare: {before: worktree, after: worktree}\n', { paths, provider, env });
    expect(r.exit).toBe(0);
    // Unduped, the 3 ranges on a.ts alone would spend the whole 60,000-char total budget, leaving nothing for b.ts.
    expect(r.text).not.toContain('evidence limit reached');
  });

  it('--dry-run: no provider call, no git, questions = n*2+1 (Controller ruling)', async () => {
    const { paths } = tempProject({});
    appendContractRun(paths, sampleContractRun(), T, 'b'); // SW-0001: 1 question
    const provider = stubProvider();
    const r = await runChange('side:\n  goal: dry run check\n  parent: SW-0001\n  compare: {before: main, after: HEAD}\n', {
      paths,
      provider,
      env,
      dryRun: true,
    });
    expect(r.exit).toBe(0);
    expect(r.text).toBe('plan:\n  calls: 2\n  questions: 3\nnotes: ["dry run: no call, no spend"]\n');
    expect(provider.calls).toHaveLength(0);
    expect(readLedger(paths).filter((x) => isContractRun(x) && x.verb === 'change')).toEqual([]);
  });
});
