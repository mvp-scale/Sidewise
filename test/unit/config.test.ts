// config (plan 2c B1): loadConfig (src/config/load.ts's resolveConfig) reads .mm3/config.yaml if present,
// validates and sparse-merges it over DEFAULT_CONFIG, and labels each field's source (default/config/env).
// `mm3 config` (runConfig/formatConfig) prints the effective table; a broken file surfaces stops without
// hiding the rest. The classifier-side `fileConfig` threading (resolveJevConfig/selectProvider) must stay
// byte-for-byte backward compatible when omitted.
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createFakeAdapter } from '../../src/classifier/fake.ts';
import { selectProvider } from '../../src/classifier/select.ts';
import { resolveJevConfig } from '../../src/classifier/typesafe/config.ts';
import { classifierFileConfig, resolveConfig } from '../../src/config/load.ts';
import { DEFAULT_CONFIG } from '../../src/config/defaults.ts';
import { runConfig } from '../../src/config/config.ts';
import { tempProject } from '../helpers/project.ts';

describe('resolveConfig (loadConfig): no file, or paths undefined', () => {
  it('undefined paths: every value is the default, no stops', () => {
    const r = resolveConfig(undefined, {});
    expect(r.config).toEqual(DEFAULT_CONFIG);
    expect(r.stops).toEqual([]);
    expect(r.present).toBe(false);
    for (const key of ['budget.usd', 'provider', 'timeoutMs', 'requestMaxBytes']) {
      expect(r.sources[key] ?? 'default').toBe('default');
    }
  });

  it('a project with no config.yaml: defaults, no stops, never creates the file', () => {
    const { paths } = tempProject();
    const r = resolveConfig(paths, {});
    expect(r.config).toEqual(DEFAULT_CONFIG);
    expect(r.stops).toEqual([]);
    expect(r.present).toBe(false);
  });
});

describe('resolveConfig: a valid sparse config.yaml', () => {
  it('merges nested objects key-by-key, not object-replace', () => {
    const { paths } = tempProject();
    mkdirSync(paths.dir, { recursive: true });
    writeFileSync(paths.config, 'budget:\n  usd: 10\n');
    const r = resolveConfig(paths, {});
    expect(r.stops).toEqual([]);
    expect(r.config.budget.usd).toBe(10);
    // sibling defaults under the same nested object must survive an override of just one field.
    expect(r.config.budget.runs).toBe(DEFAULT_CONFIG.budget.runs);
    expect(r.config.budget.per).toBe(DEFAULT_CONFIG.budget.per);
    expect(r.sources['budget.usd']).toBe('config');
    expect(r.sources['budget.runs']).toBe('default');
    expect(r.present).toBe(true);
  });
});

describe('resolveConfig: a broken config.yaml', () => {
  it('a YAML syntax error surfaces one stop with a line number, defaults apply otherwise', () => {
    const { paths } = tempProject();
    mkdirSync(paths.dir, { recursive: true });
    writeFileSync(paths.config, 'budget:\n  usd: [\n');
    const r = resolveConfig(paths, {});
    expect(r.stops.length).toBeGreaterThan(0);
    expect(r.stops[0]!.text).toMatch(/✖ config: line \d+ of config\.yaml does not parse/);
    expect(r.config).toEqual(DEFAULT_CONFIG);
  });

  it('an invalid value validates to a stop but leaves the rest of the file applied', () => {
    const { paths } = tempProject();
    mkdirSync(paths.dir, { recursive: true });
    writeFileSync(paths.config, 'budget:\n  usd: -1\n  runs: 200\n');
    const r = resolveConfig(paths, {});
    expect(r.stops.some((s) => s.text.includes('budget.usd'))).toBe(true);
    expect(r.config.budget.runs).toBe(200); // the good sibling field still applied
    expect(r.config.budget.usd).toBe(DEFAULT_CONFIG.budget.usd); // the bad one falls back to default
  });
});

describe('resolveConfig: env beats config beats default', () => {
  // For these 4 fields, this module's config.<field> is a display value only (config-or-default, never env) —
  // load.ts's own header comment explains why: resolveJevConfig is the real routing authority and re-checks env
  // itself. What resolveConfig DOES do is label the source 'env' here, purely for mm3 config's printer.
  it('provider/baseURL/model/timeoutMs: env sets the source label; resolveJevConfig is where env actually wins', () => {
    const { paths } = tempProject();
    mkdirSync(paths.dir, { recursive: true });
    writeFileSync(paths.config, 'provider: typesafe\nmodel: jev-9.9.9\ntimeoutMs: 5000\n');
    const withConfigOnly = resolveConfig(paths, {});
    expect(withConfigOnly.config.model).toBe('jev-9.9.9');
    expect(withConfigOnly.sources.model).toBe('config');

    const withEnvToo = resolveConfig(paths, { JEV_MODEL: 'jev-1.2.3' });
    expect(withEnvToo.sources.model).toBe('env');
    // resolveJevConfig (the real routing authority) is where env actually wins for these 4 fields:
    expect(resolveJevConfig({ JEV_MODEL: 'jev-1.2.3' }, { fileConfig: classifierFileConfig(withEnvToo.config) }).model).toBe('jev-1.2.3');
  });

  it('a key with neither env nor config set stays default', () => {
    const r = resolveConfig(undefined, {});
    expect(r.sources.model).toBe('default');
    expect(r.config.model).toBe(DEFAULT_CONFIG.model);
  });
});

describe('mm3 config (runConfig): free, shows every key and its source', () => {
  it('no project: exit 0, every top-level key shown as default', () => {
    const r = runConfig({}, undefined, 'none');
    expect(r.exit).toBe(0);
    expect(r.text).toContain('config:');
    for (const key of ['budget', 'provider', 'baseURL', 'model', 'pricing', 'timeoutMs', 'retries', 'backoffMs', 'sweep', 'requestMaxBytes', 'reuse']) {
      expect(r.text, key).toContain(`${key}:`);
    }
    expect(r.text).toContain('# default');
    expect(r.text).not.toContain('undefined');
  });

  it('a broken config.yaml: stops shown, plus the rest of the effective table underneath', () => {
    const { paths } = tempProject();
    mkdirSync(paths.dir, { recursive: true });
    writeFileSync(paths.config, 'budget: [\n');
    const r = runConfig({}, paths, path.basename(paths.root));
    expect(r.exit).toBe(2);
    expect(r.text).toMatch(/✖ config: line \d+/);
    expect(r.text).toContain('config:'); // the effective table still prints underneath
  });
});

describe('resolveJevConfig / selectProvider: fileConfig is purely additive', () => {
  it('resolveJevConfig with no fileConfig behaves exactly as a bare call always has', () => {
    const before = resolveJevConfig({});
    const after = resolveJevConfig({}, {});
    expect(after).toEqual(before);
    expect(after.retries).toBeUndefined();
    expect(after.backoffMs).toBeUndefined();
  });

  it('fileConfig fills in model/baseURL/timeoutMs/retries/backoffMs only when env is silent', () => {
    const r = resolveJevConfig({}, { fileConfig: { model: 'jev-2.0.0', baseURL: 'https://proxy.example.com', timeoutMs: 9000, retries: 5, backoffMs: 250 } });
    expect(r.model).toBe('jev-2.0.0');
    expect(r.baseURL).toBe('https://proxy.example.com');
    expect(r.timeoutMs).toBe(9000);
    expect(r.retries).toBe(5);
    expect(r.backoffMs).toBe(250);
  });

  it('env still wins over fileConfig', () => {
    const r = resolveJevConfig({ JEV_MODEL: 'jev-1.13.0', MM3_BASE_URL: 'https://env.example.com' }, { fileConfig: { model: 'jev-2.0.0', baseURL: 'https://proxy.example.com' } });
    expect(r.model).toBe('jev-1.13.0');
    expect(r.baseURL).toBe('https://env.example.com');
  });

  it('selectProvider with no fileConfig behaves exactly as before (fake, no key)', () => {
    const provider = selectProvider({}, {});
    expect(provider.adapter).toBe(createFakeAdapter().adapter);
  });

  it('selectProvider: fileConfig.provider is the middle layer, env still wins', () => {
    expect(selectProvider({}, { fileConfig: { provider: 'fake' } }).adapter).toBe('fake');
    expect(selectProvider({ MM3_PROVIDER: 'fake' }, { fileConfig: { provider: 'chaos' } }).adapter).toBe('fake');
  });

  it('classifierFileConfig: reads straight off a resolved Mm3Config', () => {
    const resolved = resolveConfig(undefined, {});
    const fc = classifierFileConfig(resolved.config);
    expect(fc.timeoutMs).toBe(DEFAULT_CONFIG.timeoutMs);
    expect(fc.retries).toBe(DEFAULT_CONFIG.retries);
    expect(fc.backoffMs).toBe(DEFAULT_CONFIG.backoffMs);
    expect(fc.provider).toBeUndefined();
  });
});
