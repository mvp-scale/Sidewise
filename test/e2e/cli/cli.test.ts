// Spawns the built binary (dist/cli.js) in a throwaway project with the fake provider: no network, no key.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { sidewise } from '../../helpers/cli.ts';
import { tempProject } from '../../helpers/project.ts';

const CLASS_YAML = readFileSync('test/fixtures/requests/valid/class.yaml', 'utf8');
const LOOP_YAML = readFileSync('test/fixtures/requests/valid/loop.yaml', 'utf8');
// A distinct goal: the contract reuses per-question answers keyed on evidence + question text, so sending the
// exact same request twice makes the second one free (calls: 0) — a different goal keeps both runs paid.
const CLASS_YAML_2 = CLASS_YAML.replace('This login handler is safe to merge', 'This login handler is safe to merge, second look');

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
    expect(fromStdin.stdout).toContain('id: SW-0002');

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

    const scanReq = 'side:\n  goal: Handlers trust nothing from the request\n  depth: quick\n  over:\n    file: src/*.ts\n    function: each\n  ask:\n    function:\n      injection:\n        pass: no\n        1: Does {function} put request text straight into a query?\n';
    writeFileSync(path.join(root, 'scan.yaml'), scanReq);
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

  it('change: the flag form and the file form both work; --dry-run spends nothing', () => {
    const root = project();
    expect(sidewise(root, ['class', 'req.yaml']).status).toBe(0);
    const dry = sidewise(root, ['change', '--parent', 'SW-0001', '--compare', 'worktree..worktree', '--dry-run']);
    expect(dry.status).toBe(0);
    expect(dry.stdout).toMatch(/^plan:\n {2}calls: \d+\n {2}questions: \d+\nnotes: \["dry run: no call, no spend"\]\n$/);
    expect(sidewise(root, ['budget']).stdout).toContain('1 of 500 runs'); // only the class run counted; the dry run spent nothing
    const real = sidewise(root, ['change', '--parent', 'SW-0001', '--compare', 'worktree..worktree']);
    expect(real.status).toBe(0);
    expect(real.stdout).toContain('wise: {recorded: [parent]}');
  });

  it('bare sidewise prints full usage (exit 2); --help prints it on stdout (exit 0)', () => {
    const root = project();
    const bare = sidewise(root, []);
    expect(bare.status).toBe(2);
    expect(bare.stderr).toMatch(/^usage:\n {2}sidewise view/);
    for (const flag of ['--help', '-h']) {
      const help = sidewise(root, [flag]);
      expect(help).toMatchObject({ status: 0, stderr: '' });
      expect(help.stdout).toContain('sidewise template');
    }
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
