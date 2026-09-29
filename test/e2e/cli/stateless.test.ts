// Each run stands alone: the answer depends on the request (and, for the fake provider, nothing else), and
// .sidewise/ holds only the log and the budget between runs.
import { readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { hasNodeSqlite, sidewise } from '../../helpers/cli.ts';
import { tempProject } from '../../helpers/project.ts';

const CLASS_YAML = readFileSync('test/fixtures/requests/valid/class.yaml', 'utf8');
// A distinct goal: the contract reuses per-question answers keyed on evidence + question text, so sending the
// exact same request twice makes the second one free (calls: 0, not counted against the budget).
const CLASS_YAML_2 = CLASS_YAML.replace('This login handler is safe to merge', 'This login handler is safe to merge, again');

function project(): string {
  const { root } = tempProject();
  writeFileSync(path.join(root, 'req.yaml'), CLASS_YAML);
  return root;
}

/** The answer without what is expected to differ between two runs: the run id, the budget notes line, and
 *  (fix #6) the reused: line — present only once an earlier run's answers actually got reused, so an
 *  identical-content-but-first-of-its-kind call and a fully-reused repeat differ there by design. */
const answerBody = (stdout: string): string[] =>
  stdout
    .trimEnd()
    .split('\n')
    .filter((l) => !l.startsWith('notes: ') && !/^ {2}reused: /.test(l))
    .map((l) => l.replace(/SW-\d{4,}/g, 'SW-####'));

describe('statelessness', () => {
  it('the same request twice: the same answer except the run id (and the budget count in the notes)', () => {
    const root = project();
    const first = sidewise(root, ['class', 'req.yaml']);
    const second = sidewise(root, ['class', 'req.yaml']);
    expect(first.status).toBe(0);
    expect(second.status).toBe(0);
    expect(first.stdout).toMatch(/^side:\n {2}id: SW-0001\n/);
    expect(second.stdout).toMatch(/^side:\n {2}id: SW-0002\n/);
    expect(answerBody(second.stdout)).toEqual(answerBody(first.stdout));
    // The second call is a byte-for-byte repeat: every question is reused for free, so it doesn't count.
    expect(second.stdout.trimEnd().split('\n').at(-1)).toMatch(/^notes: \[.*budget 0% used \(\$0\.00 of \$5\.00 · 1 of 500 runs\).*\]$/);

    const elsewhere = sidewise(project(), ['class', 'req.yaml']); // a fresh project: byte-for-byte the first answer
    expect(elsewhere.stdout).toBe(first.stdout);
  });

  it('delete .sidewise/ between runs: a clean fresh start, SW-0001 again, a fresh budget', () => {
    const root = project();
    expect(sidewise(root, ['class', 'req.yaml']).stdout).toContain('$0.00 of $5.00 · 1 of 500 runs');
    writeFileSync(path.join(root, 'req2.yaml'), CLASS_YAML_2); // a different goal: a second paid run, not a free repeat
    expect(sidewise(root, ['class', 'req2.yaml']).stdout).toMatch(/^side:\n {2}id: SW-0002\n/);
    rmSync(path.join(root, '.sidewise'), { recursive: true });
    const again = sidewise(root, ['class', 'req.yaml']);
    expect(again.status).toBe(0);
    expect(again.stdout).toMatch(/^side:\n {2}id: SW-0001\n/);
    expect(again.stdout).toContain('$0.00 of $5.00 · 1 of 500 runs');
  });

  // Plan 2c B1: budget.json is gone — a `budget set` now writes .sidewise/config.yaml instead (caps live there;
  // spend is ledger-derived).
  it('after runs finish, .sidewise/ holds only .gitignore, log.jsonl, config.yaml and (with node:sqlite) index.db — no lock, no temp file', () => {
    const root = project();
    expect(sidewise(root, ['class', 'req.yaml']).status).toBe(0);
    expect(sidewise(root, ['outcome', 'SW-0001', 'failed', '--by', 'owner']).status).toBe(0);
    expect(sidewise(root, ['budget', 'set', '--runs', '50']).status).toBe(0);
    expect(sidewise(root, ['view', 'src']).status).toBe(0);
    expect(sidewise(root, ['class', 'missing.txt']).status).toBe(2);
    // index.db is the disposable id-index sidecar (ledger/index.ts): expected here, unlike a lock or .tmp file —
    // but only when this test's own Node has node:sqlite; the Node < 22.13 fallback never writes one at all.
    const expected = ['.gitignore', 'config.yaml', ...(hasNodeSqlite ? ['index.db'] : []), 'log.jsonl'];
    expect(readdirSync(path.join(root, '.sidewise')).sort()).toEqual(expected);
  });
});
