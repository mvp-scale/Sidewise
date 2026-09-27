// fix #18: a real actor for MCP-driven runs — git's own user.name, or "claude" when there is none (no repo,
// no git binary, unset config). cli.ts's mcp wiring calls this per tools/call, only when SIDEWISE_ACTOR isn't
// already set — an explicit value always wins over a guess. [C-143]
import type { SpawnSyncReturns } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { resolveMcpActor } from '../../src/mcp/actor.ts';

function result(status: number, stdout: string): SpawnSyncReturns<string> {
  return { status, stdout, stderr: '', pid: 0, output: [null, stdout, ''], signal: null };
}

describe('resolveMcpActor', () => {
  it('trims and returns git config user.name when it succeeds', () => {
    const spawn = () => result(0, 'Corey Gorman\n');
    expect(resolveMcpActor('/some/project', spawn as never)).toBe('Corey Gorman');
  });

  it('falls back to "claude" when git exits nonzero (no repo, no config)', () => {
    const spawn = () => result(1, '');
    expect(resolveMcpActor('/some/project', spawn as never)).toBe('claude');
  });

  it('falls back to "claude" when user.name is set but blank', () => {
    const spawn = () => result(0, '   \n');
    expect(resolveMcpActor('/some/project', spawn as never)).toBe('claude');
  });

  it('runs git in the given cwd, as an argv array (never a shell)', () => {
    let seen: { cmd: string; args: readonly string[]; opts: unknown } | undefined;
    const spawn = (cmd: string, args: readonly string[], opts: unknown) => {
      seen = { cmd, args, opts };
      return result(0, 'x\n');
    };
    resolveMcpActor('/a/project/dir', spawn as never);
    expect(seen?.cmd).toBe('git');
    expect(seen?.args).toEqual(['config', 'user.name']);
    expect((seen?.opts as { cwd?: string })?.cwd).toBe('/a/project/dir');
  });
});
