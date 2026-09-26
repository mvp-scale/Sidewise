// doctor: plumbing, not a verb (owner ruling, P5) — free (no call, no budget, no ledger write). Reports the
// resolved provider/route/base URL, whether a key is set (never its value), project/ledger location and the
// Node/node:sqlite runtime; exit 2 with a ✖ line when the config itself is invalid.
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { runDoctor } from '../../src/verbs/doctor.ts';
import { tempProject } from '../helpers/project.ts';

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
});
