// mm3 --version/-v: prints the installed package's version, one line, exit 0 — free, no project needed,
// no Node-version gate (same free standing as the bare --help/-h). [C-178]
import { PassThrough } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { runCli, type CliCtx } from '../../src/cli.ts';

function fakeCtx(overrides: Partial<CliCtx> = {}): CliCtx {
  return {
    env: { MM3_PROVIDER: 'fake' },
    cwd: process.cwd(),
    platform: process.platform,
    runner: () => ({ status: 1, stdout: '', stderr: 'not used' }),
    packageDir: process.cwd(),
    pkg: { name: '@mvpscale/mm3', version: '9.9.9-test' },
    homeDir: '/nonexistent-home',
    nodeVersion: process.version,
    stdin: () => Buffer.from(''),
    io: { input: new PassThrough(), output: new PassThrough() },
    ...overrides,
  };
}

describe('mm3 --version / -v [C-178]', () => {
  it('prints the package version, one line, exit 0', async () => {
    const ctx = fakeCtx();
    for (const flag of ['--version', '-v']) {
      const r = await runCli([flag], ctx);
      expect(r).toEqual({ exit: 0, text: '9.9.9-test\n' });
    }
  });

  it('works even on a too-old Node (free, like the bare --help/-h)', async () => {
    const r = await runCli(['--version'], fakeCtx({ nodeVersion: 'v20.11.0' }));
    expect(r).toEqual({ exit: 0, text: '9.9.9-test\n' });
  });
});
