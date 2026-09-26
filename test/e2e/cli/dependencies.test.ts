// A broken .sidewise/ through the built CLI: a corrupt log or budget, or a log that can't be written, refuses
// with one clean line and a fix. Nothing is spent or logged, and the files are left for the owner to repair.
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { expectCleanStop, sidewise, snapshot } from '../../helpers/cli.ts';
import { tempProject } from '../../helpers/project.ts';
import { classRequest } from '../../helpers/requests.ts';

function projectWithRun(): string {
  const { root } = tempProject();
  writeFileSync(path.join(root, 'req.txt'), classRequest());
  expect(sidewise(root, ['class', 'req.txt']).status).toBe(0);
  return root;
}

describe('a corrupt log', () => {
  it.each([
    ['a garbage line mid-file', 'garbage\n{"kind":"outcome","of":"SW-0001"}\n'],
    ['a truncated last line', '{"kind":"run","id":"SW-00'],
  ])('%s: class, view and outcome refuse (exit 1) and change nothing', (_name, tail) => {
    const root = projectWithRun();
    appendFileSync(path.join(root, '.sidewise', 'log.jsonl'), tail);
    const before = snapshot(root);
    const stop = '✖ ledger: line 2 of .sidewise/log.jsonl is not valid JSON → fix or remove that line';
    expect(expectCleanStop(sidewise(root, ['class', 'req.txt']), 1)).toBe(stop);
    expect(expectCleanStop(sidewise(root, ['view', 'src']), 1)).toBe(stop);
    expect(expectCleanStop(sidewise(root, ['outcome', 'SW-0001', 'failed', '--by', 'owner']), 1)).toBe(stop);
    expect(snapshot(root)).toEqual(before);
  });
});

describe('a corrupt budget', () => {
  it('class and budget show exit 3 with the fix; view still works; reset recovers', () => {
    const root = projectWithRun();
    writeFileSync(path.join(root, '.sidewise', 'budget.json'), '{"capUsd": 5, "runs": ');
    const stop = '✖ budget: .sidewise/budget.json is unreadable → the owner runs "sidewise budget reset" to start a fresh budget';
    expect(expectCleanStop(sidewise(root, ['class', 'req.txt']), 3)).toBe(stop);
    expect(expectCleanStop(sidewise(root, ['budget']), 3)).toBe(stop);
    expect(sidewise(root, ['view', 'src']).status).toBe(0);
    expect(sidewise(root, ['budget', 'reset']).status).toBe(0);
    expect(sidewise(root, ['class', 'req.txt']).stdout).toMatch(/^sidewise SW-0002 /);
  });
});

describe('a write failure', () => {
  it('the log path is a directory: exit 1, one clean line, the budget is not counted', () => {
    const { root } = tempProject();
    writeFileSync(path.join(root, 'req.txt'), classRequest());
    mkdirSync(path.join(root, '.sidewise', 'log.jsonl'), { recursive: true });
    expect(expectCleanStop(sidewise(root, ['class', 'req.txt']), 1)).toBe(
      '✖ files: cannot read .sidewise/log.jsonl (EISDIR) → make .sidewise/ a writable folder, with log.jsonl and budget.json as files',
    );
    expect(sidewise(root, ['budget']).stdout).toBe('budget 0% used ($0.00 of $5.00 · 0 of 500 runs)\n');
  });
});
