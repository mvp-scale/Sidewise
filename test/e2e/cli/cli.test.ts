// Spawns the built binary (dist/cli.js) in a throwaway project with the fake provider: no network, no key.
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { tempProject } from '../../helpers/project.ts';
import { classRequest, RM_SLOTS } from '../../helpers/requests.ts';

const CLI = path.resolve('dist/cli.js');

function sidewise(root: string, args: string[], input?: string) {
  return spawnSync(process.execPath, [CLI, ...args], {
    cwd: root,
    input,
    encoding: 'utf8',
    env: { ...process.env, SIDEWISE_HOME: root, SIDEWISE_PROVIDER: 'fake', SIDEWISE_ACTOR: 'e2e-agent', TYPESAFE_API_KEY: '', AI_GATEWAY_API_KEY: '' },
  });
}

describe('sidewise CLI (built)', () => {
  it('class → view → outcome → budget, end to end', () => {
    const { root } = tempProject();
    writeFileSync(path.join(root, 'req.txt'), classRequest());

    const cls = sidewise(root, ['class', 'req.txt']);
    expect(cls.status).toBe(0);
    expect(cls.stdout).toMatch(/^sidewise SW-0001 · class L1 · consensus (STRONG|SPLIT|WEAK)/);
    expect(cls.stdout).toContain('adapter fake · not evidence');
    expect(cls.stdout.trim().split('\n').length).toBeLessThanOrEqual(6);

    const fromStdin = sidewise(root, ['class', '-'], classRequest({ fields: { focus: 'Second look at the handler' } }));
    expect(fromStdin.status).toBe(0);
    expect(fromStdin.stdout).toMatch(/^sidewise SW-0002/);

    expect(sidewise(root, ['view', 'src']).stdout).toContain('SW-0001');
    expect(sidewise(root, ['outcome', 'SW-0001', 'held', '--by', 'e2e-agent']).status).toBe(1);
    expect(sidewise(root, ['outcome', 'SW-0001', 'held', '--by', 'owner']).stdout).toBe('sidewise outcome SW-0001 held · by owner\n');
    expect(sidewise(root, ['budget']).stdout).toBe('budget 0% used ($0.00 of $5.00 · 2 of 500 runs)\n');
  });

  it('exit 2 for an invalid request, 3 at the cap, and reset reopens it', () => {
    const { root } = tempProject();
    writeFileSync(path.join(root, 'bad.txt'), classRequest({ slots: RM_SLOTS.slice(0, 7) }));
    writeFileSync(path.join(root, 'req.txt'), classRequest());

    const bad = sidewise(root, ['class', 'bad.txt']);
    expect(bad.status).toBe(2);
    expect(bad.stderr).toContain('✖ slots: L1 needs 10, got 7');

    expect(sidewise(root, ['budget', 'set', '--runs', '1']).status).toBe(0);
    expect(sidewise(root, ['class', 'req.txt']).status).toBe(0);
    const blocked = sidewise(root, ['class', 'req.txt']);
    expect(blocked.status).toBe(3);
    expect(blocked.stderr).toContain('cap reached');
    expect(sidewise(root, ['budget', 'reset']).status).toBe(0);
    expect(sidewise(root, ['class', 'req.txt']).status).toBe(0);
  });

  it('bare sidewise prints full usage (exit 2); --help prints it on stdout (exit 0)', () => {
    const { root } = tempProject();
    const bare = sidewise(root, []);
    expect(bare.status).toBe(2);
    expect(bare.stderr).toMatch(/^usage:\n  sidewise class/);
    for (const flag of ['--help', '-h']) {
      const help = sidewise(root, [flag]);
      expect(help).toMatchObject({ status: 0, stderr: '' });
      expect(help.stdout).toMatch(/^usage:\n  sidewise class/);
    }
  });

  it('unknown commands and missing arguments: one "✖ args:" line with the right usage line, exit 2', () => {
    const { root } = tempProject();
    expect(sidewise(root, ['judge'])).toMatchObject({ status: 2, stdout: '', stderr: '✖ args: "judge" is not a command → use class, view, outcome or budget (sidewise --help)\n' });
    expect(sidewise(root, ['view'])).toMatchObject({ status: 2, stderr: '✖ args: missing arguments → sidewise view <folder | tag | SW-####> [--level 1|2|3]\n' });
    expect(sidewise(root, ['class'])).toMatchObject({ status: 2, stderr: '✖ args: missing arguments → sidewise class <request-file | ->\n' });
  });

  it('usage mistakes exit 2: unknown flags, bad budget numbers, budget set with no flags', () => {
    const { root } = tempProject();
    expect(sidewise(root, ['view', 'src', '--lvl', '2'])).toMatchObject({ status: 2, stderr: '✖ args: unknown flag --lvl → sidewise view <folder | tag | SW-####> [--level 1|2|3]\n' });
    expect(sidewise(root, ['outcome', 'SW-0001', 'held', '--who', 'owner'])).toMatchObject({
      status: 2,
      stderr: '✖ args: unknown flag --who → sidewise outcome <SW-####> held|overruled|failed --by <actor>\n',
    });
    expect(sidewise(root, ['budget', 'set', '--usd'])).toMatchObject({ status: 2, stderr: '✖ args: --usd needs a value → sidewise budget [show | reset | set --usd <n> --runs <n>]\n' });

    const abc = sidewise(root, ['budget', 'set', '--usd', 'abc']);
    expect(abc.status).toBe(2);
    expect(abc.stderr).toBe('✖ budget: --usd must be a positive number, got "abc" → e.g. sidewise budget set --usd 5 --runs 500\n');
    const zero = sidewise(root, ['budget', 'set', '--runs', '0']);
    expect(zero.status).toBe(2);
    expect(zero.stderr).toContain('✖ budget: --runs must be a positive number, got "0"');

    const none = sidewise(root, ['budget', 'set']);
    expect(none.status).toBe(2);
    expect(none.stderr).toBe('✖ budget: set needs --usd or --runs → e.g. sidewise budget set --usd 5 --runs 500\n');
    expect(sidewise(root, ['budget']).stdout).toBe('budget 0% used ($0.00 of $5.00 · 0 of 500 runs)\n');
  });

  it('a held lock exits 1 with one clean "✖ lock:" line, even for a budget command', () => {
    const { root } = tempProject();
    mkdirSync(path.join(root, '.sidewise'), { recursive: true });
    writeFileSync(path.join(root, '.sidewise', 'lock'), `${process.pid}\n`); // this test process: alive
    const r = sidewise(root, ['budget', 'reset']);
    expect(r.status).toBe(1);
    expect(r.stderr).toBe('✖ lock: .sidewise/lock is locked → wait for the other run, or delete the lock file if no run is active\n');
  }, 15_000);
});
