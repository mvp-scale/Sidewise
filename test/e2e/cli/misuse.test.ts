// Agents misuse tools. Every misuse of the built CLI ends with the right exit code, nothing on stdout, one
// "✖ <field>: <problem> → <fix>" line on stderr, no stack trace, and .sidewise/ exactly as it was.
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { expectCleanStop, sidewise, snapshot, snapshotLedgerAndBudget, type CliResult } from '../../helpers/cli.ts';
import { tempProject, USER_TS } from '../../helpers/project.ts';

const CLASS_YAML = readFileSync('test/fixtures/requests/valid/class.yaml', 'utf8');

/** Runs one misuse and checks that .sidewise/ is byte-for-byte what it was before. */
function unchanged(root: string, args: string[], o: Parameters<typeof sidewise>[2] = {}): CliResult {
  const before = snapshot(root);
  const r = sidewise(root, args, o);
  expect(snapshot(root)).toEqual(before);
  return r;
}

/** A project with one logged run (SW-0001, asked by e2e-agent), so misuse has a ledger to leave alone. */
function projectWithRun(): string {
  const { root } = tempProject();
  writeFileSync(path.join(root, 'req.yaml'), CLASS_YAML);
  expect(sidewise(root, ['class', 'req.yaml']).status).toBe(0);
  return root;
}

describe('class: bad request input', () => {
  let root: string;
  beforeAll(() => {
    root = projectWithRun();
  });
  const file = (name: string, body: string | Buffer): string => {
    writeFileSync(path.join(root, name), body);
    return name;
  };

  it('an empty file, and empty stdin', () => {
    const stop = '✖ request: empty → start with "side:" (sidewise template class prints a skeleton)';
    expect(expectCleanStop(unchanged(root, ['class', file('empty.txt', '')]), 2)).toBe(stop);
    expect(expectCleanStop(unchanged(root, ['class', '-'], { input: '' }), 2)).toBe(stop);
  });

  it('a binary file', () => {
    const bytes = Buffer.from(Array.from({ length: 4096 }, (_, i) => (i * 97 + 13) % 256));
    expect(expectCleanStop(unchanged(root, ['class', file('blob.bin', bytes)]), 2)).toBe(
      '✖ request: blob.bin is binary, not text → write the request as YAML, starting "side:"',
    );
  });

  it('a file over 1 MB, and over 1 MB on stdin', () => {
    const big = `${CLASS_YAML}\n# ${'x'.repeat(1_100_000)}\n`;
    const stop = '✖ request: larger than 1 MB → a request is a short text file; point "where:" at the code instead';
    expect(expectCleanStop(unchanged(root, ['class', file('big.txt', big)]), 2)).toBe(stop);
    expect(expectCleanStop(unchanged(root, ['class', '-'], { input: big }), 2)).toBe(stop);
  });

  it('a directory, and a missing file', () => {
    expect(expectCleanStop(unchanged(root, ['class', 'src']), 2)).toBe('✖ request: src is a folder → pass a request file, or - to read stdin');
    expect(expectCleanStop(unchanged(root, ['class', 'nope.txt']), 2)).toBe('✖ request: nope.txt not found → check the path, or pass - to read stdin');
  });

  it('a file argument with control characters is refused; a long one is clipped in the message', () => {
    expect(expectCleanStop(unchanged(root, ['class', 'req\u001b[2J.txt']), 2)).toBe('✖ request: the file name has control characters → pass a plain path, or - to read stdin');
    const long = `${'d'.repeat(200)}.txt`; // under NAME_MAX, so it is "not found", not ENAMETOOLONG
    const stop = expectCleanStop(unchanged(root, ['class', long]), 2);
    expect(stop).toMatch(/^✖ request: d+… not found → check the path, or pass - to read stdin$/);
    expect(stop.length).toBeLessThan(140);
  });

  it('a request whose header names another verb', () => {
    const badVerb = file('view.yaml', CLASS_YAML.replace('side:\n', 'side:\n  verb: view\n'));
    expect(expectCleanStop(unchanged(root, ['class', badVerb]), 2)).toBe('✖ side.verb: says "view" but you ran class → remove side.verb, or run sidewise view');
  });

  it('a valid request with trailing garbage', () => {
    const trailing = file('trail.yaml', `${CLASS_YAML}\nThanks! Let me know what you think.\n`);
    const r = unchanged(root, ['class', trailing]);
    expect(r.status).toBe(2);
    expect(r.stdout).toBe('');
    expect(r.stderr).toMatch(/^✖ /);
  });

  it('a request with many bad lines: at most 5 stops, then one line saying how many more', () => {
    const categories = Array.from({ length: 12 }, (_, i) => `    cat${i + 1}: {pass: no}`).join('\n');
    const noisy = file(
      'noisy.yaml',
      `side:\n  goal: This login handler is safe to merge\n  depth: quick\n  where: [src/user.ts:1-3]\n  ask:\n${categories}\n`,
    );
    const r = unchanged(root, ['class', noisy]);
    expect(r.status).toBe(2);
    const lines = r.stderr.trimEnd().split('\n');
    expect(lines).toHaveLength(6);
    expect(lines.every((l) => /^✖ .+ → .+$/.test(l))).toBe(true);
    expect(lines[5]).toMatch(/^✖ request: \d+ more problems → fix the ones above, then run again$/);
  });
});

describe('flags', () => {
  let root: string;
  beforeAll(() => {
    root = projectWithRun();
  });

  it('a duplicated flag is refused, not silently last-wins', () => {
    expect(expectCleanStop(unchanged(root, ['view', 'src', '--level', '2', '--level', '3']), 2)).toBe('✖ --level: given twice → give it once');
    expect(expectCleanStop(unchanged(root, ['outcome', 'SW-0001', 'failed', '--by', 'owner', '--by', 'other']), 2)).toBe('✖ --by: given twice → give it once');
    expect(expectCleanStop(unchanged(root, ['budget', 'set', '--runs', '5', '--runs', '9']), 2)).toBe('✖ --runs: given twice → give it once');
  });

  it('an unknown flag, a flag before the command, and extra arguments: one "✖ args:" line with that command\'s usage', () => {
    const view = 'sidewise view <folder | tag | SW-#### | request-file | -> [--level 1|2|3]';
    const cls = 'sidewise class <request-file | -> [--dry-run]';
    expect(expectCleanStop(unchanged(root, ['view', 'src', '--lvl', '2']), 2)).toBe(`✖ args: unknown flag --lvl → ${view}`);
    expect(expectCleanStop(unchanged(root, ['--level', '2', 'view', 'src']), 2)).toBe(`✖ args: "--level" comes before the command → ${view}`);
    expect(expectCleanStop(unchanged(root, ['class', 'req.yaml', '--level', '2']), 2)).toBe(`✖ args: unknown flag --level → ${cls}`);
    expect(expectCleanStop(unchanged(root, ['class', 'req.yaml', 'other.txt']), 2)).toBe(`✖ args: extra argument "other.txt" → ${cls}`);
    expect(expectCleanStop(unchanged(root, ['budget', 'show', 'now']), 2)).toBe('✖ args: extra argument "now" → sidewise budget [show | reset | set --usd <n> --runs <n>]');
    expect(expectCleanStop(unchanged(root, ['outcome', 'SW-0001', 'failed', 'x', '--by', 'o']), 2)).toBe(
      '✖ args: extra argument "x" → sidewise outcome <SW-####> held|overruled|failed --by <actor>',
    );
  });

  it('--level 0, 4 and abc', () => {
    for (const bad of ['0', '4', 'abc', '']) {
      expect(expectCleanStop(unchanged(root, ['view', 'src', '--level', bad]), 2)).toBe(`✖ --level: "${bad}" is not a level → use --level 1, 2 or 3`);
    }
  });
});

describe('change: bad flag combinations', () => {
  let root: string;
  beforeAll(() => {
    root = projectWithRun(); // SW-0001, a valid --parent target
  });

  it('--parent without --compare, and --compare without --parent', () => {
    const stop = '✖ --parent/--compare: give both, or neither → sidewise change --parent SW-#### --compare <before>..<after>';
    expect(expectCleanStop(unchanged(root, ['change', '--parent', 'SW-0001']), 2)).toBe(stop);
    expect(expectCleanStop(unchanged(root, ['change', '--compare', 'main..HEAD']), 2)).toBe(stop);
  });

  it('--compare not shaped like <before>..<after>: nothing before it, nothing after it, or no ".." at all', () => {
    for (const bad of ['a..', '..b', 'ab']) {
      expect(expectCleanStop(unchanged(root, ['change', '--parent', 'SW-0001', '--compare', bad]), 2)).toBe(
        `✖ --compare: "${bad}" is not <before>..<after> → e.g. --compare main..HEAD`,
      );
    }
  });

  // A valid <before>..<after> shape (e.g. "worktree..worktree") passing the CLI's own check and reaching
  // runChange is exercised end to end in cli.test.ts's "change: the flag form..." test (--dry-run and a real run).
});

describe('outcome', () => {
  let root: string;
  beforeAll(() => {
    root = projectWithRun();
  });

  it('an unknown id is an invalid request (exit 2)', () => {
    expect(expectCleanStop(unchanged(root, ['outcome', 'SW-0099', 'failed', '--by', 'owner']), 2)).toBe(
      '✖ outcome: SW-0099 is not in the ledger → check the id with "sidewise view SW-0099"',
    );
  });

  it('a malformed id', () => {
    for (const id of ['SW-1', 'sw-0001', 'SW-00x1', '0001']) {
      expect(expectCleanStop(unchanged(root, ['outcome', id, 'failed', '--by', 'owner']), 2)).toBe(`✖ outcome: "${id}" is not a run id → use the SW-#### that class printed, e.g. SW-0001`);
    }
  });

  it('a bad outcome word, and a missing or empty --by', () => {
    expect(expectCleanStop(unchanged(root, ['outcome', 'SW-0001', 'great', '--by', 'owner']), 2)).toBe('✖ outcome: "great" is not an outcome → use held, overruled or failed');
    expect(expectCleanStop(unchanged(root, ['outcome', 'SW-0001', 'failed']), 2)).toBe('✖ --by: missing → add --by <who judged the run>');
    expect(expectCleanStop(unchanged(root, ['outcome', 'SW-0001', 'failed', '--by', ' ']), 2)).toBe('✖ --by: missing → add --by <who judged the run>');
  });

  it('the same outcome twice is recorded once; the second call says so and exits 0', () => {
    const first = sidewise(root, ['outcome', 'SW-0001', 'failed', '--by', 'owner']);
    expect(first).toMatchObject({ status: 0, stdout: 'sidewise outcome SW-0001 failed · by owner\n', stderr: '' });
    // Not the strict unchanged() helper: a repeated outcome still validates the tail through the index first
    // (appendOutcome's own checkTail/latestOutcomeOf), which legitimately catches the index up to the outcome
    // `first` just appended — correct self-healing, not a change to the LEDGER or BUDGET this "no-op" promises.
    const beforeAgain = snapshotLedgerAndBudget(root);
    const again = sidewise(root, ['outcome', 'SW-0001', 'failed', '--by', 'owner']);
    expect(snapshotLedgerAndBudget(root)).toEqual(beforeAgain);
    expect(again).toMatchObject({ status: 0, stdout: 'sidewise outcome SW-0001 failed · already recorded by owner\n', stderr: '' });
    // The same outcome from a different actor is a second judgement: appended.
    expect(sidewise(root, ['outcome', 'SW-0001', 'failed', '--by', 'reviewer-2'])).toMatchObject({ status: 0, stdout: 'sidewise outcome SW-0001 failed · by reviewer-2\n' });
    const lines = readFileSync(path.join(root, '.sidewise', 'log.jsonl'), 'utf8').trimEnd().split('\n');
    expect(lines.filter((l) => l.includes('"kind":"outcome"'))).toHaveLength(2);
    expect(sidewise(root, ['outcome', 'SW-0001', 'overruled', '--by', 'owner']).status).toBe(0); // a change is a new line
  });
});

describe('view', () => {
  let root: string;
  beforeAll(() => {
    root = projectWithRun();
  });

  it('a path outside the project is refused; an absolute path inside it works', () => {
    for (const target of ['../..', '..', 'src/../../etc', '/etc']) {
      expect(expectCleanStop(unchanged(root, ['view', target]), 2)).toBe(`✖ view: "${target}" is outside the project → use a folder inside it, a tag, or SW-####`);
    }
    const abs = unchanged(root, ['view', path.join(root, 'src')]);
    expect(abs.status).toBe(0);
    expect(abs.stdout).toMatch(/^sidewise view src · 1 run /);
  });

  it('control characters are refused; other odd characters are just a place with no runs', () => {
    expect(expectCleanStop(unchanged(root, ['view', 'src\u001b[31m']), 2)).toBe('✖ view: the target has control characters → use a folder, a tag, or SW-####');
    const odd = unchanged(root, ['view', 'wéird *?[] name']);
    expect(odd).toMatchObject({ status: 0, stdout: 'sidewise view wéird *?[] name · no runs yet → "sidewise class <request>" starts one\n', stderr: '' });
  });

  it('a very long target: exit 0, one short line', () => {
    const r = unchanged(root, ['view', 'x'.repeat(5000)]);
    expect(r.status).toBe(0);
    expect(r.stdout.split('\n')).toHaveLength(2);
    expect(r.stdout.length).toBeLessThan(160);
  });
});

describe('environment', () => {
  it('outside any project (no .sidewise or .git above): every command stops, nothing is created', () => {
    const bare = mkdtempSync(path.join(os.tmpdir(), 'sidewise-bare-'));
    mkdirSync(path.join(bare, 'src'));
    writeFileSync(path.join(bare, 'src', 'user.ts'), USER_TS);
    writeFileSync(path.join(bare, 'req.yaml'), CLASS_YAML);
    const stop = '✖ project: no .sidewise or .git folder here or above → run inside a project, or "mkdir .sidewise" to start one here';
    for (const args of [['class', 'req.yaml'], ['view', 'src'], ['outcome', 'SW-0001', 'failed', '--by', 'owner'], ['budget'], ['budget', 'reset']]) {
      expect(expectCleanStop(sidewise(bare, args, { home: false }), 2)).toBe(stop);
    }
    expect(snapshot(bare)).toBeNull();
    mkdirSync(path.join(bare, '.sidewise'));
    expect(sidewise(bare, ['class', 'req.yaml'], { home: false }).status).toBe(0); // "mkdir .sidewise" is enough
  });

  it.skipIf(process.getuid?.() === 0)('.sidewise/ not writable: exit 1, one clean line, nothing changed', () => {
    const root = projectWithRun();
    const dir = path.join(root, '.sidewise');
    chmodSync(dir, 0o555);
    try {
      const r = unchanged(root, ['class', 'req.yaml']);
      expect(expectCleanStop(r, 1)).toMatch(/^✖ files: .*\.sidewise\/.* \(EACCES\) → make \.sidewise\/ a writable folder/);
      expect(expectCleanStop(unchanged(root, ['outcome', 'SW-0001', 'failed', '--by', 'owner']), 1)).toMatch(/^✖ files: .*\(EACCES\)/);
      expect(expectCleanStop(unchanged(root, ['budget', 'reset']), 1)).toMatch(/^✖ files: .*\(EACCES\)/);
    } finally {
      chmodSync(dir, 0o755);
    }
  });

  it.skipIf(process.getuid?.() === 0)('a fresh, read-only .sidewise/: exit 1, no budget file appears', () => {
    const { root } = tempProject();
    writeFileSync(path.join(root, 'req.yaml'), CLASS_YAML);
    const dir = path.join(root, '.sidewise');
    mkdirSync(dir, { mode: 0o555 });
    try {
      expect(expectCleanStop(unchanged(root, ['class', 'req.yaml']), 1)).toMatch(/^✖ files: .*\(EACCES\) → /);
    } finally {
      chmodSync(dir, 0o755);
    }
  });

  it('an unknown SIDEWISE_PROVIDER: one clean line, no doubled prefix', () => {
    const root = projectWithRun();
    expect(expectCleanStop(unchanged(root, ['class', 'req.yaml'], { env: { SIDEWISE_PROVIDER: 'bogus' } }), 1)).toBe('✖ provider: "bogus" is not a provider → use fake, chaos or typesafe');
  });
});
