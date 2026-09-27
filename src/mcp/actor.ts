/**
 * A real actor for MCP-driven runs. The plugin never sets SIDEWISE_ACTOR — Claude Code's own cwd is wherever
 * it launched, and there's no prompt to ask "who are you" — so every run and outcome would otherwise come
 * through as `by: agent`. cli.ts's mcp wiring calls this once per tools/call, only when the env doesn't
 * already carry SIDEWISE_ACTOR (an explicit value always wins), and injects the result before dispatching.
 * Mirrors evidence/git.ts's own direct-spawnSync style for git specifically, rather than setup/runner.ts's
 * generic Runner (which has no cwd option, and is for npm/claude/keychain, not git).
 */
import { spawnSync } from 'node:child_process';

type Spawn = typeof spawnSync;

/** `git config user.name` in `cwd`, trimmed; "claude" when there's no repo, no git, or no name configured. */
export function resolveMcpActor(cwd: string, spawn: Spawn = spawnSync): string {
  const result = spawn('git', ['config', 'user.name'], { cwd, encoding: 'utf8' });
  const name = result.status === 0 && typeof result.stdout === 'string' ? result.stdout.trim() : '';
  return name || 'claude';
}
