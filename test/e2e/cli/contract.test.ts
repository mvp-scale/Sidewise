// The whole contract, end to end, through the built binary: every verb, template, outcome and budget agree.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { sidewise } from '../../helpers/cli.ts';
import { tempProject } from '../../helpers/project.ts';

function ledgerAgreesWithBudget(root: string): void {
  const lines = readFileSync(path.join(root, '.sidewise', 'log.jsonl'), 'utf8').trimEnd().split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const budget = JSON.parse(readFileSync(path.join(root, '.sidewise', 'budget.json'), 'utf8'));
  const counted = lines.filter((l) => (l.kind === 'run' && l.calls > 0) || l.kind === 'failed').length;
  expect(budget.runs).toBe(counted);
}

describe('the contract, end to end, through the built CLI', () => {
  it('view → class → outcome → replay → scan → template drill → drill → loop, one project [C-051] [C-057] [C-061] [C-068] [C-069] [C-075] [C-081]', () => {
    const { root } = tempProject();
    writeFileSync(path.join(root, 'class.yaml'), readFileSync('test/fixtures/requests/valid/class.yaml', 'utf8'));

    const view = sidewise(root, ['view', 'src']);
    expect(view.status).toBe(0);
    expect(view.stdout).toContain('no runs yet');
    expect(sidewise(root, ['class', 'class.yaml']).status).toBe(0);
    expect(sidewise(root, ['outcome', 'SW-0001', 'held', '--by', 'owner']).status).toBe(0);

    const replay = sidewise(root, ['replay', '--parent', 'SW-0001', '--compare', 'worktree..worktree', '--expect', 'injection']);
    expect(replay.status).toBe(0);
    expect(replay.stdout).toContain('wise: {recorded: [parent]}');

    // function is the finest layer, depth: quick: 3 concerns categories x 3 probes + decisions.
    writeFileSync(
      path.join(root, 'scan.yaml'),
      'side:\n  goal: Handlers trust nothing from the request\n  depth: quick\n  over:\n    file: src/*.ts\n    function: each\n  ask:\n    function:\n      concerns:\n        injection:\n          pass: no\n          1: Does {function} put request text straight into a query?\n          2: Is the query built by string concatenation?\n          3: Does {function} run the query with db.query on that string?\n        access:\n          pass: no\n          4: Does {function} return a record without checking its owner?\n          5: Is the caller id compared to the record owner id?\n          6: Could {function} be called without any permission check?\n        leaks:\n          pass: no\n          7: Does {function} send back a raw database error?\n          8: Does {function} log the full request body?\n          9: Does the response from {function} include fields nobody asked for?\n      decisions:\n        severity:\n          pass: [none, low]\n          10:\n            scale: How severe is the worst issue in {function}?\n            levels: [none, low, medium, high, critical]\n        route:\n          pass: [ship]\n          11:\n            choice: Where should {function} go?\n            options: [ship, fix, block]\n',
    );
    const scan = sidewise(root, ['scan', 'scan.yaml']);
    expect(scan.status).toBe(0);
    const scanId = /id: (SW-\d{4,})/.exec(scan.stdout)![1]!;

    const templated = sidewise(root, ['template', 'drill', '--parent', scanId, '--from', 'src/user.ts/findUser']);
    expect(templated.status).toBe(0);
    writeFileSync(path.join(root, 'drill.yaml'), templated.stdout);
    expect(sidewise(root, ['drill', 'drill.yaml']).status).toBe(0);

    writeFileSync(path.join(root, 'loop.yaml'), readFileSync('test/fixtures/requests/valid/loop.yaml', 'utf8'));
    expect(sidewise(root, ['loop', 'loop.yaml']).status).toBe(0);

    ledgerAgreesWithBudget(root);
    expect(sidewise(root, ['budget']).stdout).toMatch(/of 500 runs\)\n$/);
  });
});
