// doctor (P5): free plumbing — never a call, never a spend, never a ledger write, and no key value ever prints.
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { expectCleanStop, mm3, snapshot } from '../../helpers/cli.ts';
import { tempProject } from '../../helpers/project.ts';

describe('mm3 doctor', () => {
  it('needs no project: works in a plain folder, reports "project: none", writes nothing', () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'mm3-no-project-'));
    const before = snapshot(root);
    const r = mm3(root, ['doctor'], { home: false });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('doctor:');
    expect(r.stdout).toContain('project: none');
    expect(snapshot(root)).toEqual(before);
  });

  it('a project is found: names it, still writes nothing', () => {
    const { root } = tempProject();
    const before = snapshot(root);
    const r = mm3(root, ['doctor']);
    expect(r.status).toBe(0);
    expect(r.stdout).not.toContain('project: none');
    expect(snapshot(root)).toEqual(before);
  });

  it('a key is set: never prints its value, even a distinctive one', () => {
    const { root } = tempProject();
    const key = 'sk-' + 'A'.repeat(24);
    const r = mm3(root, ['doctor'], { env: { MM3_PROVIDER: '', TYPESAFE_API_KEY: key } });
    expect(r.status).toBe(0);
    expect(r.stdout).not.toContain(key);
    expect(r.stdout).toContain('provider: typesafe');
    expect(r.stdout).toContain('key: yes · from env TYPESAFE_API_KEY');
  });

  it('no key: fake provider, "key: no"', () => {
    const { root } = tempProject();
    const r = mm3(root, ['doctor']);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('provider: fake');
    expect(r.stdout).toContain('key: no');
    expect(r.stdout).not.toContain('keys:');
  });

  it('a bad TYPESAFE_BASE_URL: exit 2, ✖ TYPESAFE_BASE_URL, nothing on stdout', () => {
    const { root } = tempProject();
    const stop = expectCleanStop(mm3(root, ['doctor'], { env: { MM3_PROVIDER: '', TYPESAFE_BASE_URL: 'http://example.com' } }), 2);
    expect(stop).toMatch(/^✖ TYPESAFE_BASE_URL:/);
  });

  // plan 2c B1b: doctor now takes 0 or 1 positional (the file to check, or - for stdin), so a SECOND positional
  // is what's now "extra" — one alone is a file to read, covered by the file/config/stdin tests below.
  it('extra arguments are refused with the doctor usage line', () => {
    const { root } = tempProject();
    const stop = expectCleanStop(mm3(root, ['doctor', 'one', 'two']), 2);
    expect(stop).toContain('mm3 doctor');
  });

  it('--help lists doctor', () => {
    const { root } = tempProject();
    expect(mm3(root, ['--help']).stdout).toContain('mm3 doctor');
  });

  // plan 2c B1b: `mm3 doctor <file|->` checks ONE document, no project needed at all.
  describe('doctor <file|-> [plan 2c B1b]', () => {
    it('a valid request file: exit 0, no project needed', () => {
      const root = mkdtempSync(path.join(os.tmpdir(), 'mm3-doctor-file-'));
      const reqPath = path.join(root, 'req.yaml');
      writeFileSync(reqPath, readFileSync('test/fixtures/requests/valid/class.yaml', 'utf8'));
      const r = mm3(root, ['doctor', reqPath], { home: false });
      expect(r.status).toBe(0);
      expect(r.stdout).toContain('✔ request: valid');
    });

    it('an invalid request file: exit 2, a ✖ field stop', () => {
      const root = mkdtempSync(path.join(os.tmpdir(), 'mm3-doctor-file-'));
      const reqPath = path.join(root, 'req.yaml');
      writeFileSync(reqPath, 'mak:\n  goal: x\n');
      const stop = expectCleanStop(mm3(root, ['doctor', reqPath], { home: false }), 2);
      expect(stop).toContain('✖ mak.goal:');
    });

    it('a config-shaped file: exit 0 when valid, no project needed', () => {
      const root = mkdtempSync(path.join(os.tmpdir(), 'mm3-doctor-file-'));
      const cfgPath = path.join(root, 'config.yaml');
      writeFileSync(cfgPath, 'budget:\n  usd: 10\n');
      const r = mm3(root, ['doctor', cfgPath], { home: false });
      expect(r.status).toBe(0);
      expect(r.stdout).toContain('✔ config: valid');
    });

    it('- reads stdin', () => {
      const root = mkdtempSync(path.join(os.tmpdir(), 'mm3-doctor-file-'));
      const r = mm3(root, ['doctor', '-'], { home: false, input: 'budget:\n  usd: 10\n' });
      expect(r.status).toBe(0);
      expect(r.stdout).toContain('✔ config: valid');
    });

    it('a missing file: a clean stop naming the path', () => {
      const root = mkdtempSync(path.join(os.tmpdir(), 'mm3-doctor-file-'));
      const stop = expectCleanStop(mm3(root, ['doctor', 'nope.yaml']), 2);
      expect(stop).toContain('not found');
    });
  });
});
