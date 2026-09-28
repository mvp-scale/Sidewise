// Item H (batch G), controller-verified bug: doctor/agent already look past env into the OS keychain / user
// file (setup/keystore.ts's resolveStoredKey), but cli.ts's own selectProvider calls (class/scan/drill/loop and
// change) never passed that lookup along, and providerIdentity (the route/adapter shown in --dry-run and stored
// on the ledger run) took only `env` at all, in every verb (class/change/loop/scan/drill/view) — so a key found
// only in the keychain or ~/.config/sidewise/env silently behaved as "no key" everywhere but `doctor`/`agent`:
// `doctor` reported `key: yes`, but a real run fell back to the fake provider, unlabelled as such in --dry-run's
// `route:` line. Fixed by threading one `resolveStoredFor(ctx)` helper into every `selectProvider`/
// `providerIdentity` call site cli.ts makes, and a new `VerbContext`/`ViewContext` field so every verb's own
// `providerIdentity(ctx.env)` call can see the same stored key `ctx.provider` was already built from. [C-203]
import { PassThrough } from 'node:stream';
import { mkdirSync, mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { runCli, type CliCtx } from '../../src/cli.ts';
import { tempProject } from '../helpers/project.ts';

// Isolates every case from whatever this actual machine has stored at the real ~/.config/sidewise/env — the
// keystore's own file fallback (setup/env-file.ts's sidewiseConfigDir) reads os.homedir() directly, not
// CliCtx.homeDir, so only XDG_CONFIG_HOME (which it does honor) can point it somewhere empty and disposable.
const isolatedConfigDir = mkdtempSync(path.join(os.tmpdir(), 'sidewise-xdg-'));

function fakeCtx(overrides: Partial<CliCtx> = {}): CliCtx {
  const { env: envOverride, ...rest } = overrides;
  return {
    env: { XDG_CONFIG_HOME: isolatedConfigDir, ...envOverride },
    cwd: process.cwd(),
    platform: 'linux',
    runner: () => ({ status: 1, stdout: '', stderr: '' }), // no keychain hit by default
    packageDir: process.cwd(),
    pkg: { name: '@mvpscale/sidewise', version: '9.9.9-test' },
    homeDir: '/nonexistent-home',
    nodeVersion: process.version,
    stdin: () => Buffer.from(''),
    io: { input: new PassThrough(), output: new PassThrough() },
    ...rest,
  };
}

const classReq =
  'side:\n  goal: check this code\n  depth: quick\n  where: [src/a.ts]\n  ask:\n    injection:\n      pass: no\n' +
  Array.from({ length: 10 }, (_, i) => `      ${i + 1}: is question ${i + 1} true?\n`).join('');

function project(): string {
  const { root } = tempProject({ 'src/a.ts': 'x' });
  mkdirSync(path.join(root, '.sidewise'), { recursive: true }); // findRoot needs a marker; no real ledger writes here (dry-run)
  return root;
}

describe('a stored key (no env var) is found the same way everywhere [item H] [C-203]', () => {
  it('class --dry-run: env has no key, the keychain does -> route: direct (typesafe), never silently fake', async () => {
    const root = project();
    const ctx = fakeCtx({
      cwd: root,
      env: {},
      platform: 'linux',
      runner: () => ({ status: 0, stdout: 'a-stored-typesafe-key\n', stderr: '' }),
    });
    const r = await runCli(['class', '-', '--dry-run'], { ...ctx, stdin: () => Buffer.from(classReq) });
    expect(r.exit, r.text).toBe(0);
    expect(r.text).toContain('route: direct');
    expect(r.text).not.toContain('route: fake');
  });

  it('an env key still wins over a stored one (SIDEWISE_PROVIDER=fake beats a keychain hit)', async () => {
    const root = project();
    const ctx = fakeCtx({
      cwd: root,
      env: { SIDEWISE_PROVIDER: 'fake' },
      platform: 'linux',
      runner: () => ({ status: 0, stdout: 'a-stored-typesafe-key\n', stderr: '' }),
    });
    const r = await runCli(['class', '-', '--dry-run'], { ...ctx, stdin: () => Buffer.from(classReq) });
    expect(r.exit, r.text).toBe(0);
    expect(r.text).toContain('route: fake');
  });

  it('no key anywhere (env empty, keychain misses): still the fake route, unchanged', async () => {
    const root = project();
    const ctx = fakeCtx({ cwd: root, env: {}, platform: 'linux', runner: () => ({ status: 1, stdout: '', stderr: '' }) });
    const r = await runCli(['class', '-', '--dry-run'], { ...ctx, stdin: () => Buffer.from(classReq) });
    expect(r.exit, r.text).toBe(0);
    expect(r.text).toContain('route: fake');
  });
});
