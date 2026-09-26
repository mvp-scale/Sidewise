// Each run stands alone: the answer depends on the request (and, for the fake provider, nothing else), and
// .sidewise/ holds only the log and the budget between runs.
import { readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { sidewise } from '../../helpers/cli.ts';
import { tempProject } from '../../helpers/project.ts';
import { classRequest } from '../../helpers/requests.ts';

const INITIALISED = 'budget initialised ($5.00 / 500 runs; "sidewise budget set" changes it)';

function project(): string {
  const { root } = tempProject();
  writeFileSync(path.join(root, 'req.txt'), classRequest());
  return root;
}

/** The answer without what is expected to differ between two runs: the run id, and the budget notes line. */
const answerBody = (stdout: string): string[] =>
  stdout
    .trimEnd()
    .split('\n')
    .filter((l) => !l.startsWith('notes: '))
    .map((l) => l.replace(/SW-\d{4,}/g, 'SW-####'));

describe('statelessness', () => {
  it('the same request twice: the same answer except the run id (and the budget count in the notes)', () => {
    const root = project();
    const first = sidewise(root, ['class', 'req.txt']);
    const second = sidewise(root, ['class', 'req.txt']);
    expect(first.status).toBe(0);
    expect(second.status).toBe(0);
    expect(first.stdout).toMatch(/^sidewise SW-0001 /);
    expect(second.stdout).toMatch(/^sidewise SW-0002 /);
    expect(answerBody(second.stdout)).toEqual(answerBody(first.stdout));
    expect(second.stdout.trimEnd().split('\n').at(-1)).toBe('notes: budget 0% used ($0.00 of $5.00 · 2 of 500 runs)');

    const elsewhere = sidewise(project(), ['class', 'req.txt']); // a fresh project: byte-for-byte the first answer
    expect(elsewhere.stdout).toBe(first.stdout);
  });

  it('delete .sidewise/ between runs: a clean fresh start, SW-0001 again, budget initialised again', () => {
    const root = project();
    expect(sidewise(root, ['class', 'req.txt']).stdout).toContain(INITIALISED);
    expect(sidewise(root, ['class', 'req.txt']).stdout).toMatch(/^sidewise SW-0002 /);
    rmSync(path.join(root, '.sidewise'), { recursive: true });
    const again = sidewise(root, ['class', 'req.txt']);
    expect(again.status).toBe(0);
    expect(again.stdout).toMatch(/^sidewise SW-0001 /);
    expect(again.stdout).toContain(INITIALISED);
    expect(again.stdout).toContain('1 of 500 runs');
  });

  it('after runs finish, .sidewise/ holds only log.jsonl and budget.json (no lock, no temp file)', () => {
    const root = project();
    expect(sidewise(root, ['class', 'req.txt']).status).toBe(0);
    expect(sidewise(root, ['outcome', 'SW-0001', 'failed', '--by', 'owner']).status).toBe(0);
    expect(sidewise(root, ['budget', 'set', '--runs', '50']).status).toBe(0);
    expect(sidewise(root, ['view', 'src']).status).toBe(0);
    expect(sidewise(root, ['class', 'missing.txt']).status).toBe(2);
    expect(readdirSync(path.join(root, '.sidewise')).sort()).toEqual(['budget.json', 'log.jsonl']);
  });
});
