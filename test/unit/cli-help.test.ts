// sidewise <command> --help/-h works for every command (today only the bare "--help"/"-h" and
// template/help/agent/doctor worked this way; every other command's own parseArgs had no --help option, so it
// rejected it as an unknown flag). [C-179]
import { PassThrough } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { runCli, type CliCtx } from '../../src/cli.ts';

function fakeCtx(overrides: Partial<CliCtx> = {}): CliCtx {
  return {
    env: { SIDEWISE_PROVIDER: 'fake' },
    cwd: process.cwd(),
    platform: process.platform,
    runner: () => ({ status: 1, stdout: '', stderr: 'not used' }),
    packageDir: process.cwd(),
    pkg: { name: '@mvpscale/sidewise', version: '9.9.9-test' },
    homeDir: '/nonexistent-home',
    nodeVersion: process.version,
    stdin: () => Buffer.from(''),
    io: { input: new PassThrough(), output: new PassThrough() },
    ...overrides,
  };
}

describe('sidewise <command> --help/-h [C-179]', () => {
  it('a verb gets its usage line plus a "see more" pointer to help/agent', async () => {
    const ctx = fakeCtx();
    for (const flag of ['--help', '-h']) {
      const r = await runCli(['class', flag], ctx);
      expect(r.exit).toBe(0);
      expect(r.text).toBe('sidewise class <request-file | -> [--dry-run]\n→ see: sidewise help class · sidewise agent class\n');
    }
    const drill = await runCli(['drill', '--help'], ctx);
    expect(drill.text).toContain('sidewise drill <request-file');
    expect(drill.text).toContain('→ see: sidewise help drill · sidewise agent drill');
  });

  it('a non-verb command gets just its usage line, no "see more" pointer to a page that doesn\'t exist', async () => {
    const ctx = fakeCtx();
    const cases: Array<[string, string]> = [
      ['doctor', 'sidewise doctor'],
      ['budget', 'sidewise budget [show | reset | set --usd <n> --runs <n>]'],
      ['init', 'sidewise init'],
      ['mcp', 'sidewise mcp'],
      ['outcome', 'sidewise outcome <SW-####> held|overruled|failed --by <actor>'],
      ['uninstall', 'sidewise uninstall'],
      ['template', 'sidewise template'],
      ['report', 'sidewise report'],
      ['help', 'sidewise help'],
      ['agent', 'sidewise agent'],
    ];
    for (const [command, startsWith] of cases) {
      const r = await runCli([command, '--help'], ctx);
      expect(r.exit, `${command} --help exit`).toBe(0);
      expect(r.text.startsWith(startsWith), `${command} --help text: ${r.text}`).toBe(true);
      expect(r.text, `${command} --help should have no see-more pointer`).not.toContain('→ see:');
    }
  });

  it('exits 0 for "doctor --help" even on a too-old Node (free, like doctor itself)', async () => {
    const r = await runCli(['doctor', '--help'], fakeCtx({ nodeVersion: 'v20.11.0' }));
    expect(r).toEqual({ exit: 0, text: 'sidewise doctor [<file> | -]\n' });
  });

  it('a genuinely unknown flag is still rejected as before (only --help/-h are special-cased)', async () => {
    const r = await runCli(['doctor', '--bogus'], fakeCtx());
    expect(r.exit).toBe(2);
    expect(r.text).toContain('✖ args: unknown flag --bogus');
  });
});
