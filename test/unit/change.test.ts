// change: replays a one-subject parent's questions on two states; fixed/still/regressed, a legacy or sweep parent stops.
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ClassifierAnswer, ClassifierPort, ClassifierState } from '../../src/classifier/port.ts';
import { EVIDENCE_LIMITS } from '../../src/evidence/code.ts';
import { hasGit } from '../../src/evidence/git.ts';
import { appendContractRun, appendRun, isContractRun, readLedger } from '../../src/ledger/log.ts';
import { setBudget } from '../../src/budget/budget.ts';
import { runChange } from '../../src/verbs/change.ts';
import { runClass } from '../../src/verbs/class.ts';
import { gitCommit, gitInit, tempProject } from '../helpers/project.ts';
import { sampleContractRun, sampleRun } from '../helpers/runs.ts';
import { stubProvider, type Stub } from '../helpers/stub-provider.ts';

/** Wraps a stub so its answer reports an estimated cost, without changing stub-provider.ts (shared by other crews). */
const withEstimatedCost = (inner: Stub): Stub => ({ ...inner, ask: async (q, s) => ({ ...(await inner.ask(q, s)), costEstimated: true }) });

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
  it('a class parent that has since been fixed on the worktree: fixed, no regression [C-060]', async () => {
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

  it('a sweep parent stops, naming the fix [C-063]', async () => {
    const { paths } = tempProject({});
    appendContractRun(paths, sampleContractRun({ items: {} }), T, 'b'); // SW-0001: items !== null, a sweep
    const r = await runChange('side:\n  goal: check the fix\n  parent: SW-0001\n  compare: {before: worktree, after: worktree}\n', {
      paths,
      provider: stubProvider(),
      env,
    });
    expect(r.exit).toBe(2);
    expect(r.text).toBe('✖ side.parent: SW-0001 was a sweep → run the sweep again (unchanged items are reused for free)\n→ see: sidewise agent change');
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
    expect(r.text).toBe('✖ side.parent: SW-0001 predates the YAML contract → run class again on this code\n→ see: sidewise agent change');
  });

  it('a parent not in the ledger stops, naming the id', async () => {
    const { paths } = tempProject({});
    const r = await runChange('side:\n  goal: check the fix\n  parent: SW-0042\n  compare: {before: worktree, after: worktree}\n', {
      paths,
      provider: stubProvider(),
      env,
    });
    expect(r.exit).toBe(2);
    expect(r.text).toBe('✖ side.parent: SW-0042 is not in the ledger → check the id\n→ see: sidewise agent change');
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

  it('the top gate fails from a regression alone, even though the "after" category still passes on its own (need: any) [C-091]', async () => {
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
    // The fake/stub provider pins these answers so the regression-only case is forced deterministically.
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
    // outcomeNext's own "which category matches the overall gate?" search finds nothing here (injection itself
    // grades pass), so unpatched this fell through to GOAL_ONLY_NEXT ("the goal missed though every part
    // passed") even though the goal passed too — regressed: must be named instead, per C-065.
    expect(r.text).not.toContain('the goal missed though every part passed');
    expect(r.text).toContain('next: sidewise template drill --parent SW-0002 --from injection');
  });

  it('two real git refs: fixed/still/regressed come from the actual file content across two commits, not the ref name or question id [C-064]', async (ctx) => {
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

  it('--dry-run: no provider call, questions = n*2+1 (Controller ruling) [C-088]', async (ctx) => {
    if (!hasGit()) return ctx.skip();
    const { paths, root } = tempProject({ 'src/api/user.ts': 'x\n' });
    gitInit(root);
    const rev = gitCommit(root, 'init'); // whatever git init's own default branch is named, HEAD/the sha always resolve
    appendContractRun(paths, sampleContractRun(), T, 'b'); // SW-0001: 1 question
    const provider = stubProvider();
    const r = await runChange(`side:\n  goal: dry run check\n  parent: SW-0001\n  compare: {before: ${rev}, after: HEAD}\n`, {
      paths,
      provider,
      env,
      dryRun: true,
    });
    expect(r.exit).toBe(0);
    expect(r.text).toBe('plan:\n  calls: 2\n  questions: 3\n  reused: 0\n  route: fake\nnotes: ["dry run: no call, no spend"]\n');
    expect(provider.calls).toHaveLength(0);
    expect(readLedger(paths).filter((x) => isContractRun(x) && x.verb === 'change')).toEqual([]);
  });

  // Fix #13/#5: --dry-run used to return before ever reading a ref, so a typo'd or nonexistent ref looked
  // fine until the real (paid) run. It now checks the same way class/scan/drill/loop already do: evidence
  // (here, both git refs) is read before the dry-run branch, not after. [C-148]
  it('--dry-run stops on a ref that does not exist, same as a real run would', async (ctx) => {
    if (!hasGit()) return ctx.skip();
    const { paths, root } = tempProject({ 'src/api/user.ts': 'x\n' });
    gitInit(root);
    gitCommit(root, 'init');
    appendContractRun(paths, sampleContractRun(), T, 'b'); // SW-0001
    const provider = stubProvider();
    const r = await runChange('side:\n  goal: dry run check\n  parent: SW-0001\n  compare: {before: not-a-real-ref-xyz, after: HEAD}\n', {
      paths,
      provider,
      env,
      dryRun: true,
    });
    expect(r.exit).toBe(2);
    expect(r.text).toContain('not found by git');
    expect(provider.calls).toHaveLength(0);
  });

  // Fix #5/#6 follow-through: same pattern as class.ts/scan.ts.
  const classReq =
    'side:\n  goal: check this code\n  depth: quick\n  where: [src/a.ts]\n  ask:\n    injection:\n      pass: no\n' +
    Array.from({ length: 10 }, (_, i) => `      ${i + 1}: is question ${i + 1} true?\n`).join('');
  const changeReq = 'side:\n  goal: verify the fix\n  parent: SW-0001\n  compare: {before: worktree, after: worktree}\n';

  it('a fully-reused change is never blocked by an already-reached cap, and names the runs it reused [C-152]', async () => {
    const { paths } = tempProject({ 'src/a.ts': 'export function f(x) { return db.query(`x ${x}`); }\n' });
    await runClass(classReq, { paths, provider: stubProvider({ yes: () => 0.9 }), env }); // SW-0001, 1 run
    await runChange(changeReq, { paths, provider: stubProvider({ yes: () => 0.9 }), env }); // SW-0002, 1 run
    setBudget(paths, { capRuns: 2 }); // exactly used up by the two runs above
    const r = await runChange(changeReq, { paths, provider: stubProvider(), env }); // fully reused: no call needed
    expect(r.exit).toBe(0);
    expect(r.text).toContain('reused: [');
  });

  it('notes when the cost was estimated from tokens (fix #4), same as class.ts', async () => {
    const { paths } = tempProject({ 'src/a.ts': 'export function f(x) { return db.query(`x ${x}`); }\n' });
    await runClass(classReq, { paths, provider: stubProvider({ yes: () => 0.9 }), env });
    const r = await runChange(changeReq, { paths, provider: withEstimatedCost(stubProvider({ yes: () => 0.9 })), env });
    expect(r.exit).toBe(0);
    expect(r.text).toContain('cost estimated from tokens (no live pricing reported)');
  });

  it('on gate: pass (goal and every category clear, nothing regressed), next: records the outcome held on the parent [C-065]', async () => {
    const { paths } = tempProject({ 'src/a.ts': 'anything\n' });
    const parent = sampleContractRun({
      where: ['src/a.ts'],
      ask: { categories: [{ name: 'injection', pass: 'no', need: 'all', tags: [], questions: [{ n: 1, kind: 'yesno', text: 'q1?' }] }], layers: [] },
      answers: { goal: { kind: 'yesno', p: 0.1 }, '1': { kind: 'yesno', p: 0.05 } },
      keys: { goal: 'k-goal', '1': 'k-1' },
      categories: { injection: 'pass' },
      gate: 'pass',
    });
    appendContractRun(paths, parent, T, 'b'); // SW-0001
    // goal clears the bar (0.9 ≥ 0.70); the "no" category clears it too (1 - 0.05 = 0.95), before and after alike.
    const provider = stubProvider({ yes: (q) => (q.id === 'goal' ? 0.9 : 0.05) });
    const r = await runChange('side:\n  goal: verify the fix holds\n  parent: SW-0001\n  compare: {before: worktree, after: worktree}\n', { paths, provider, env });
    expect(r.exit).toBe(0);
    expect(r.text).toContain('gate: pass');
    expect(r.text).toContain('regressed: []');
    expect(r.text).toContain('next: sidewise outcome SW-0001 held --by <you>');
  });

  it('a rehearsal adapter (fake) labels its notes "not evidence" (BRIEF §5) [C-092]', async () => {
    const { paths } = tempProject({ 'src/a.ts': 'anything\n' });
    const parent = sampleContractRun({
      where: ['src/a.ts'],
      ask: { categories: [{ name: 'injection', pass: 'no', need: 'all', tags: [], questions: [{ n: 1, kind: 'yesno', text: 'q1?' }] }], layers: [] },
      answers: { goal: { kind: 'yesno', p: 0.1 }, '1': { kind: 'yesno', p: 0.05 } },
      keys: { goal: 'k-goal', '1': 'k-1' },
      categories: { injection: 'pass' },
      gate: 'pass',
    });
    appendContractRun(paths, parent, T, 'b'); // SW-0001
    const provider = stubProvider({ yes: (q) => (q.id === 'goal' ? 0.9 : 0.05), adapter: 'fake' });
    const r = await runChange('side:\n  goal: verify the fix holds\n  parent: SW-0001\n  compare: {before: worktree, after: worktree}\n', { paths, provider, env });
    expect(r.exit).toBe(0);
    expect(r.text).toContain('adapter fake · not evidence');
  });

  it('a missing budget file is created with defaults, and the first run says so (BRIEF §5) [C-093]', async () => {
    const { paths } = tempProject({ 'src/a.ts': 'anything\n' });
    const parent = sampleContractRun({
      where: ['src/a.ts'],
      ask: { categories: [{ name: 'injection', pass: 'no', need: 'all', tags: [], questions: [{ n: 1, kind: 'yesno', text: 'q1?' }] }], layers: [] },
      answers: { goal: { kind: 'yesno', p: 0.1 }, '1': { kind: 'yesno', p: 0.05 } },
      keys: { goal: 'k-goal', '1': 'k-1' },
      categories: { injection: 'pass' },
      gate: 'pass',
    });
    appendContractRun(paths, parent, T, 'b'); // SW-0001, seeded directly — no preflight call, so budget.json doesn't exist yet
    const provider = stubProvider({ yes: (q) => (q.id === 'goal' ? 0.9 : 0.05) });
    const r = await runChange('side:\n  goal: verify the fix holds\n  parent: SW-0001\n  compare: {before: worktree, after: worktree}\n', { paths, provider, env });
    expect(r.exit).toBe(0);
    expect(r.text).toContain('budget file created with defaults ($5.00 · 500 runs)');
  });
});
