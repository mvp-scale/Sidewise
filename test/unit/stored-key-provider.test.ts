// Item H (batch G), controller-verified bug: doctor/agent already look past env into the OS keychain / user
// file (setup/keystore.ts's resolveStoredKey), but cli.ts's own selectProvider calls (class/scan/drill/loop and
// replay) never passed that lookup along, and providerIdentity (the route/adapter shown in --dry-run and stored
// on the ledger run) took only `env` at all, in every verb (class/replay/loop/scan/drill/view) — so a key found
// only in the keychain or ~/.config/mm3/env silently behaved as "no key" everywhere but `doctor`/`agent`:
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

// Isolates every case from whatever this actual machine has stored at the real ~/.config/mm3/env — the
// keystore's own file fallback (setup/env-file.ts's mm3ConfigDir) reads os.homedir() directly, not
// CliCtx.homeDir, so only XDG_CONFIG_HOME (which it does honor) can point it somewhere empty and disposable.
const isolatedConfigDir = mkdtempSync(path.join(os.tmpdir(), 'mm3-xdg-'));

function fakeCtx(overrides: Partial<CliCtx> = {}): CliCtx {
  const { env: envOverride, ...rest } = overrides;
  return {
    env: { XDG_CONFIG_HOME: isolatedConfigDir, ...envOverride },
    cwd: process.cwd(),
    platform: 'linux',
    runner: () => ({ status: 1, stdout: '', stderr: '' }), // no keychain hit by default
    packageDir: process.cwd(),
    pkg: { name: '@mvpscale/mm3', version: '9.9.9-test' },
    homeDir: '/nonexistent-home',
    nodeVersion: process.version,
    stdin: () => Buffer.from(''),
    io: { input: new PassThrough(), output: new PassThrough() },
    ...rest,
  };
}

// A full, valid quick-depth ask (3 concerns categories x 3 probes + 2 decisions) — the exact request
// shape doesn't matter for this file's own assertions (key resolution / route selection), only that it validates.
const classReq =
  'mak:\n  goal: check this code\n  depth: quick\n  where: [src/a.ts]\n' +
  '  ask:\n    concerns:\n      injection:\n        pass: no\n        1: q1?\n        2: q2?\n        3: q3?\n      access:\n        pass: no\n        4: q4?\n        5: q5?\n        6: q6?\n      leaks:\n        pass: no\n        7: q7?\n        8: q8?\n        9: q9?\n    decisions:\n      severity:\n        pass: [none, low]\n        10:\n          scale: How bad?\n          levels: [none, low, high]\n      route:\n        pass: [ship]\n        11:\n          choice: Where to?\n          options: [ship, block]\n';

function project(): string {
  const { root } = tempProject({ 'src/a.ts': 'x' });
  mkdirSync(path.join(root, '.mm3'), { recursive: true }); // findRoot needs a marker; no real ledger writes here (dry-run)
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

  it('an env key still wins over a stored one (MM3_PROVIDER=fake beats a keychain hit)', async () => {
    const root = project();
    const ctx = fakeCtx({
      cwd: root,
      env: { MM3_PROVIDER: 'fake' },
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
