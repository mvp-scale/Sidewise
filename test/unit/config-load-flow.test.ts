// `mm3 config --load`: check the file, make it the ACTIVE config, and have requests read only that copy.
// Edits to config.yaml change nothing until loaded; a bad file never goes live; a project from before --load is
// loaded once, on its first paid run. [C-242] [C-243] [C-244] [C-245] [C-246]
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { stringify } from 'yaml';
import { runCli, type CliCtx } from '../../src/cli.ts';
import { fingerprintOf, readActive, writeActive } from '../../src/config/active.ts';
import { runConfig, runConfigLoad } from '../../src/config/config.ts';
import { resolveConfig } from '../../src/config/load.ts';
import { writeConfigOverride } from '../../src/config/write.ts';
import { runDoctor } from '../../src/verbs/doctor.ts';
import { setBudget } from '../../src/budget/budget.ts';
import { pathsFor } from '../../src/ledger/paths.ts';
import { tempProject } from '../helpers/project.ts';

type Obj = Record<string, unknown>;
const tempPathsOf = (root: string) => pathsFor(root);

function ctxFor(root: string, extraEnv: Record<string, string> = {}, stdinText = ''): CliCtx {
  return {
    env: { MM3_PROVIDER: 'fake', MM3_HOME: root, ...extraEnv },
    cwd: root,
    platform: process.platform,
    runner: () => ({ status: 1, stdout: '', stderr: 'not used' }),
    packageDir: process.cwd(),
    pkg: { name: '@mvpscale/mm3', version: '9.9.9-test' },
    homeDir: '/nonexistent-home',
    nodeVersion: process.version,
    stdin: () => Buffer.from(stdinText),
    io: { input: new PassThrough(), output: new PassThrough() },
  };
}
const mm3 = (root: string, argv: string[], stdin = ''): Promise<{ exit: number; text: string }> => runCli(argv, ctxFor(root, {}, stdin));
const write = (root: string, text: string): void => {
  mkdirSync(path.join(root, '.mm3'), { recursive: true });
  writeFileSync(path.join(root, '.mm3', 'config.yaml'), text);
};
const activeText = (root: string): string => readFileSync(path.join(root, '.mm3', 'config.active.json'), 'utf8');

const concern = (from: number): Obj => ({ pass: 'no', [from]: 'Is a wrong?', [from + 1]: 'Is b wrong?', [from + 2]: 'Is c wrong?' });
const oneCategoryClass = (): string =>
  stringify({
    mak: {
      goal: 'The handler is safe to merge',
      depth: 'quick',
      where: ['src/user.ts'],
      ask: {
        concerns: { c1: concern(1) },
        decisions: { severity: { pass: ['none'], 4: { scale: 'How bad?', levels: ['none', 'high'] } }, route: { pass: ['ship'], 5: { choice: 'Where to?', options: ['ship', 'block'] } } },
      },
    },
  });

describe('mm3 config --load', () => {
  it('a clean file becomes the active config, and the one line says what changed from the defaults [C-242]', async () => {
    const { root } = tempProject();
    write(root, '# my notes\ndepth:\n  class: [15, 30, 45]\nbudget:\n  usd: 2\n  runs: 500\n');
    const r = await mm3(root, ['config', '--load']);
    expect(r.exit).toBe(0);
    expect(r.text.split('\n')[0]).toBe('✔ valid · active · 2 changed from defaults'); // runs: 500 is the default, so it changes nothing
    expect(r.text).toContain('  depth.class: [3, 6, 9] → [15, 30, 45]');
    expect(r.text).toContain('  budget.usd: 5 → 2');
    const active = JSON.parse(activeText(root)) as { v: number; fingerprint: string; loadedAt: string; overrides: Obj };
    expect(active.v).toBe(1);
    expect(active.fingerprint).toBe(fingerprintOf(readFileSync(path.join(root, '.mm3', 'config.yaml'), 'utf8')));
    expect(active.loadedAt).toMatch(/^\d{4}-\d\d-\d\dT[\d:]+Z$/);
    expect(active.overrides).toMatchObject({ depth: { class: [15, 30, 45] }, budget: { usd: 2, runs: 500 } });
  });

  it('never rewrites the user\'s own config.yaml: comments and all stay as typed', async () => {
    const { root } = tempProject();
    const text = '# keep me\nbudget:\n  usd: 2   # trailing\n';
    write(root, text);
    await mm3(root, ['config', '--load']);
    expect(readFileSync(path.join(root, '.mm3', 'config.yaml'), 'utf8')).toBe(text);
  });

  it('a bad file prints every problem, exits 2, and leaves the previously active copy untouched [C-243]', async () => {
    const { root } = tempProject();
    write(root, 'budget:\n  usd: 2\n');
    expect((await mm3(root, ['config', '--load'])).exit).toBe(0);
    const before = activeText(root);
    write(root, 'budget:\n  usd: -1\nnope: true\ndepth:\n  class: [9, 3, 1]\n');
    const r = await mm3(root, ['config', '--load']);
    expect(r.exit).toBe(2);
    expect(r.text).toContain('✖ config.budget.usd: -1 is not a positive number → give a number greater than 0');
    expect(r.text).toContain('✖ config.nope:');
    expect(r.text).toContain('✖ config.depth.class: [9, 3, 1] is not ascending');
    expect(r.text).toContain('not loaded: the active config is unchanged');
    expect(activeText(root)).toBe(before);
    expect(resolveConfig(tempPathsOf(root), {}).config.budget.usd).toBe(2);
  });

  it('with nothing active yet, a bad file leaves no active copy at all', async () => {
    const { root } = tempProject();
    write(root, 'budget:\n  usd: -1\n');
    const r = await mm3(root, ['config', '--load']);
    expect(r.exit).toBe(2);
    expect(r.text).toContain('nothing is active yet');
    expect(existsSync(path.join(root, '.mm3', 'config.active.json'))).toBe(false);
  });

  it('a file elsewhere is checked, then copied to .mm3/config.yaml verbatim, then loaded [C-244]', async () => {
    const { root } = tempProject();
    const other = path.join(root, 'team-config.yaml');
    const text = '# team settings\nbudget:\n  usd: 3  # shared cap\n';
    writeFileSync(other, text);
    const r = await mm3(root, ['config', '--load', 'team-config.yaml']);
    expect(r.exit).toBe(0);
    expect(r.text).toContain('budget.usd: 5 → 3');
    expect(r.text).toContain('copied team-config.yaml → .mm3/config.yaml');
    expect(readFileSync(path.join(root, '.mm3', 'config.yaml'), 'utf8')).toBe(text);
    expect(resolveConfig(tempPathsOf(root), {}).config.budget.usd).toBe(3);
  });

  it('a bad file elsewhere is refused before it can replace .mm3/config.yaml', async () => {
    const { root } = tempProject();
    write(root, 'budget:\n  usd: 2\n');
    await mm3(root, ['config', '--load']);
    writeFileSync(path.join(root, 'bad.yaml'), 'budget:\n  usd: nope\n');
    const r = await mm3(root, ['config', '--load', 'bad.yaml']);
    expect(r.exit).toBe(2);
    expect(readFileSync(path.join(root, '.mm3', 'config.yaml'), 'utf8')).toBe('budget:\n  usd: 2\n');
    expect((await mm3(root, ['config', '--load', 'missing.yaml'])).text).toBe('✖ config: cannot read "missing.yaml" → check the path\n');
  });

  it('with no config.yaml to load it says how to get one', async () => {
    const { root } = tempProject();
    const r = await mm3(root, ['config', '--load']);
    expect(r.exit).toBe(2);
    expect(r.text).toContain('no .mm3/config.yaml to load → run mm3 config --write for a starter');
  });

  it('--load and --write together is a usage stop with the fix [C-242]', async () => {
    const { root } = tempProject();
    const r = await mm3(root, ['config', '--load', '--write']);
    expect(r.exit).toBe(2);
    expect(r.text).toContain('--load and --write cannot go together → run mm3 config --write first, edit the file, then mm3 config --load');
    expect(existsSync(path.join(root, '.mm3', 'config.yaml'))).toBe(false);
  });

  it('a file named without --load is an extra-argument stop', async () => {
    const { root } = tempProject();
    expect((await mm3(root, ['config', 'x.yaml'])).exit).toBe(2);
  });

  it('with no project it stops like --write does', () => {
    expect(runConfigLoad(undefined, undefined, '/', 'none').exit).toBe(2);
  });
});

describe('requests read only the active copy [C-245]', () => {
  it('an edit that is not loaded changes nothing; doctor and mm3 config say so; loading applies it', async () => {
    const { root, paths } = tempProject();
    write(root, 'budget:\n  usd: 2\n');
    await mm3(root, ['config', '--load']);
    expect(resolveConfig(paths, {}).config.budget.usd).toBe(2);

    write(root, 'budget:\n  usd: 9\n');
    expect(resolveConfig(paths, {}).config.budget.usd).toBe(2); // still the loaded copy
    expect(runDoctor({}, paths).text).toContain('⚠ config.yaml changed since load → mm3 config --load');
    const shown = (await mm3(root, ['config'])).text;
    expect(shown).toContain('  - ⚠ config.yaml changed since load → mm3 config --load');
    expect(shown).toContain('    usd: 2  # from config.yaml');

    expect((await mm3(root, ['config', '--load'])).exit).toBe(0);
    expect(resolveConfig(paths, {}).config.budget.usd).toBe(9);
    expect(runDoctor({}, paths).text).toMatch(/✔ config: active \(loaded \d{4}/);
    expect((await mm3(root, ['config'])).text).toMatch(/- config: active \(loaded \d{4}/);
  });

  it('no YAML is parsed per request: a loaded config survives config.yaml turning to garbage, or going away', async () => {
    const { root, paths } = tempProject();
    write(root, 'budget:\n  usd: 2\n');
    await mm3(root, ['config', '--load']);
    write(root, ':::: not [ yaml');
    const r = resolveConfig(paths, {});
    expect(r.config.budget.usd).toBe(2);
    expect(r.stops).toEqual([]);
    rmSync(path.join(root, '.mm3', 'config.yaml'));
    expect(resolveConfig(paths, {}).config.budget.usd).toBe(2);
    expect(runDoctor({}, paths).text).toContain('⚠ config.yaml is gone but a loaded config is still active');
  });

  it('a damaged or hand-edited active copy is ignored, not applied', () => {
    const { root, paths } = tempProject();
    write(root, 'budget:\n  usd: 2\n');
    writeActive(paths, { budget: { usd: 2 } } as never, fingerprintOf('x'));
    expect(readActive(paths)).toBeDefined();
    writeFileSync(paths.configActive, '{"v":1,"loadedAt":"x","fingerprint":"y","overrides":{"budget":{"usd":-5}}}');
    expect(readActive(paths)).toBeUndefined();
    writeFileSync(paths.configActive, 'not json');
    expect(readActive(paths)).toBeUndefined();
    // falls back to reading the file (a project with no usable copy), exactly as before
    expect(resolveConfig(paths, {}).config.budget.usd).toBe(2);
  });

  it('with no config.yaml and no active copy: defaults, and doctor keeps its exact old words [C-246]', async () => {
    const { root, paths } = tempProject();
    expect(resolveConfig(paths, {}).present).toBe(false);
    expect(runDoctor({}, paths).text).toContain('config: "✔ config: defaults"');
    const shown = (await mm3(root, ['config'])).text;
    expect(shown).toContain('  - no config.yaml here → every value is a default or env var');
    expect(shown).not.toContain('config: active');
  });

  it('env-aware fields still label env over the loaded copy', async () => {
    const { root, paths } = tempProject();
    write(root, 'model: from-file\n');
    await mm3(root, ['config', '--load']);
    expect(resolveConfig(paths, {}).sources.model).toBe('config');
    expect(resolveConfig(paths, { JEV_MODEL: 'x' }).sources.model).toBe('env');
  });
});

describe('the active copy on disk', () => {
  it('is ignored by git, beside the committed config.yaml [C-246]', async () => {
    const { root } = tempProject();
    spawnSync('git', ['init', '-q'], { cwd: root });
    write(root, 'budget:\n  usd: 2\n');
    await mm3(root, ['config', '--load']);
    const ignored = (f: string) => spawnSync('git', ['check-ignore', '-q', `.mm3/${f}`], { cwd: root }).status === 0;
    expect(ignored('config.active.json')).toBe(true);
    expect(ignored('config.yaml')).toBe(false);
  });

  it('is written atomically: no temp file is left, and a reader never sees half of one [C-246]', () => {
    const { paths } = tempProject();
    for (let i = 0; i < 50; i++) {
      writeActive(paths, { budget: { usd: i + 1 } } as never, `fp${i}`);
      expect(readActive(paths)?.overrides.budget?.usd).toBe(i + 1);
    }
    expect(readdirSync(paths.dir).filter((n) => n.includes('.tmp'))).toEqual([]);
  });

  it('two loads racing leave one whole, valid copy', async () => {
    const { root, paths } = tempProject();
    write(root, 'budget:\n  usd: 2\n');
    const results = await Promise.all([mm3(root, ['config', '--load']), mm3(root, ['config', '--load']), mm3(root, ['config', '--load'])]);
    expect(results.every((r) => r.exit === 0)).toBe(true);
    expect(readActive(paths)?.overrides.budget?.usd).toBe(2);
  });
});

describe('MM3\'s own config writes go live at once', () => {
  it('budget set updates the active copy and keeps it in step with the file [C-245]', async () => {
    const { root, paths } = tempProject();
    write(root, '# caps\nbudget:\n  usd: 2\n');
    await mm3(root, ['config', '--load']);
    const r = await mm3(root, ['budget', 'set', '--usd', '7']);
    expect(r.exit).toBe(0);
    expect(resolveConfig(paths, {}).config.budget.usd).toBe(7);
    expect(runDoctor({}, paths).text).toMatch(/✔ config: active/); // fingerprint followed the file
    expect(readFileSync(path.join(root, '.mm3', 'config.yaml'), 'utf8')).toContain('# caps');
  });

  it('a pending hand edit stays pending when budget set writes: doctor keeps warning', async () => {
    const { root, paths } = tempProject();
    write(root, 'budget:\n  usd: 2\n');
    await mm3(root, ['config', '--load']);
    write(root, 'budget:\n  usd: 2\nretries: 5\n'); // edited, not loaded
    setBudget(paths, { capRuns: 11 });
    expect(resolveConfig(paths, {}).config.budget.runs).toBe(11); // the budget write is live
    expect(resolveConfig(paths, {}).config.retries).toBe(2); // the hand edit is not
    expect(runDoctor({}, paths).text).toContain('⚠ config.yaml changed since load');
  });

  it('a fresh project (no file, no copy) gets both from the first write', () => {
    const { paths } = tempProject();
    writeConfigOverride(paths, { budget: { since: '2026-01-01T00:00:00Z' } });
    expect(resolveConfig(paths, {}).config.budget.since).toBe('2026-01-01T00:00:00Z');
    expect(runDoctor({}, paths).text).toMatch(/✔ config: active/);
  });
});

describe('one-time load of a config.yaml from before --load [C-247]', () => {
  const REQUEST = oneCategoryClass();

  it('the first paid run loads it, says so once, and uses it; the next run is quiet', async () => {
    const { root, paths } = tempProject();
    write(root, 'depth:\n  class: [1, 2, 3]\n');
    expect(existsSync(paths.configActive)).toBe(false);
    const first = await mm3(root, ['class', '-'], REQUEST);
    expect(first.exit).toBe(0);
    expect(first.text).toContain('config.yaml loaded automatically (first run after upgrade) → mm3 config --load to reload after edits');
    expect(existsSync(paths.configActive)).toBe(true);
    const second = await mm3(root, ['class', '-'], REQUEST);
    expect(second.exit).toBe(0);
    expect(second.text).not.toContain('loaded automatically');
  });

  it('free reads and dry runs write nothing: no active copy appears, and the file is still read as before', async () => {
    const { root, paths } = tempProject();
    write(root, 'depth:\n  class: [1, 2, 3]\n');
    expect((await mm3(root, ['class', '-', '--dry-run'], REQUEST)).exit).toBe(0); // the configured one-category request validates
    await mm3(root, ['config']);
    await mm3(root, ['doctor']);
    await mm3(root, ['view', 'src/user.ts']);
    await mm3(root, ['report', 'hits']);
    expect(existsSync(paths.configActive)).toBe(false);
  });

  it('a file with problems is not auto-loaded: nothing is written and the file is read as before', async () => {
    const { root, paths } = tempProject();
    write(root, 'depth:\n  class: [1, 2, 3]\nbudget:\n  usd: -1\n');
    const r = await mm3(root, ['class', '-'], REQUEST);
    expect(r.exit).toBe(0); // the good key still applies, as today
    expect(r.text).not.toContain('loaded automatically');
    expect(existsSync(paths.configActive)).toBe(false);
    expect((await mm3(root, ['config'])).text).toContain('✖ config.budget.usd');
  });

  it('after the one-time load, a later edit does not reach requests until --load', async () => {
    const { root } = tempProject();
    write(root, 'depth:\n  class: [1, 2, 3]\n');
    await mm3(root, ['class', '-'], REQUEST);
    write(root, 'depth:\n  class: [3, 6, 9]\n'); // edited, not loaded
    const r = await mm3(root, ['class', '-', '--dry-run'], REQUEST);
    expect(r.exit).toBe(0); // still the loaded [1, 2, 3]: the one-category request is still accepted
    await mm3(root, ['config', '--load']);
    const refused = await mm3(root, ['class', '-', '--dry-run'], REQUEST);
    expect(refused.exit).toBe(2);
    expect(refused.text).toContain('quick needs exactly 3');
  });
});

describe('the whole owner flow: --write, edit, doctor warns, --load, config shows it, a request uses it', () => {
  it('goes through every step on the one project', async () => {
    const { root } = tempProject();
    expect((await mm3(root, ['config', '--write'])).exit).toBe(0);
    expect((await mm3(root, ['doctor'])).text).toMatch(/✔ config: active/);

    const file = path.join(root, '.mm3', 'config.yaml');
    const edited = readFileSync(file, 'utf8').replace('#   class: [3, 6, 9]', '  class: [1, 2, 3]');
    expect(edited).not.toBe(readFileSync(file, 'utf8'));
    writeFileSync(file, edited);

    expect((await mm3(root, ['doctor'])).text).toContain('⚠ config.yaml changed since load → mm3 config --load');
    // not loaded yet: the one-category request is refused at the default 3
    expect((await mm3(root, ['class', '-', '--dry-run'], oneCategoryClass())).exit).toBe(2);

    const loaded = await mm3(root, ['config', '--load']);
    expect(loaded.text.split('\n')[0]).toBe('✔ valid · active · 1 changed from defaults');
    expect(loaded.text).toContain('depth.class: [3, 6, 9] → [1, 2, 3]');
    expect((await mm3(root, ['config'])).text).toContain('    class: [1, 2, 3]  # from config.yaml · 3, 6, 9 questions');
    expect((await mm3(root, ['doctor'])).text).toMatch(/✔ config: active/);

    const ran = await mm3(root, ['class', '-'], oneCategoryClass());
    expect(ran.exit).toBe(0);
    expect(readFileSync(file, 'utf8')).toBe(edited); // the user's file, comments and all, was never rewritten
  });
});

describe('mm3 config plain display stays a read', () => {
  it('runConfig writes nothing, even for a config.yaml that was never loaded', () => {
    const { root, paths } = tempProject();
    write(root, 'budget:\n  usd: 2\n');
    const r = runConfig({}, paths, '.');
    expect(r.text).toContain('⚠ config.yaml is not loaded yet → mm3 config --load');
    expect(existsSync(path.join(root, '.mm3', 'config.active.json'))).toBe(false);
  });
});
