// doctor (P5): free plumbing — never a call, never a spend, never a ledger write, and no key value ever prints.
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { expectCleanStop, sidewise, snapshot } from '../../helpers/cli.ts';
import { tempProject } from '../../helpers/project.ts';

describe('sidewise doctor', () => {
  it('needs no project: works in a plain folder, reports "project: none", writes nothing', () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'sidewise-no-project-'));
    const before = snapshot(root);
    const r = sidewise(root, ['doctor'], { home: false });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('doctor:');
    expect(r.stdout).toContain('project: none');
    expect(snapshot(root)).toEqual(before);
  });

  it('a project is found: names it, still writes nothing', () => {
    const { root } = tempProject();
    const before = snapshot(root);
    const r = sidewise(root, ['doctor']);
    expect(r.status).toBe(0);
    expect(r.stdout).not.toContain('project: none');
    expect(snapshot(root)).toEqual(before);
  });

  it('a key is set: never prints its value, even a distinctive one', () => {
    const { root } = tempProject();
    const key = 'sk-' + 'A'.repeat(24);
    const r = sidewise(root, ['doctor'], { env: { SIDEWISE_PROVIDER: '', TYPESAFE_API_KEY: key } });
    expect(r.status).toBe(0);
    expect(r.stdout).not.toContain(key);
    expect(r.stdout).toContain('provider: typesafe');
    expect(r.stdout).toContain('TYPESAFE_API_KEY: "yes"');
  });

  it('no key: fake provider, both keys "no"', () => {
    const { root } = tempProject();
    const r = sidewise(root, ['doctor']);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('provider: fake');
    expect(r.stdout).toContain('TYPESAFE_API_KEY: "no"');
    expect(r.stdout).toContain('AI_GATEWAY_API_KEY: "no"');
  });

  it('a bad SIDEWISE_BASE_URL: exit 2, ✖ SIDEWISE_BASE_URL, nothing on stdout', () => {
    const { root } = tempProject();
    const stop = expectCleanStop(sidewise(root, ['doctor'], { env: { SIDEWISE_PROVIDER: '', SIDEWISE_BASE_URL: 'http://example.com' } }), 2);
    expect(stop).toMatch(/^✖ SIDEWISE_BASE_URL:/);
  });

  it('extra arguments are refused with the doctor usage line', () => {
    const { root } = tempProject();
    const stop = expectCleanStop(sidewise(root, ['doctor', 'extra']), 2);
    expect(stop).toContain('sidewise doctor');
  });

  it('--help lists doctor', () => {
    const { root } = tempProject();
    expect(sidewise(root, ['--help']).stdout).toContain('sidewise doctor');
  });
});
