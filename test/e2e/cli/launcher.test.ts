// The plugin's `bin/mm3` launcher: Claude Code puts a plugin's bin/ on the Bash tool's PATH, and a file there is
// run by its own name, so `bin/mm3.mjs` alone would appear as `mm3.mjs`. The launcher is a thin script that runs the
// bundle sitting next to it, so the command is always the same version as the plugin that carries it.
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readFileSync, statSync, symlinkSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { cliEnv } from '../../helpers/cli.ts';
import { tempProject } from '../../helpers/project.ts';

const LAUNCHER = path.resolve('bin/mm3');
const BUNDLE = path.resolve('bin/mm3.mjs');
const VERSION = (JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }).version;

function run(file: string, args: string[], root?: string) {
  const r = spawnSync(file, args, { encoding: 'utf8', cwd: root, env: cliEnv(root) });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

describe('bin/mm3, the launcher the plugin puts on the Bash PATH', () => {
  it('is an executable script that starts with a shebang', () => {
    expect(statSync(LAUNCHER).mode & 0o111).not.toBe(0);
    expect(readFileSync(LAUNCHER, 'utf8').startsWith('#!/bin/sh')).toBe(true);
  });

  it('runs the bundle: --version is the package version', () => {
    const r = run(LAUNCHER, ['--version']);
    expect(r.status).toBe(0);
    expect(r.stdout.trim()).toBe(VERSION);
  });

  it('passes its arguments and exit code through: a removed command stops with exit 2 and a fix', () => {
    const { root } = tempProject();
    const r = run(LAUNCHER, ['budget', 'set', '--usd', '9'], root);
    expect(r.status).toBe(2);
    expect(r.stdout + r.stderr).toContain('✖ budget: set was removed');
  });

  it('works through a symlink on a PATH folder, still finding the bundle beside the real file', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'mm3-link-'));
    symlinkSync(LAUNCHER, path.join(dir, 'mm3'));
    const r = run(path.join(dir, 'mm3'), ['--version']);
    expect(r.status).toBe(0);
    expect(r.stdout.trim()).toBe(VERSION);
  });

  it('runs the bundle next to itself, so the command and the plugin can never differ in version', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'mm3-plugin-'));
    copyFileSync(LAUNCHER, path.join(dir, 'mm3'));
    spawnSync('chmod', ['+x', path.join(dir, 'mm3')]);
    copyFileSync(BUNDLE, path.join(dir, 'mm3.mjs'));
    const r = run(path.join(dir, 'mm3'), ['--version']);
    expect(r.status).toBe(0);
    expect(r.stdout.trim()).toBe(VERSION);
  });
});
