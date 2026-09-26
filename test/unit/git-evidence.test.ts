// git evidence: a ref that looks like a git option must never reach git (Review Focus #3).
import { describe, expect, it, vi } from 'vitest';
import { hasGit, isGitOption, readGitEvidence } from '../../src/evidence/git.ts';
import { tempProject } from '../helpers/project.ts';

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
});
