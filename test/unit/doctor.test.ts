// doctor: plumbing, not a verb (owner ruling, P5) — free (no call, no budget, no ledger write). Reports the
// resolved provider/route/base URL, whether a key is set (never its value), project/ledger location and the
// Node/node:sqlite runtime; exit 2 with a ✖ line when the config itself is invalid.
import { mkdtempSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { envFilePath, setEnvFileValue } from '../../src/setup/env-file.ts';
import { writeInstallRecord } from '../../src/setup/install-record.ts';
import type { RunResult, Runner } from '../../src/setup/runner.ts';
import { runDoctor, runDoctorFile } from '../../src/verbs/doctor.ts';
import { tempProject } from '../helpers/project.ts';

function tmpXdg(): { XDG_CONFIG_HOME: string } {
  return { XDG_CONFIG_HOME: mkdtempSync(path.join(os.tmpdir(), 'sidewise-doctor-')) };
}

describe('doctor (P5)', () => {
  it('no key, no project: the fake provider, "key: no", project "none"', () => {
    const r = runDoctor({}, undefined, 'v22.13.0');
    expect(r.exit).toBe(0);
    expect(r.text).toContain('doctor:');
    expect(r.text).toContain('provider: fake');
    expect(r.text).toContain('route: fake');
    expect(r.text).toContain('key: no');
    expect(r.text).not.toContain('keys:'); // the old TYPESAFE_API_KEY/AI_GATEWAY_API_KEY map is gone — key: covers it
    expect(r.text).toContain('project: none');
    expect(r.text).toContain('node: v22.13.0');
    expect(r.text).not.toContain('baseURL');
    expect(r.text).toContain('actor: agent (default) → set SIDEWISE_ACTOR to change');
  });

  // Fix #18: every run/outcome defaults to `by: agent`; doctor shows what will actually be used, so the
  // resolved value (SIDEWISE_ACTOR, set for real MCP calls by cli.ts's mcp wiring — see src/mcp/actor.ts) is
  // visible without a paid run. [C-143]
  it('actor: shows a set SIDEWISE_ACTOR verbatim', () => {
    const r = runDoctor({ SIDEWISE_ACTOR: 'corey' }, undefined, 'v22.13.0');
    expect(r.text).toContain('actor: corey');
  });

  it('actor: blank/whitespace-only SIDEWISE_ACTOR reads as unset, same as pay.ts\'s own actorOf', () => {
    const r = runDoctor({ SIDEWISE_ACTOR: '   ' }, undefined, 'v22.13.0');
    expect(r.text).toContain('actor: agent (default) → set SIDEWISE_ACTOR to change');
  });

  it('a direct key: shows the route and base URL, never the key value', () => {
    const key = 'sk-' + 'A'.repeat(24);
    const r = runDoctor({ TYPESAFE_API_KEY: key }, undefined);
    expect(r.exit).toBe(0);
    expect(r.text).not.toContain(key);
    expect(r.text).toContain('provider: typesafe');
    expect(r.text).toContain('route: direct');
    expect(r.text).toContain('baseURL: https://api.typesafe.ai');
    expect(r.text).toContain('key: yes · from env TYPESAFE_API_KEY');
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

  it('a project is found: names its root, not "none", and says whether the plugin is enabled here [C-102]', () => {
    const { paths } = tempProject({});
    const r = runDoctor({}, paths);
    expect(r.exit).toBe(0);
    expect(r.text).not.toContain('project: none');
    // Quoted: the value contains ": " (from "plugin enabled here:"), which emit()'s scalar() always quotes.
    expect(r.text).toContain(`project: "${path.relative(process.cwd(), paths.root)} · plugin enabled here: no"`);
  });

  it('"plugin enabled here" is yes when the plugin is installed at project scope [C-102]', () => {
    const { paths } = tempProject({});
    const runner: Runner = (): RunResult => ({ status: 0, stdout: JSON.stringify([{ name: 'sidewise', scope: 'project' }]), stderr: '' });
    const r = runDoctor({}, paths, undefined, { runner });
    expect(r.text).toContain('plugin enabled here: yes');
  });

  it('"plugin enabled here" is also yes for a user-scope install — it applies to every project [C-102]', () => {
    const { paths } = tempProject({});
    const runner: Runner = (): RunResult => ({ status: 0, stdout: JSON.stringify([{ name: 'sidewise', scope: 'user' }]), stderr: '' });
    const r = runDoctor({}, paths, undefined, { runner });
    expect(r.text).toContain('plugin enabled here: yes');
  });

  it('"plugin enabled here" is also yes for a local-scope install (best-effort: no per-entry project path to match against) [C-102]', () => {
    const { paths } = tempProject({});
    const runner: Runner = (): RunResult => ({ status: 0, stdout: JSON.stringify([{ name: 'sidewise', scope: 'local' }]), stderr: '' });
    const r = runDoctor({}, paths, undefined, { runner });
    expect(r.text).toContain('plugin enabled here: yes');
  });

  it('"plugin enabled here" is no when nothing is installed at any scope [C-102]', () => {
    const { paths } = tempProject({});
    const runner: Runner = (): RunResult => ({ status: 0, stdout: '[]', stderr: '' });
    const r = runDoctor({}, paths, undefined, { runner });
    expect(r.text).toContain('plugin enabled here: no');
  });

  it('reports whether node:sqlite is available on this (new-enough) runtime', () => {
    const r = runDoctor({}, undefined);
    expect(r.text).toMatch(/index: (node:sqlite|unavailable \(unexpected on Node 22\.13\+\))/);
  });

  describe('the Node ≥ 22.13 guard (owner ruling) [C-106]', () => {
    it('too old a Node: doctor still runs (exit 2, not a bare stop) and names it in node:/index:', () => {
      const r = runDoctor({}, undefined, 'v20.11.0');
      expect(r.exit).toBe(2);
      expect(r.text).toContain('doctor:'); // the full doc still renders — never just a bare ✖ line
      expect(r.text).toContain('node: v20.11.0 ✖ too old → install Node 22.13+');
      expect(r.text).toContain('index: none (needs Node 22.13+)');
    });

    it('exactly 22.13.0 is new enough: exit 0, plain node value, no ✖', () => {
      const r = runDoctor({}, undefined, 'v22.13.0');
      expect(r.exit).toBe(0);
      expect(r.text).toContain('node: v22.13.0');
      expect(r.text).not.toContain('✖ too old');
    });

    it('22.12.x is still too old — the minor version is a real cutoff, not just the major', () => {
      const r = runDoctor({}, undefined, 'v22.12.9');
      expect(r.exit).toBe(2);
      expect(r.text).toContain('✖ too old');
    });

    it('a newer major (e.g. v24) is always new enough', () => {
      const r = runDoctor({}, undefined, 'v24.0.0');
      expect(r.exit).toBe(0);
      expect(r.text).not.toContain('✖ too old');
    });
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

    // [C-190] Inside the plugin's own bundled MCP server (CLAUDE_PLUGIN_ROOT set), "sidewise init" isn't
    // reachable from here, so the hint points at the config dialog instead.
    it('no key, inside the plugin (CLAUDE_PLUGIN_ROOT set): points at /plugin → Sidewise → Configure', () => {
      const r = runDoctor({ CLAUDE_PLUGIN_ROOT: '/plugins/sidewise' }, undefined);
      expect(r.text).toContain(
        'key: none (sample answers only) → /plugin → Sidewise → Configure → press Enter on "TypeSafe API key", paste, Enter, Save configuration',
      );
      expect(r.text).not.toContain('run "sidewise init" to add one');
    });

    it('no key, CLAUDE_PLUGIN_ROOT blank: still the terminal hint, not the plugin one', () => {
      const r = runDoctor({ CLAUDE_PLUGIN_ROOT: '' }, undefined);
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

    it('a keychain-resolved key: the exact literal line, and provider/route follow it too', () => {
      const r = runDoctor({}, undefined, undefined, { resolveStored: () => ({ apiKey: 'kc-key', source: 'keychain', provider: 'typesafe' }) });
      expect(r.text).toContain('key: yes · from OS keychain (encrypted, per user)');
      expect(r.text).toContain('provider: typesafe');
      expect(r.text).not.toContain('kc-key');
    });

    it('a file-resolved key: names the exact path and its mode', () => {
      const env = tmpXdg();
      const file = envFilePath(env);
      setEnvFileValue(file, 'TYPESAFE_API_KEY', 'file-key');
      const r = runDoctor(env, undefined, undefined, { resolveStored: () => ({ apiKey: 'file-key', source: 'file', provider: 'typesafe' }) });
      expect(r.text).toContain(`key: yes · from user file ${file} (0600, not encrypted)`);
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

    it('plugin: user scope ONLY nudges toward project scope — using Sidewise is per project [C-177]', () => {
      const runner: Runner = (): RunResult => ({ status: 0, stdout: JSON.stringify([{ name: 'sidewise', scope: 'user' }]), stderr: '' });
      const r = runDoctor({}, undefined, undefined, { runner });
      expect(r.text).toContain('plugin: sidewise@mvp-scale · user scope (every project) → for just this one, "sidewise init --scope project"');
    });

    it('plugin: project scope present → no user-only nudge', () => {
      const runner: Runner = (): RunResult => ({ status: 0, stdout: JSON.stringify([{ name: 'sidewise', scope: 'project' }]), stderr: '' });
      const r = runDoctor({}, undefined, undefined, { runner });
      expect(r.text).toContain('plugin: sidewise@mvp-scale · project scope');
      expect(r.text).not.toContain('sidewise init --scope project');
    });
  });

  // plan 2c B1b: bare `sidewise doctor` also validates .sidewise/config.yaml when present.
  describe('the config: field [plan 2c B1b]', () => {
    it('no project at all: config: defaults', () => {
      const r = runDoctor({}, undefined);
      expect(r.text).toContain('config: "✔ config: defaults"');
    });

    it('a project with no config.yaml: config: defaults', () => {
      const { paths } = tempProject({});
      const r = runDoctor({}, paths);
      expect(r.text).toContain('config: "✔ config: defaults"');
    });

    it('a clean override file: config: N overrides', () => {
      const { paths } = tempProject({ '.sidewise/config.yaml': 'budget:\n  usd: 10\nprovider: fake\n' });
      const r = runDoctor({}, paths);
      expect(r.text).toContain('config: "✔ config: 2 overrides"');
    });

    it('a broken config.yaml: every problem in one pass, same ✖ config.<path> shape sidewise config uses', () => {
      const { paths } = tempProject({ '.sidewise/config.yaml': 'budget:\n  usd: -1\nnope: true\n' });
      const r = runDoctor({}, paths);
      expect(r.exit).toBe(0); // a bad config.yaml is reported, not fatal to the rest of the doctor report
      expect(r.text).toContain('✖ config.budget.usd:');
      expect(r.text).toContain('✖ config.nope:');
    });
  });
});

const VALID_CLASS_REQUEST = readFileSync('test/fixtures/requests/valid/class.yaml', 'utf8');

describe('runDoctorFile [plan 2c B1b]', () => {
  it('a request-shaped document (side:) is checked the same way --dry-run would', () => {
    const r = runDoctorFile(VALID_CLASS_REQUEST);
    expect(r.exit).toBe(0);
    expect(r.text).toBe('✔ request: valid → checked as class');
  });

  it('an explicit side.verb is honored over the class default', () => {
    const r = runDoctorFile('side:\n  goal: verify the fix\n  parent: SW-0001\n  compare: {before: a, after: b}\n  expect: none\n  verb: replay\n');
    expect(r.exit).toBe(0);
    expect(r.text).toBe('✔ request: valid → checked as replay');
  });

  it('an invalid request: the same ✖ field: problem → fix shape, pointed at the inferred verb\'s own agent card', () => {
    const r = runDoctorFile('side:\n  goal: x\n');
    expect(r.exit).toBe(2);
    expect(r.text).toContain('✖ side.goal:');
    // loadRequest's own stopText points at the verb it validated against (class, the fallback here) — the
    // same pointer every other class-verb stop gets, not a doctor-specific one.
    expect(r.text).toContain('→ see: sidewise agent class');
  });

  it('never touches the ledger/reuse/budget: a valid request with no project at all still just validates', () => {
    // no project/ledger exists at all here — if this reached ledger lookups it would throw, not stop cleanly.
    const r = runDoctorFile(VALID_CLASS_REQUEST);
    expect(r.exit).toBe(0);
  });

  it('anything without a top-level side: is checked as a config file', () => {
    const r = runDoctorFile('budget:\n  usd: 10\n');
    expect(r).toEqual({ exit: 0, text: '✔ config: valid' });
  });

  it('a bad config file: every problem in one pass', () => {
    const r = runDoctorFile('budget:\n  usd: -1\nnope: true\n');
    expect(r.exit).toBe(2);
    expect(r.text).toContain('✖ config.budget.usd:');
    expect(r.text).toContain('✖ config.nope:');
    expect(r.text).toContain('→ see: sidewise agent doctor');
  });

  it('a YAML syntax error in a config-shaped file: the line number, not a crash', () => {
    const r = runDoctorFile('budget:\n  usd: [1, 2\n');
    expect(r.exit).toBe(2);
    expect(r.text).toMatch(/✖ config: line \d+ does not parse/);
  });

  it('an empty document is valid config (nothing to override)', () => {
    const r = runDoctorFile('');
    expect(r).toEqual({ exit: 0, text: '✔ config: valid' });
  });
});
