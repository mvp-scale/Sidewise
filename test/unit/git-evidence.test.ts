// git evidence: a ref that looks like a git option must never reach git (Review Focus #3).
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { currentCommitSha, hasGit, isGitOption, readGitEvidence } from '../../src/evidence/git.ts';
import { gitCommit, gitInit, tempProject } from '../helpers/project.ts';

describe('isGitOption', () => {
  it.each(['-x', '--all', '-', '--output=x'])('%s looks like an option', (ref) => expect(isGitOption(ref)).toBe(true));
  it.each(['main', 'HEAD~1', 'feature/x', 'v1.2.3', 'worktree'])('%s does not', (ref) => expect(isGitOption(ref)).toBe(false));
});

describe('readGitEvidence: an option-shaped ref never reaches git', () => {
  it('rejected before any spawn, naming the field', () => {
    const { root } = tempProject({ 'src/a.ts': 'x' });
    const spawn = vi.fn();
    const r = readGitEvidence(root, '--output=x', 'before', ['src/a.ts'], { spawn: spawn as never });
    expect(r).toEqual({ ok: false, errors: ['✖ side.compare.before: "--output=x" looks like an option, not a ref → use a branch, tag or commit'] });
    expect(spawn).not.toHaveBeenCalled();
  });

  it('worktree reads the working tree directly, no git call', () => {
    const { root } = tempProject({ 'src/a.ts': 'hello\n' });
    const spawn = vi.fn();
    const r = readGitEvidence(root, 'worktree', 'after', ['src/a.ts'], { spawn: spawn as never });
    expect(r.ok && r.files['src/a.ts']).toBe('hello\n');
    expect(spawn).not.toHaveBeenCalled();
  });

  it('a real ref that does not exist: a clean stop, skipped when git is absent', (ctx) => {
    const { root } = tempProject({ 'src/a.ts': 'x' });
    if (!hasGit()) return ctx.skip();
    const r = readGitEvidence(root, 'not-a-real-ref-xyz', 'before', ['src/a.ts']);
    expect(r.ok).toBe(false);
  });

  // Fix #13: replay can't see a nested repo — readGitEvidence always ran git at the Sidewise root, so a file
  // whose own repo lives one level down (a monorepo package, a vendored project) was always "not found by
  // git", even on a real, committed ref. Runs git in the file's OWN nearest repo instead. [C-147]
  it('reads a file whose own git repo is nested one level below the Sidewise root', (ctx) => {
    const { root } = tempProject({});
    if (!hasGit()) return ctx.skip();
    const nested = path.join(root, 'nested');
    mkdirSync(path.join(nested, 'src'), { recursive: true });
    writeFileSync(path.join(nested, 'src', 'a.ts'), 'export const x = 1;\n');
    gitInit(nested); // the Sidewise root itself is never a git repo here — old code had nothing to fall back to
    const ref = gitCommit(nested, 'nested commit');
    const r = readGitEvidence(root, ref, 'before', ['nested/src/a.ts']);
    expect(r).toEqual({ ok: true, files: { 'nested/src/a.ts': 'export const x = 1;\n' }, notes: ['reading whole files: line ranges may not match the parent run'] });
  });
});

describe('currentCommitSha (plan 2b: the ledger\'s own run.commit field)', () => {
  it('null when the project is not a git repo, and never calls spawn for a nonexistent one', () => {
    const { root } = tempProject({});
    const spawn = vi.fn(() => ({ status: 1, stdout: '' }));
    expect(currentCommitSha(root, { spawn: spawn as never })).toBeNull();
    expect(spawn).toHaveBeenCalledWith('git', ['rev-parse', 'HEAD'], expect.objectContaining({ cwd: root }));
  });

  it('the real HEAD sha in a real repo, skipped when git is absent', (ctx) => {
    const { root } = tempProject(); // needs a real file to commit, or git rev-parse HEAD prints "HEAD" unresolved
    if (!hasGit()) return ctx.skip();
    gitInit(root);
    const sha = gitCommit(root, 'first');
    expect(currentCommitSha(root)).toBe(sha);
  });
});
