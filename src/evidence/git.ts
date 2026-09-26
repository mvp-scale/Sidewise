/**
 * Git as classifier evidence for change: two states of the same files, read either from a ref (`git show`) or
 * from the working tree (Decision 2's literal "worktree"). Review Focus #3: a ref that looks like a git option
 * (starts with "-") must never reach git — checked before any spawnSync call, so it can't be re-split or
 * re-interpreted as an option. git is always spawned as an argv array, never through a shell.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import { redact } from '../ledger/redact.ts';
import { EVIDENCE_LIMITS } from './code.ts';

export type GitResult = { ok: true; files: Record<string, string>; notes: string[] } | { ok: false; errors: string[] };

type Spawn = typeof spawnSync;

const FATAL = /fatal: (invalid object name|Path .* does not exist)/u;

/** A string git would read as an option, not a ref: it must never be handed to git. */
export const isGitOption = (ref: string): boolean => ref.startsWith('-');

/** Whether the container has a git binary at all (Global Constraint: git-backed tests skip when it's absent). */
export function hasGit(deps?: { spawn?: Spawn }): boolean {
  const spawn = deps?.spawn ?? spawnSync;
  return spawn('git', ['--version'], {}).status === 0;
}

const isOutside = (rel: string): boolean => rel.startsWith('..') || path.isAbsolute(rel);

/** Redact, then cap per file and in total, exactly like evidence/code.ts's EVIDENCE_LIMITS. */
function keep(shown: string, text: string, total: number, notes: string[]): { body: string; total: number } | undefined {
  let body = redact(text);
  if (body.length > EVIDENCE_LIMITS.perFileChars) {
    body = body.slice(0, EVIDENCE_LIMITS.perFileChars);
    notes.push(`${shown} truncated to ${EVIDENCE_LIMITS.perFileChars} chars`);
  }
  const room = EVIDENCE_LIMITS.totalChars - total;
  if (room <= 0) {
    notes.push(`${shown} skipped: evidence limit reached`);
    return undefined;
  }
  if (body.length > room) {
    body = body.slice(0, room);
    notes.push(`${shown} truncated: evidence limit reached`);
  }
  return { body, total: total + body.length };
}

/**
 * `ref === 'worktree'`: each path read straight off disk, whole file. Otherwise: `git show ref:path`, whole
 * file. Either way, whole files only (change never has line ranges) — a note says so once, not once per file.
 */
export function readGitEvidence(root: string, ref: string, field: 'before' | 'after', paths: readonly string[], deps?: { spawn?: Spawn }): GitResult {
  if (ref !== 'worktree' && isGitOption(ref)) {
    return { ok: false, errors: [`✖ side.compare.${field}: "${ref}" looks like an option, not a ref → use a branch, tag or commit`] };
  }

  const spawn = deps?.spawn ?? spawnSync;
  const errors: string[] = [];
  const notes: string[] = [];
  const files: Record<string, string> = {};
  let total = 0;
  let read = false;

  for (const rawPath of paths) {
    const full = path.resolve(root, rawPath);
    const rel = path.relative(root, full);
    const outside = `✖ side.compare.${field}: "${rawPath}" is outside the project → use a path inside the project`;
    if (isOutside(rel)) {
      errors.push(outside);
      continue;
    }
    const shown = rel.split(path.sep).join('/');

    if (ref === 'worktree') {
      let text: string;
      try {
        // Resolve symlinks on both sides: a link inside the project that points outside it is still outside.
        if (isOutside(path.relative(realpathSync(root), realpathSync(full)))) {
          errors.push(outside);
          continue;
        }
        if (statSync(full).isDirectory()) {
          errors.push(`✖ side.compare.${field}: "${rawPath}" is a folder → name a file`);
          continue;
        }
        text = readFileSync(full, 'utf8');
      } catch {
        errors.push(`✖ side.compare.${field}: cannot read "${rawPath}" → check the path`);
        continue;
      }
      read = true;
      const kept = keep(shown, text, total, notes);
      if (kept) {
        files[shown] = kept.body;
        total = kept.total;
      }
      continue;
    }

    const result = spawn('git', ['show', `${ref}:${shown}`], { cwd: root, encoding: 'utf8' });
    const stderr = typeof result.stderr === 'string' ? result.stderr : '';
    if (result.status !== 0 || FATAL.test(stderr)) {
      errors.push(`✖ side.compare.${field}: "${ref}" not found by git (or the path doesn't exist there) → check the ref and the path`);
      continue;
    }
    read = true;
    const kept = keep(shown, typeof result.stdout === 'string' ? result.stdout : '', total, notes);
    if (kept) {
      files[shown] = kept.body;
      total = kept.total;
    }
  }

  if (errors.length) return { ok: false, errors };
  if (read) notes.push('reading whole files: line ranges may not match the parent run');
  return { ok: true, files, notes };
}
