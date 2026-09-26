// Real concurrency: separate processes of the built CLI launched together, as agents in parallel do.
// Bounded to at most 10 processes per test (shared machine).
import { spawn } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { sidewise, sidewiseAsync, type CliResult } from '../../helpers/cli.ts';
import { tempProject } from '../../helpers/project.ts';
import { classRequest } from '../../helpers/requests.ts';

interface Line {
  kind: string;
  id: string;
  of?: string;
}

/** Every log line parsed (a line that doesn't parse fails the test), plus the budget file. */
function state(root: string): { lines: Line[]; runIds: string[]; budgetRuns: number; files: string[] } {
  const dir = path.join(root, '.sidewise');
  const lines = readFileSync(path.join(dir, 'log.jsonl'), 'utf8')
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as Line);
  const budget = JSON.parse(readFileSync(path.join(dir, 'budget.json'), 'utf8')) as { runs: number };
  return { lines, runIds: lines.filter((l) => l.kind === 'run').map((l) => l.id), budgetRuns: budget.runs, files: readdirSync(dir).sort() };
}

const expectedIds = (n: number): string[] => Array.from({ length: n }, (_, i) => `SW-${String(i + 1).padStart(4, '0')}`);
const printedId = (r: CliResult): string | undefined => /^sidewise (SW-\d{4,}) /.exec(r.stdout)?.[1];
const isLockTimeout = (r: CliResult): boolean => r.status === 1 && r.stdout === '' && /^✖ lock: [^\n]+ → [^\n]+\n$/.test(r.stderr);

function project(): string {
  const { root } = tempProject();
  writeFileSync(path.join(root, 'req.txt'), classRequest());
  return root;
}

describe('separate processes at once', () => {
  it('10 × class on a fresh project: unique gap-free ids, every line parses, budget runs == logged runs', async () => {
    const root = project();
    const results = await Promise.all(Array.from({ length: 10 }, () => sidewiseAsync(root, ['class', 'req.txt'])));
    for (const r of results) expect(r.status === 0 || isLockTimeout(r), `${r.status} ${r.stderr}`).toBe(true);
    const ok = results.filter((r) => r.status === 0);
    const s = state(root);
    expect(s.runIds).toEqual(expectedIds(ok.length));
    expect(ok.map(printedId).sort()).toEqual(s.runIds);
    expect(s.budgetRuns).toBe(s.runIds.length);
    expect(s.files).toEqual(['budget.json', 'log.jsonl']);
  }, 60_000);

  it('class and outcome interleaved: every outcome names a logged run, ids stay gap-free, budget agrees', async () => {
    const root = project();
    for (let i = 0; i < 3; i++) expect(sidewise(root, ['class', 'req.txt']).status).toBe(0);
    const jobs = [
      ...Array.from({ length: 4 }, () => sidewiseAsync(root, ['class', 'req.txt'])),
      sidewiseAsync(root, ['outcome', 'SW-0001', 'failed', '--by', 'owner']),
      sidewiseAsync(root, ['outcome', 'SW-0002', 'overruled', '--by', 'owner']),
      sidewiseAsync(root, ['outcome', 'SW-0003', 'held', '--by', 'owner']),
      sidewiseAsync(root, ['outcome', 'SW-0001', 'held', '--by', 'reviewer-2']),
    ];
    const results = await Promise.all(jobs);
    for (const r of results) expect(r.status, r.stderr).toBe(0);
    const s = state(root);
    expect(s.runIds).toEqual(expectedIds(7));
    const outcomes = s.lines.filter((l) => l.kind === 'outcome');
    expect(outcomes).toHaveLength(4);
    for (const o of outcomes) expect(s.runIds.indexOf(o.of!)).toBeGreaterThanOrEqual(0);
    expect(s.budgetRuns).toBe(7);
    expect(s.files).toEqual(['budget.json', 'log.jsonl']);
  }, 60_000);

  it('6 runs racing a cap of 3: at least 3 succeed, the rest are blocked; the cap may be overshot by up to concurrent − 1 (at most 8 runs)', async () => {
    const root = project();
    expect(sidewise(root, ['budget', 'set', '--runs', '3']).status).toBe(0);
    const results = await Promise.all(Array.from({ length: 6 }, () => sidewiseAsync(root, ['class', 'req.txt'])));
    const ok = results.filter((r) => r.status === 0);
    const blocked = results.filter((r) => r.status === 3);
    expect(ok.length + blocked.length).toBe(6);
    for (const r of blocked) expect(r.stderr).toMatch(/^✖ budget: cap reached \([^\n]+\) → the owner runs "sidewise budget reset"\n$/);
    expect(ok.length).toBeGreaterThanOrEqual(3);
    expect(ok.length).toBeLessThanOrEqual(3 + (6 - 1));
    const s = state(root);
    expect(s.runIds).toEqual(expectedIds(ok.length));
    expect(s.budgetRuns).toBe(ok.length);
    expect(sidewise(root, ['class', 'req.txt']).status).toBe(3); // over the cap now: blocked until reset
  }, 60_000);

  it('a process killed (SIGKILL) while holding the lock: the next run proceeds without the 5 s wait', async () => {
    const root = project();
    const lock = path.join(root, '.sidewise', 'lock');
    const holder = spawn(
      process.execPath,
      ['-e', `const fs=require('fs');fs.mkdirSync(${JSON.stringify(path.dirname(lock))},{recursive:true});fs.writeFileSync(${JSON.stringify(lock)},process.pid+'\\n',{flag:'wx'});console.log('held');setInterval(()=>{},1000);`],
      { stdio: ['ignore', 'pipe', 'inherit'] },
    );
    await new Promise<void>((resolve) => holder.stdout.once('data', () => resolve()));
    const exited = new Promise((resolve) => holder.once('exit', resolve));
    holder.kill('SIGKILL');
    await exited;
    expect(readFileSync(lock, 'utf8')).toBe(`${holder.pid}\n`); // the dead holder's lock is still there

    const start = Date.now();
    const r = await sidewiseAsync(root, ['class', 'req.txt']);
    expect(r.status, r.stderr).toBe(0);
    expect(Date.now() - start).toBeLessThan(3000);
    expect(state(root).files).toEqual(['budget.json', 'log.jsonl']);
  }, 30_000);
});
