/** A throwaway project folder with source files and its own .mm3 ledger. */
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathsFor, type Mm3Paths } from '../../src/ledger/paths.ts';

export const USER_TS = 'export function findUser(id: string) {\n  return db.query(`SELECT * FROM users WHERE id = ${id}`);\n}\n';

export function tempProject(files: Record<string, string> = { 'src/user.ts': USER_TS }): { root: string; paths: Mm3Paths } {
  const root = mkdtempSync(path.join(os.tmpdir(), 'mm3-'));
  for (const [rel, text] of Object.entries(files)) {
    const full = path.join(root, rel);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, text);
  }
  return { root, paths: pathsFor(root) };
}

/** git init, with a throwaway local identity so `gitCommit` works even with no global git config. For replay's git-ref tests; callers skip when `hasGit()` is false. */
export function gitInit(root: string): void {
  spawnSync('git', ['init', '-q'], { cwd: root, stdio: 'ignore' });
  spawnSync('git', ['config', 'user.email', 'mm3-test@example.com'], { cwd: root, stdio: 'ignore' });
  spawnSync('git', ['config', 'user.name', 'mm3-test'], { cwd: root, stdio: 'ignore' });
  spawnSync('git', ['config', 'commit.gpgsign', 'false'], { cwd: root, stdio: 'ignore' });
}

/** Stages everything and commits; returns the new commit's full hash, usable directly as a `compare` ref. */
export function gitCommit(root: string, message = 'wip'): string {
  spawnSync('git', ['add', '-A'], { cwd: root, stdio: 'ignore' });
  spawnSync('git', ['commit', '-q', '-m', message], { cwd: root, stdio: 'ignore' });
  const rev = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' });
  return rev.stdout.trim();
}
