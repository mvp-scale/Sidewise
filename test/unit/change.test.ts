// change: replays a one-subject parent's questions on two states; fixed/still/regressed, a legacy or sweep parent stops.
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { appendContractRun, appendRun, isContractRun, readLedger } from '../../src/ledger/log.ts';
import { runChange } from '../../src/verbs/change.ts';
import { runClass } from '../../src/verbs/class.ts';
import { tempProject } from '../helpers/project.ts';
import { sampleContractRun, sampleRun } from '../helpers/runs.ts';
import { stubProvider } from '../helpers/stub-provider.ts';

const env = { SIDEWISE_ACTOR: 'r' };
const T = Date.parse('2026-09-26T12:00:00Z');

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
