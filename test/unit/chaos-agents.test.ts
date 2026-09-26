/**
 * checkAgent's skip path, offline and fast: with a PATH that resolves to neither CLI, both kinds report
 * "not found on PATH" without ever invoking claude or gemini (no live call, no network, no spend).
 */
import { mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { checkAgent } from '../chaos/agents.ts';

describe('checkAgent skips a missing CLI without invoking one', () => {
  const originalPath = process.env.PATH;
  let dir: string | undefined;

  afterEach(() => {
    process.env.PATH = originalPath;
    if (dir) rmSync(dir, { recursive: true, force: true });
    dir = undefined;
  });

  it('reports both claude and gemini as not found on a PATH holding only node', () => {
    dir = mkdtempSync(path.join(os.tmpdir(), 'sidewise-chaos-path-'));
    // node itself is on this PATH (so "PATH containing only node" is literally true) — neither checkAgent
    // path needs node on PATH to run (this test is already running inside node); the point is that spawnSync
    // for 'claude'/'gemini' can't resolve them here, exercising the ENOENT branch instead of the real CLIs.
    symlinkSync(process.execPath, path.join(dir, 'node'));
    process.env.PATH = dir;

    expect(checkAgent('claude')).toEqual({ ok: false, reason: 'claude CLI not found on PATH' });
    expect(checkAgent('gemini')).toEqual({ ok: false, reason: 'gemini CLI not found on PATH' });
  });
});
