// drill: down from one item (sweep shape) or one category (class shape), depending on the parent's own shape.
import { describe, expect, it } from 'vitest';
import { setBudget } from '../../src/budget/budget.ts';
import { appendContractRun, appendRun, isContractRun, readLedger } from '../../src/ledger/log.ts';
import { runClass } from '../../src/verbs/class.ts';
import { runLoop } from '../../src/verbs/loop.ts';
import { runScan } from '../../src/verbs/scan.ts';
import { runDrill } from '../../src/verbs/drill.ts';
import { runView } from '../../src/verbs/view.ts';
import { tempProject } from '../helpers/project.ts';
import { sampleContractRun, sampleRun } from '../helpers/runs.ts';
import { stubProvider } from '../helpers/stub-provider.ts';

const env = { SIDEWISE_ACTOR: 'r' };
const T = Date.parse('2026-09-26T12:00:00Z');

describe('drill: parent and from resolution', () => {
  it('a parent not in the ledger stops, naming the id', async () => {
    const { paths } = tempProject({});
    const r = await runDrill('side:\n  goal: check this thing\n  parent: SW-0042\n  from: x\n  ask:\n    a:\n      pass: yes\n      1: is it true?\n', {
      paths,
      provider: stubProvider(),
      env,
    });
    expect(r.exit).toBe(2);
    expect(r.text).toBe('✖ side.parent: SW-0042 is not in the ledger → check the id');
  });

  it('a legacy (Plan 1) parent stops', async () => {
    const { paths } = tempProject({});
    appendRun(paths, sampleRun()); // SW-0001: a Plan 1 run, no v: 2
    const r = await runDrill('side:\n  goal: check this thing\n  parent: SW-0001\n  from: x\n  ask:\n    a:\n      pass: yes\n      1: is it true?\n', {
      paths,
      provider: stubProvider(),
      env,
    });
    expect(r.exit).toBe(2);
    expect(r.text).toBe('✖ side.parent: SW-0001 predates the YAML contract → run class or scan again');
  });

  // Fix #10: a sweep item that has code (a unit) can be drilled flat, one subject, no further layer — the
  // fresh ask: categories are answered straight against that item's own lines, class-style. [C-144]
  it('a sweep parent, no over:, from: names a coded item — a flat one-subject proof', async () => {
    const { paths } = tempProject({ 'src/a.ts': 'export function findUser(req) { return db.query(`x ${req.id}`); }\n' });
    const scanReq =
      'side:\n  goal: handlers stay safe\n  depth: quick\n  over:\n    file: src/*.ts\n    function: each\n  ask:\n    function:\n      injection:\n        pass: no\n        1: is it unsafe?\n';
    await runScan(scanReq, { paths, provider: stubProvider({ yes: () => 0.9 }), env }); // SW-0001
    const req = 'side:\n  goal: find the bug\n  parent: SW-0001\n  from: src/a.ts/findUser\n  ask:\n    injection:\n      pass: no\n      1: is it unsafe?\n';
    const r = await runDrill(req, { paths, provider: stubProvider({ yes: () => 0.95 }), env });
    expect(r.exit).toBe(0);
    expect(r.text).toContain('gate: fail');
    expect(r.text).toContain('injection: {gate: fail, 1: 0.95}');
    expect(r.text).toContain('consensus:');
    // change --parent points at THIS drill (SW-0002, items: null), not the sweep it was drilled from
    // (SW-0001, items !== null — change refuses a sweep parent outright).
    expect(r.text).toContain('next: fix it, then sidewise change --parent SW-0002 --compare <before>..<after>');
  });

  // The item exists but is an idea (loop's own kind, no unit) — nothing to prove flatly without over:.
  it('a sweep parent (loop), no over:, from: names an idea item — a clean stop, not a crash', async () => {
    const { paths } = tempProject({});
    const loopReq =
      'side:\n  goal: the plan holds up\n  depth: quick\n  over:\n    part:\n      - payments\n  ask:\n    part:\n      risk:\n        pass: no\n        1: Does {part} carry too much risk?\n';
    await runLoop(loopReq, { paths, provider: stubProvider({ yes: () => 0.9 }), env }); // SW-0001
    const bad = 'side:\n  goal: find the bug\n  parent: SW-0001\n  from: payments\n  ask:\n    a:\n      pass: yes\n      1: is it true?\n';
    const r = await runDrill(bad, { paths, provider: stubProvider(), env });
    expect(r.exit).toBe(2);
    expect(r.text).toBe(
      '✖ side.from: "payments" has no code → add over: with the next layer down, or drill an item scan found (sidewise template drill --parent SW-0001 --from payments)',
    );
  });

  it('a sweep parent, a from: that names no item it listed', async () => {
    const { paths } = tempProject({ 'src/a.ts': 'export function findUser(req) { return db.query(`x ${req.id}`); }\n' });
    const scanReq =
      'side:\n  goal: handlers stay safe\n  depth: quick\n  over:\n    file: src/*.ts\n    function: each\n  ask:\n    function:\n      injection:\n        pass: no\n        1: is it unsafe?\n';
    await runScan(scanReq, { paths, provider: stubProvider({ yes: () => 0.9 }), env }); // SW-0001
    const bad =
      'side:\n  goal: find the bug\n  parent: SW-0001\n  from: nope\n  over:\n    call: each\n  ask:\n    call:\n      x:\n        pass: no\n        1: is it unsafe?\n';
    const r = await runDrill(bad, { paths, provider: stubProvider(), env });
    expect(r.exit).toBe(2);
    expect(r.text).toContain('✖ side.from: "nope" is not an item SW-0001 listed → use one of:');
  });

  it('a one-subject parent given over: stops', async () => {
    const { paths } = tempProject({ 'src/a.ts': 'x' });
    const classReq =
      'side:\n  goal: check this code\n  depth: quick\n  where: [src/a.ts]\n  ask:\n    injection:\n      pass: no\n' +
      Array.from({ length: 10 }, (_, i) => `      ${i + 1}: is question ${i + 1} true?\n`).join('');
    await runClass(classReq, { paths, provider: stubProvider({ yes: () => 0.9 }), env }); // SW-0001
    const bad =
      'side:\n  goal: find the bug\n  parent: SW-0001\n  from: injection\n  over:\n    call: each\n  ask:\n    call:\n      x:\n        pass: no\n        1: is it unsafe?\n';
    const r = await runDrill(bad, { paths, provider: stubProvider(), env });
    expect(r.exit).toBe(2);
    expect(r.text).toBe("✖ side.over: SW-0001 wasn't a sweep → remove over");
  });
});

describe('drill: a sweep parent (scan) — the sweep shape, worst first, passing as a count', () => {
  const scanReq =
    'side:\n  goal: handlers stay safe\n  depth: quick\n  over:\n    file: src/*.ts\n    function: each\n  ask:\n    function:\n      injection:\n        pass: no\n        1: is it unsafe?\n';
  const drillReq =
    'side:\n  goal: Find exactly where request text reaches the query\n  parent: SW-0001\n  from: src/a.ts/findUser\n  depth: quick\n  over:\n    call: each\n  ask:\n    call:\n      injection:\n        pass: no\n        1: Does {call} pass request text into SQL?\n';

  it("drills into a function's calls [C-009] [C-074] [C-076] [C-078]", async () => {
    const { paths } = tempProject({ 'src/a.ts': 'export function findUser(req) { return db.query(`x ${req.id}`); }\n' });
    await runScan(scanReq, { paths, provider: stubProvider({ yes: () => 0.9 }), env });
    const r = await runDrill(drillReq, { paths, provider: stubProvider({ yes: () => 0.96 }), env });
    expect(r.exit).toBe(0);
    expect(r.text).toContain('src/a.ts/findUser/db.query: {injection: fail, 1: 0.96}');
    expect(r.text).toContain('passing: 0');
    // Controller ruling (task-21-brief): a sweep parent's fail/unsure next fixes-and-reruns the drill (cheap,
    // reuse-aware), never sidewise change — change.ts refuses a sweep parent (Decision 2).
    expect(r.text).toContain('next: fix it, then run this drill again');
    expect(r.text).not.toContain('sidewise change');
    const [run] = readLedger(paths).filter((x) => isContractRun(x) && x.verb === 'drill');
    expect(run).toMatchObject({ parent: 'SW-0001', from: 'src/a.ts/findUser' });
  });

  it('--dry-run: no provider call, no ledger line [C-088]', async () => {
    const { paths } = tempProject({ 'src/a.ts': 'export function findUser(req) { return db.query(`x ${req.id}`); }\n' });
    await runScan(scanReq, { paths, provider: stubProvider({ yes: () => 0.9 }), env });
    const provider = stubProvider();
    const r = await runDrill(drillReq, { paths, provider, env, dryRun: true });
    expect(r.exit).toBe(0);
    expect(r.text).toBe('plan:\n  calls: 1\n  questions: 1\n  items: 1\n  reused: 0\n  route: fake\nnotes: ["dry run: no call, no spend"]\n');
    expect(provider.calls).toHaveLength(0);
    expect(readLedger(paths).filter(isContractRun)).toHaveLength(1); // just the scan parent, SW-0001
  });

  it('a rehearsal adapter (fake) labels its notes "not evidence" (BRIEF §5) [C-092]', async () => {
    const { paths } = tempProject({ 'src/a.ts': 'export function findUser(req) { return db.query(`x ${req.id}`); }\n' });
    await runScan(scanReq, { paths, provider: stubProvider({ yes: () => 0.9, adapter: 'fake' }), env });
    const r = await runDrill(drillReq, { paths, provider: stubProvider({ yes: () => 0.96, adapter: 'fake' }), env });
    expect(r.exit).toBe(0);
    expect(r.text).toContain('adapter fake · not evidence');
  });

  it('a missing budget file is created with defaults, and the first run says so (BRIEF §5) [C-093]', async () => {
    const { paths } = tempProject({ 'src/a.ts': 'export function findUser(req) { return db.query(`x ${req.id}`); }\n' });
    // Seeded directly (not run for real), so budget.json doesn't exist yet — drill's own preflight is the first.
    const parent = sampleContractRun({
      items: {
        'src/a.ts/findUser': {
          layer: 'function',
          fill: { file: 'src/a.ts', function: 'findUser' },
          unit: { path: 'src/a.ts', kind: 'function', name: 'findUser', lines: '1-1' },
          status: 'asked',
          gate: 'fail',
          categories: { injection: 'fail' },
        },
      },
      ask: { categories: [], layers: [{ name: 'function', categories: [{ name: 'injection', pass: 'no', need: 'all', tags: [], questions: [{ n: 1, kind: 'yesno', text: 'is it unsafe?' }] }] }] },
      over: { file: 'src/*.ts', function: 'each' },
    });
    appendContractRun(paths, parent, T, 'b'); // SW-0001
    const r = await runDrill(drillReq, { paths, provider: stubProvider({ yes: () => 0.9 }), env });
    expect(r.exit).toBe(0);
    expect(r.text).toContain('budget file created with defaults ($5.00 · 500 runs)');
  });
});

describe('drill: a sweep parent (loop) — an idea item has no unit, unlike scan/class [C-075] [C-076]', () => {
  const loopReq =
    'side:\n  goal: The checkout redesign is sound\n  depth: quick\n  over:\n    part:\n      - name: gateway\n        story: [guest checkout]\n      - name: payments\n        story: [refunds]\n  ask:\n    part:\n      boundaries:\n        pass: yes\n        1: Does {part} own one clear responsibility?\n    story:\n      done:\n        pass: yes\n        2: Is "{story}" testable against {part} as written?\n';

  it('drilling into an idea item with a new list of ideas works (no code to resolve, so no resolver is needed)', async () => {
    const { paths } = tempProject({});
    const yes = (q: { id: string }) => (q.id === 'payments/refunds#2' ? 0.2 : 0.9);
    await runLoop(loopReq, { paths, provider: stubProvider({ yes }), env }); // SW-0001
    const drillReq =
      'side:\n  goal: find why refunds is unsound\n  parent: SW-0001\n  from: payments/refunds\n  depth: quick\n  over:\n    cause:\n      - double charge\n      - silent failure\n  ask:\n    cause:\n      risk:\n        pass: yes\n        1: Is {cause} handled today?\n';
    const drillYes = (q: { id: string }) => (q.id === 'payments/refunds/double charge#1' ? 0.2 : 0.9);
    const r = await runDrill(drillReq, { paths, provider: stubProvider({ yes: drillYes }), env });
    expect(r.exit).toBe(0);
    expect(r.text).toContain('gate: fail');
    expect(r.text).toContain('payments/refunds/double charge: {risk: fail, 1: 0.20}');
  });

  it('drilling into an idea item with "each" cannot resolve code that does not exist — a clean stop, not a crash', async () => {
    const { paths } = tempProject({});
    const yes = (q: { id: string }) => (q.id === 'payments/refunds#2' ? 0.2 : 0.9);
    await runLoop(loopReq, { paths, provider: stubProvider({ yes }), env }); // SW-0001
    const drillReq =
      'side:\n  goal: find why refunds is unsound\n  parent: SW-0001\n  from: payments/refunds\n  depth: quick\n  over:\n    cause: each\n  ask:\n    cause:\n      risk:\n        pass: yes\n        1: Is {cause} handled today?\n';
    const r = await runDrill(drillReq, { paths, provider: stubProvider(), env });
    expect(r.exit).toBe(2);
    expect(r.text).toBe('✖ side.over.cause: "payments/refunds" is an idea, not code → give cause as a list of items (there is nothing to split with each)');
  });
});

describe('drill: a one-subject parent (class) — the class shape', () => {
  const classReq =
    'side:\n  goal: check this code\n  depth: quick\n  where: [src/a.ts]\n  ask:\n    injection:\n      pass: no\n' +
    Array.from({ length: 10 }, (_, i) => `      ${i + 1}: is question ${i + 1} true?\n`).join('');
  const drillReq =
    'side:\n  goal: Find exactly where request text reaches the query\n  parent: SW-0001\n  from: injection\n  ask:\n    source:\n      pass: no\n      1: Is the value concatenated straight into the string?\n      2: Does it skip a parameterized query?\n';

  it('sends new, narrower questions inside the named category [C-033] [C-077] [C-078]', async () => {
    const { paths } = tempProject({ 'src/a.ts': 'export function f(x) { return db.query(`x ${x}`); }\n' });
    await runClass(classReq, { paths, provider: stubProvider({ yes: () => 0.9 }), env });
    const r = await runDrill(drillReq, { paths, provider: stubProvider({ yes: () => 0.95 }), env });
    expect(r.exit).toBe(0);
    expect(r.text).toContain('source: {gate: fail, 1: 0.95, 2: 0.95}');
    expect(r.text).toContain('consensus:');
    // Controller ruling: a one-subject parent's fail/unsure next keeps fix-then-change.
    expect(r.text).toContain('next: fix it, then sidewise change --parent SW-0001 --compare <before>..<after>');

    // [C-079] the narrower "source" category drill invented becomes part of the record at this place: it
    // rides drill's own run (where: parent.where), so view's per-category history now carries it too.
    const viewText = 'side:\n  goal: check this code\n  depth: quick\n  where: [src/a.ts]\n  ask:\n    source:\n      pass: no\n      1: Is the value concatenated straight into the string?\n      2: Does it skip a parameterized query?\n';
    const v = runView(viewText, 1, { paths, env: {} });
    expect(v.text).toContain('source: {runs: 1, pass: 0, fail: 1, last: SW-0002}');
  });

  it('a from that names neither a category nor an item: a clean stop', async () => {
    const { paths } = tempProject({ 'src/a.ts': 'x' });
    await runClass(classReq, { paths, provider: stubProvider({ yes: () => 0.9 }), env });
    const bad = 'side:\n  goal: find the bug\n  parent: SW-0001\n  from: nope\n  ask:\n    a:\n      pass: yes\n      1: is it true?\n';
    const r = await runDrill(bad, { paths, provider: stubProvider(), env });
    expect(r.exit).toBe(2);
    expect(r.text).toContain('✖ side.from: "nope" is not a category of SW-0001');
  });

  it('--dry-run: no provider call, no ledger line [C-088]', async () => {
    const { paths } = tempProject({ 'src/a.ts': 'export function f(x) { return db.query(`x ${x}`); }\n' });
    await runClass(classReq, { paths, provider: stubProvider({ yes: () => 0.9 }), env });
    const provider = stubProvider();
    const r = await runDrill(drillReq, { paths, provider, env, dryRun: true });
    expect(r.exit).toBe(0);
    expect(r.text).toBe('plan:\n  calls: 1\n  questions: 3\n  reused: 0\n  route: fake\nnotes: ["dry run: no call, no spend"]\n');
    expect(provider.calls).toHaveLength(0);
    expect(readLedger(paths).filter(isContractRun)).toHaveLength(1); // just the class parent, SW-0001
  });

  // Fix #5/#6 follow-through: same pattern as class.ts — reuse is resolved before preflight, so a fully-reused
  // drill is never blocked by an already-reached cap, and the response says which run its answers came from.
  it('a fully-reused drill is never blocked by an already-reached cap, and names the run it reused [C-149]', async () => {
    const { paths } = tempProject({ 'src/a.ts': 'export function f(x) { return db.query(`x ${x}`); }\n' });
    await runClass(classReq, { paths, provider: stubProvider({ yes: () => 0.9 }), env }); // SW-0001, 1 run
    await runDrill(drillReq, { paths, provider: stubProvider({ yes: () => 0.95 }), env }); // SW-0002, 1 run
    setBudget(paths, { capRuns: 2 }); // exactly used up by the two runs above
    const r = await runDrill(drillReq, { paths, provider: stubProvider(), env }); // fully reused: no call needed
    expect(r.exit).toBe(0);
    expect(r.text).toContain('reused: [SW-0002]');
  });

  it('a rehearsal adapter (fake) labels its notes "not evidence" (BRIEF §5) [C-092]', async () => {
    const { paths } = tempProject({ 'src/a.ts': 'export function f(x) { return db.query(`x ${x}`); }\n' });
    await runClass(classReq, { paths, provider: stubProvider({ yes: () => 0.9, adapter: 'fake' }), env });
    const r = await runDrill(drillReq, { paths, provider: stubProvider({ yes: () => 0.95, adapter: 'fake' }), env });
    expect(r.exit).toBe(0);
    expect(r.text).toContain('adapter fake · not evidence');
  });

  it('a missing budget file is created with defaults, and the first run says so (BRIEF §5) [C-093]', async () => {
    const { paths } = tempProject({ 'src/a.ts': 'export function f(x) { return db.query(`x ${x}`); }\n' });
    // Seeded directly (not run for real), so budget.json doesn't exist yet — drill's own preflight is the first.
    appendContractRun(paths, sampleContractRun({ where: ['src/a.ts'] }), T, 'b'); // SW-0001: the default "injection" category
    const r = await runDrill(drillReq, { paths, provider: stubProvider({ yes: () => 0.95 }), env });
    expect(r.exit).toBe(0);
    expect(r.text).toContain('budget file created with defaults ($5.00 · 500 runs)');
  });
});
