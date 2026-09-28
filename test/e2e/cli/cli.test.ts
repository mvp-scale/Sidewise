// Spawns the built binary (dist/cli.js) in a throwaway project with the fake provider: no network, no key.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { sidewise, snapshot } from '../../helpers/cli.ts';
import { tempProject } from '../../helpers/project.ts';

const CLASS_YAML = readFileSync('test/fixtures/requests/valid/class.yaml', 'utf8');
const VIEW_YAML = readFileSync('test/fixtures/requests/valid/view.yaml', 'utf8');
const LOOP_YAML = readFileSync('test/fixtures/requests/valid/loop.yaml', 'utf8');
// A distinct goal: the contract reuses per-question answers keyed on evidence + question text, so sending the
// exact same request twice makes the second one free (calls: 0) — a different goal keeps both runs paid.
const CLASS_YAML_2 = CLASS_YAML.replace('This login handler is safe to merge', 'This login handler is safe to merge, second look');
// over: {file: src/*.ts, function: each} matches the one function tempProject() ships (src/user.ts's findUser),
// so "src/user.ts/findUser" is a known, deterministic sweep item id — not a guess.
const SCAN_YAML =
  'side:\n  goal: Handlers trust nothing from the request\n  depth: quick\n  over:\n    file: src/*.ts\n    function: each\n  ask:\n    function:\n      injection:\n        pass: no\n        1: Does {function} put request text straight into a query?\n';

function project(): string {
  const { root } = tempProject();
  writeFileSync(path.join(root, 'req.yaml'), CLASS_YAML);
  return root;
}

describe('sidewise CLI (built): the six verbs, template, outcome, budget', () => {
  it('class → view → outcome → budget, end to end', () => {
    const root = project();
    const cls = sidewise(root, ['class', 'req.yaml']);
    expect(cls.status).toBe(0);
    expect(cls.stdout).toMatch(/^side:\n {2}id: SW-0001\n {2}gate: (pass|fail|unsure)\n/);
    expect(cls.stdout).toContain('wise: {recorded: [why, area]}');
    expect(cls.stdout).toMatch(/\nnotes: \[.*budget .*\]\n$/);

    const fromStdin = sidewise(root, ['class', '-'], { input: CLASS_YAML_2 });
    expect(fromStdin.status).toBe(0);
    expect(fromStdin.stdout).toMatch(/^side:\n {2}id: SW-0002\n {2}gate: (pass|fail|unsure)\n/);

    expect(sidewise(root, ['view', 'src']).stdout).toContain('SW-0001');
    expect(sidewise(root, ['outcome', 'SW-0001', 'held', '--by', 'e2e-agent']).status).toBe(1);
    expect(sidewise(root, ['outcome', 'SW-0001', 'held', '--by', 'owner']).stdout).toBe('sidewise outcome SW-0001 held · by owner\n');
    expect(sidewise(root, ['budget']).stdout).toBe('budget 0% used ($0.00 of $5.00 · 2 of 500 runs)\n');
  });

  it('loop, scan and drill run end to end (drill off the loop parent, sweep shape)', () => {
    const root = project();
    writeFileSync(path.join(root, 'loop.yaml'), LOOP_YAML);
    const looped = sidewise(root, ['loop', 'loop.yaml']);
    expect(looped.status).toBe(0);
    expect(looped.stdout).toMatch(/^side:\n {2}id: SW-0001\n {2}gate: (pass|fail|unsure)\n/);

    writeFileSync(path.join(root, 'scan.yaml'), SCAN_YAML);
    const scanned = sidewise(root, ['scan', 'scan.yaml']);
    expect(scanned.status).toBe(0);
    expect(scanned.stdout).toContain('scanned: {file:');

    const template = sidewise(root, ['template', 'drill', '--parent', 'SW-0002', '--from', 'src/user.ts/findUser']);
    expect(template.status).toBe(0);
    expect(template.stdout).toContain('parent: SW-0002');
    writeFileSync(path.join(root, 'drill.yaml'), template.stdout);
    const drilled = sidewise(root, ['drill', 'drill.yaml']);
    expect(drilled.status).toBe(0);
  });

  it('change: the flag form and the file form both work; --dry-run spends nothing [C-066]', () => {
    const root = project();
    expect(sidewise(root, ['class', 'req.yaml']).status).toBe(0);
    const dry = sidewise(root, ['change', '--parent', 'SW-0001', '--compare', 'worktree..worktree', '--dry-run']);
    expect(dry.status).toBe(0);
    expect(dry.stdout).toMatch(/^plan:\n {2}calls: \d+\n {2}questions: \d+\n {2}reused: \d+\n {2}route: \w+\nnotes: \["dry run: no call, no spend"\]\n$/);
    expect(sidewise(root, ['budget']).stdout).toContain('1 of 500 runs'); // only the class run counted; the dry run spent nothing
    const real = sidewise(root, ['change', '--parent', 'SW-0001', '--compare', 'worktree..worktree']);
    expect(real.status).toBe(0);
    expect(real.stdout).toContain('wise: {recorded: [parent]}');
    // [C-066] the flag form's goal is the parent's own goal (src/cli.ts), not the "The change works"
    // placeholder — read straight off the ledger, since the response itself never echoes the goal text.
    const lines = readFileSync(path.join(root, '.sidewise', 'log.jsonl'), 'utf8').trimEnd().split('\n').map((l) => JSON.parse(l));
    const changeRun = lines.find((l) => l.kind === 'run' && l.verb === 'change');
    expect(changeRun.goal).toBe('This login handler is safe to merge');
  });

  it('view: request mode reuses a class run\'s answers by exact match; place mode still works', () => {
    const root = project();
    expect(sidewise(root, ['class', 'req.yaml']).status).toBe(0); // SW-0001, same evidence and goal/injection text as VIEW_YAML
    writeFileSync(path.join(root, 'view.yaml'), VIEW_YAML);

    const fromFile = sidewise(root, ['view', 'view.yaml']);
    expect(fromFile.status).toBe(0);
    expect(fromFile.stdout).toContain('reuse: SW-0001');

    const fromStdin = sidewise(root, ['view', '-'], { input: VIEW_YAML });
    expect(fromStdin.status).toBe(0);
    expect(fromStdin.stdout).toContain('reuse: SW-0001');

    const place = sidewise(root, ['view', 'src']);
    expect(place.status).toBe(0);
    expect(place.stdout).toContain('SW-0001');
  });

  it('--dry-run: class, scan, loop and drill each print a plan and write nothing to .sidewise/', () => {
    const root = project();

    const beforeClass = snapshot(root);
    const dryClass = sidewise(root, ['class', 'req.yaml', '--dry-run']);
    expect(dryClass.status).toBe(0);
    expect(dryClass.stdout).toMatch(/^plan:\n {2}calls: \d+\n {2}questions: \d+\n/);
    expect(snapshot(root)).toEqual(beforeClass);

    writeFileSync(path.join(root, 'scan.yaml'), SCAN_YAML);
    const beforeScan = snapshot(root);
    const dryScan = sidewise(root, ['scan', 'scan.yaml', '--dry-run']);
    expect(dryScan.status).toBe(0);
    expect(dryScan.stdout).toMatch(/^plan:\n {2}calls: \d+\n {2}questions: \d+\n/);
    expect(snapshot(root)).toEqual(beforeScan);

    writeFileSync(path.join(root, 'loop.yaml'), LOOP_YAML);
    const beforeLoop = snapshot(root);
    const dryLoop = sidewise(root, ['loop', 'loop.yaml', '--dry-run']);
    expect(dryLoop.status).toBe(0);
    expect(dryLoop.stdout).toMatch(/^plan:\n {2}calls: \d+\n {2}questions: \d+\n/);
    expect(snapshot(root)).toEqual(beforeLoop);

    // drill needs a real parent: scan for real (src/user.ts/findUser is the known item id — see SCAN_YAML above).
    const scanned = sidewise(root, ['scan', 'scan.yaml']);
    expect(scanned.status).toBe(0);
    const parentId = /id: (SW-\d{4,})/.exec(scanned.stdout)?.[1]!;
    const template = sidewise(root, ['template', 'drill', '--parent', parentId, '--from', 'src/user.ts/findUser']);
    expect(template.status).toBe(0);
    writeFileSync(path.join(root, 'drill.yaml'), template.stdout);
    const beforeDrill = snapshot(root);
    const dryDrill = sidewise(root, ['drill', 'drill.yaml', '--dry-run']);
    expect(dryDrill.status).toBe(0);
    expect(dryDrill.stdout).toMatch(/^plan:\n {2}calls: \d+\n {2}questions: \d+\n/);
    expect(snapshot(root)).toEqual(beforeDrill);
  });

  it('an unknown command and a missing argument: one "✖ args:" line, exit 2', () => {
    const root = project();
    expect(sidewise(root, ['judge'])).toMatchObject({
      status: 2,
      stdout: '',
      stderr: '✖ args: "judge" is not a command → use view, class, change, scan, drill, loop, template, help, agent, report, outcome, budget, doctor, init, uninstall or mcp (sidewise --help)\n',
    });
    expect(sidewise(root, ['view'])).toMatchObject({
      status: 2,
      stdout: '',
      stderr: '✖ args: missing arguments → sidewise view <folder | tag | SW-#### | request-file | -> [--level 1|2|3] [--summary]\n',
    });
    expect(sidewise(root, ['class'])).toMatchObject({
      status: 2,
      stdout: '',
      stderr: '✖ args: missing arguments → sidewise class <request-file | -> [--dry-run]\n',
    });
  });

  it(
    'a held lock exits 1 with one clean "✖ lock:" line, even for a budget command',
    () => {
      const root = project();
      mkdirSync(path.join(root, '.sidewise'), { recursive: true });
      writeFileSync(path.join(root, '.sidewise', 'lock'), `${process.pid}\n`); // this test process: alive
      const r = sidewise(root, ['budget', 'reset']);
      expect(r.status).toBe(1);
      expect(r.stderr).toBe('✖ lock: .sidewise/lock is locked → wait for the other run, or delete the lock file if no run is active\n');
    },
    15_000,
  );

  it('bare sidewise prints full usage (exit 2); --help prints it on stdout (exit 0)', () => {
    const root = project();
    const bare = sidewise(root, []);
    expect(bare.status).toBe(2);
    expect(bare.stderr).toMatch(/^new here\? → sidewise init\nusage:\n {2}sidewise view/);
    for (const flag of ['--help', '-h']) {
      const help = sidewise(root, [flag]);
      expect(help).toMatchObject({ status: 0, stderr: '' });
      expect(help.stdout).toContain('sidewise template');
    }
  });

  it('sidewise agent [verb]: free, no project needed, terse — help\'s agent-facing twin [C-173]', () => {
    const overview = sidewise('/', ['agent'], { home: false });
    expect(overview.status).toBe(0);
    expect(overview.stdout).toContain('verbs (pick by goal):');
    for (const verb of ['view', 'class', 'change', 'scan', 'drill', 'loop']) expect(overview.stdout).toContain(`- ${verb}: `);

    const classCard = sidewise('/', ['agent', 'class'], { home: false });
    expect(classCard.status).toBe(0);
    expect(classCard.stdout).toContain('verb: class');
    expect(classCard.stdout).toContain('patterns:');

    expect(sidewise('/', ['agent', 'nope'], { home: false }).status).toBe(2);
  });

  it('template works with no project at all', () => {
    const bare = sidewise('/', ['template', 'class'], { home: false });
    expect(bare.status).toBe(0);
    expect(bare.stdout).toContain('side:');
  });

  it('the retired text format is now just an invalid request, not a special case', () => {
    const root = project();
    writeFileSync(path.join(root, 'old.txt'), 'sidewise class L1\nfocus: This handler is safe to merge\n\n 1  Is it safe?\n');
    const r = sidewise(root, ['class', 'old.txt']);
    expect(r.status).toBe(2);
    expect(r.stdout).toBe('');
    expect(r.stderr).toMatch(/^✖ /);
  });
});
