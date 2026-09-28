// A broken .sidewise/ through the built CLI: a corrupt log or budget, or a log that can't be written, refuses
// with one clean line and a fix. Nothing is spent or logged, and the files are left for the owner to repair.
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { expectCleanStop, sidewise, snapshot, snapshotLedgerAndBudget } from '../../helpers/cli.ts';
import { tempProject } from '../../helpers/project.ts';

const CLASS_YAML = readFileSync('test/fixtures/requests/valid/class.yaml', 'utf8');

function projectWithRun(): string {
  const { root } = tempProject();
  writeFileSync(path.join(root, 'req.yaml'), CLASS_YAML);
  expect(sidewise(root, ['class', 'req.yaml']).status).toBe(0);
  return root;
}

describe('a corrupt log', () => {
  it('a garbage line mid-file: class, view and outcome refuse (exit 1) and change nothing', () => {
    const root = projectWithRun();
    appendFileSync(path.join(root, '.sidewise', 'log.jsonl'), 'garbage\n{"kind":"outcome","of":"SW-0001"}\n');
    const before = snapshot(root);
    const stop = '✖ ledger: line 2 of .sidewise/log.jsonl is not valid JSON → fix or remove that line';
    expect(expectCleanStop(sidewise(root, ['class', 'req.yaml']), 1)).toBe(stop);
    expect(expectCleanStop(sidewise(root, ['view', 'src']), 1)).toBe(stop);
    expect(expectCleanStop(sidewise(root, ['outcome', 'SW-0001', 'failed', '--by', 'owner']), 1)).toBe(stop);
    expect(snapshot(root)).toEqual(before);
  });

  it('a truncated last line (no newline): class and outcome refuse; view reads past it (an append may be in progress)', () => {
    const root = projectWithRun();
    appendFileSync(path.join(root, '.sidewise', 'log.jsonl'), '{"kind":"run","id":"SW-00');
    // snapshotLedgerAndBudget, not the strict snapshot(): a truncated tail is NOT a mid-file parse error — the
    // incomplete last line is left unconsumed by the scanner (an append may be in progress), so class's own
    // preflight can still successfully self-heal (build or catch up) the index over the valid PREFIX before its
    // separate, stricter tail check refuses the command — legitimate self-healing, not a violation of "nothing
    // is spent or logged." budget.json must stay untouched here; log.jsonl keeps its truncated tail plus exactly
    // one new `kind:"lookup"` line from the successful view below (plan 2c B4: a place view now logs a free
    // lookup record — no longer the strict no-op this test used to pin).
    const before = snapshotLedgerAndBudget(root);
    const stop = '✖ ledger: line 2 of .sidewise/log.jsonl is not valid JSON → fix or remove that line';
    expect(expectCleanStop(sidewise(root, ['class', 'req.yaml']), 1)).toBe(stop);
    expect(expectCleanStop(sidewise(root, ['outcome', 'SW-0001', 'failed', '--by', 'owner']), 1)).toBe(stop);
    const view = sidewise(root, ['view', 'src']);
    expect(view).toMatchObject({ status: 0, stderr: '' });
    expect(view.stdout).toMatch(/^sidewise view src · 1 run /);
    const after = snapshotLedgerAndBudget(root);
    expect(after?.['budget.json']).toEqual(before?.['budget.json']);
    expect(after?.['log.jsonl']?.startsWith(before?.['log.jsonl'] ?? '')).toBe(true);
    const appended = after!['log.jsonl']!.slice((before?.['log.jsonl'] ?? '').length);
    expect(appended.trim().split('\n')).toHaveLength(1);
    expect(appended).toContain('"kind":"lookup"');
  });
});

describe('a corrupt budget', () => {
  it('class and budget show exit 3 with the fix; view still works; reset recovers', () => {
    const root = projectWithRun();
    writeFileSync(path.join(root, '.sidewise', 'budget.json'), '{"capUsd": 5, "runs": ');
    const stop = '✖ budget: .sidewise/budget.json is unreadable → the owner runs "sidewise budget reset" to start a fresh budget';
    expect(expectCleanStop(sidewise(root, ['class', 'req.yaml']), 3)).toBe(stop);
    expect(expectCleanStop(sidewise(root, ['budget']), 3)).toBe(stop);
    expect(sidewise(root, ['view', 'src']).status).toBe(0);
    expect(sidewise(root, ['budget', 'reset']).status).toBe(0);
    expect(sidewise(root, ['class', 'req.yaml']).stdout).toMatch(/^side:\n {2}id: SW-0002\n/);
  });
});

describe('a write failure', () => {
  it('the log path is a directory: exit 1, one clean line, the budget is not counted', () => {
    const { root } = tempProject();
    writeFileSync(path.join(root, 'req.yaml'), CLASS_YAML);
    mkdirSync(path.join(root, '.sidewise', 'log.jsonl'), { recursive: true });
    expect(expectCleanStop(sidewise(root, ['class', 'req.yaml']), 1)).toBe(
      '✖ files: cannot read .sidewise/log.jsonl (EISDIR) → make .sidewise/ a writable folder, with log.jsonl and budget.json as files',
    );
    expect(sidewise(root, ['budget']).stdout).toBe('budget 0% used ($0.00 of $5.00 · 0 of 500 runs)\n');
  });
});

describe('a lock that is not a lock file', () => {
  it('.sidewise/lock is a directory: exit 1 at once with one clean line, no spin', () => {
    const { root } = tempProject();
    writeFileSync(path.join(root, 'req.yaml'), CLASS_YAML);
    mkdirSync(path.join(root, '.sidewise', 'lock'), { recursive: true });
    const start = Date.now();
    const r = sidewise(root, ['class', 'req.yaml'], { timeoutMs: 8000 });
    expect(Date.now() - start).toBeLessThan(3000);
    expect(expectCleanStop(r, 1)).toBe('✖ files: .sidewise/lock is not a lock file → remove it');
  });
});
