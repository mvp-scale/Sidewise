// doctor: plumbing, not a verb (owner ruling, P5) — free (no call, no budget, no ledger write). Reports the
// resolved provider/route/base URL, whether a key is set (never its value), project/ledger location and the
// Node/node:sqlite runtime; exit 2 with a ✖ line when the config itself is invalid.
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { credentialsPath, writeCredentialsFile } from '../../src/setup/keystore.ts';
import { writeInstallRecord } from '../../src/setup/install-record.ts';
import type { RunResult, Runner } from '../../src/setup/runner.ts';
import { runDoctor } from '../../src/verbs/doctor.ts';
import { tempProject } from '../helpers/project.ts';

function tmpXdg(): { XDG_CONFIG_HOME: string } {
  return { XDG_CONFIG_HOME: mkdtempSync(path.join(os.tmpdir(), 'sidewise-doctor-')) };
}

describe('doctor (P5)', () => {
  it('no key, no project: the fake provider, both keys "no", project "none"', () => {
    const r = runDoctor({}, undefined, 'v20.11.0');
    expect(r.exit).toBe(0);
    expect(r.text).toContain('doctor:');
    expect(r.text).toContain('provider: fake');
    expect(r.text).toContain('route: fake');
    expect(r.text).toContain('TYPESAFE_API_KEY: "no"');
    expect(r.text).toContain('AI_GATEWAY_API_KEY: "no"');
    expect(r.text).toContain('project: none');
    expect(r.text).toContain('node: v20.11.0');
    expect(r.text).not.toContain('baseURL');
  });

  it('a direct key: shows the route and base URL, never the key value', () => {
    const key = 'sk-' + 'A'.repeat(24);
    const r = runDoctor({ TYPESAFE_API_KEY: key }, undefined);
    expect(r.exit).toBe(0);
    expect(r.text).not.toContain(key);
    expect(r.text).toContain('provider: typesafe');
    expect(r.text).toContain('route: direct');
    expect(r.text).toContain('baseURL: https://api.typesafe.ai');
    expect(r.text).toContain('TYPESAFE_API_KEY: "yes"');
    expect(r.text).toContain('AI_GATEWAY_API_KEY: "no"');
  });

  it('the gateway route also shows the wire model', () => {
    const r = runDoctor({ AI_GATEWAY_API_KEY: 'g' }, undefined);
    expect(r.exit).toBe(0);
    expect(r.text).toContain('route: gateway');
    expect(r.text).toContain('baseURL: https://ai-gateway.vercel.sh/typesafe');
    expect(r.text).toContain('wireModel: typesafe-ai/jev');
  });

  it('SIDEWISE_PROVIDER=chaos names chaos, no base URL', () => {
    const r = runDoctor({ SIDEWISE_PROVIDER: 'chaos' }, undefined);
    expect(r.text).toContain('provider: chaos');
    expect(r.text).toContain('route: chaos');
    expect(r.text).not.toContain('baseURL');
  });

  it('a project is found: names its root, not "none"', () => {
    const { paths } = tempProject({});
    const r = runDoctor({}, paths);
    expect(r.exit).toBe(0);
    expect(r.text).not.toContain('project: none');
    expect(r.text).toContain(`project: ${path.relative(process.cwd(), paths.root)}`);
  });

  it('reports whether node:sqlite (vs. the linear fallback) is available on this runtime', () => {
    const r = runDoctor({}, undefined);
    expect(r.text).toMatch(/index: (node:sqlite|linear fallback)/);
  });

  it('a floating JEV_MODEL: exit 2, the same ✖ message a paid verb would give', () => {
    const r = runDoctor({ JEV_MODEL: 'jev-latest' }, undefined);
    expect(r.exit).toBe(2);
    expect(r.text).toMatch(/^JEV_MODEL="jev-latest" floats/);
  });

  it('a bad SIDEWISE_BASE_URL: exit 2, ✖ SIDEWISE_BASE_URL [C-095]', () => {
    const r = runDoctor({ SIDEWISE_BASE_URL: 'http://example.com' }, undefined);
    expect(r.exit).toBe(2);
    expect(r.text).toMatch(/^✖ SIDEWISE_BASE_URL:/);
  });

  it('never leaks a key substring, even alongside an invalid config [C-095]', () => {
    const key = 'sk-' + 'B'.repeat(24);
    const ok = runDoctor({ AI_GATEWAY_API_KEY: key }, undefined);
    expect(ok.text).not.toContain(key);
    const bad = runDoctor({ AI_GATEWAY_API_KEY: key, JEV_MODEL: 'jev-latest' }, undefined);
    expect(bad.text).not.toContain(key);
  });

  describe('the key/cli/plugin lines [C-098]', () => {
    it('no key anywhere: the exact "run sidewise init" line', () => {
      const r = runDoctor({}, undefined);
      expect(r.text).toContain('key: no  → run "sidewise init" to add one');
    });

    it('an env key, with no deps.resolveStored injected: named by its env var, no "(overrides stored)"', () => {
      const key = 'sk-' + 'C'.repeat(24);
      const r = runDoctor({ TYPESAFE_API_KEY: key }, undefined);
      expect(r.text).toContain('key: yes · from env TYPESAFE_API_KEY');
      expect(r.text).not.toContain('overrides stored');
      expect(r.text).not.toContain(key);
    });

    it('an env key that also has a stored key underneath it: "(overrides stored)"', () => {
      const key = 'sk-' + 'D'.repeat(24);
      const r = runDoctor({ AI_GATEWAY_API_KEY: key }, undefined, undefined, {
        resolveStored: () => ({ apiKey: 'stored-elsewhere', source: 'file', provider: 'typesafe' }),
      });
      expect(r.text).toContain('key: yes · from env AI_GATEWAY_API_KEY (overrides stored)');
    });

    it('a keychain-resolved key: the exact literal line (quoted, since it contains ": "), and provider/route follow it too', () => {
      const r = runDoctor({}, undefined, undefined, { resolveStored: () => ({ apiKey: 'kc-key', source: 'keychain', provider: 'typesafe' }) });
      expect(r.text).toContain('key: "yes · from OS keychain            (lookup: env → keychain → file)"');
      expect(r.text).toContain('provider: typesafe');
      expect(r.text).not.toContain('kc-key');
    });

    it('a file-resolved key: names the exact path and its mode', () => {
      const env = tmpXdg();
      const file = credentialsPath(env);
      writeCredentialsFile(file, { typesafe: 'file-key' });
      const r = runDoctor(env, undefined, undefined, { resolveStored: () => ({ apiKey: 'file-key', source: 'file', provider: 'typesafe' }) });
      expect(r.text).toContain(`key: yes · from user file ${file} (0600)`);
      expect(r.text).not.toContain('file-key');
    });

    it('cli: names install.json\'s mode and prefix when a record exists', () => {
      const env = tmpXdg();
      writeInstallRecord(env, { mode: 'user', npmPrefix: '/opt/u/.local', installedAt: '2026-09-27T00:00:00Z' });
      const r = runDoctor(env, undefined);
      expect(r.text).toMatch(/cli: .* · installed --user \(npm prefix \/opt\/u\/\.local\)/);
    });

    it('cli: no PATH match and no install record → the exact stop-and-fix line', () => {
      const r = runDoctor({ PATH: '/does/not/exist' }, undefined);
      expect(r.text).toContain('cli: not on PATH → run "sidewise init" to install it');
    });

    it('plugin: with no deps.runner injected, always reads as not installed (never spawns claude for real)', () => {
      const r = runDoctor({}, undefined);
      expect(r.text).toContain('plugin: not installed → "sidewise init --claude"');
    });

    it('plugin: installed, named scope, through an injected runner', () => {
      const runner: Runner = (): RunResult => ({ status: 0, stdout: JSON.stringify([{ name: 'sidewise', scope: 'user' }]), stderr: '' });
      const r = runDoctor({}, undefined, undefined, { runner });
      expect(r.text).toContain('plugin: sidewise@mvp-scale · user scope');
    });
  });
});
