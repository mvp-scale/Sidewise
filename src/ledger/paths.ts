/** Where the ledger lives: <root>/.sidewise/. Root = SIDEWISE_HOME, else the nearest folder with .sidewise or .git. */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export interface SidewisePaths {
  root: string;
  dir: string;
  log: string;
  lock: string;
  budget: string;
  /** The id index sidecar (ledger/index.ts): a disposable SQLite db, rebuildable from log.jsonl, never the
   *  source of truth. Node < 22.13 (no node:sqlite) never creates this file at all — see index.ts's fallback. */
  index: string;
}

export function pathsFor(root: string): SidewisePaths {
  const dir = path.join(root, '.sidewise');
  return { root, dir, log: path.join(dir, 'log.jsonl'), lock: path.join(dir, 'lock'), budget: path.join(dir, 'budget.json'), index: path.join(dir, 'index.db') };
}

/**
 * Creates .sidewise/ (if missing) and a self-ignoring `.sidewise/.gitignore` holding `*`, so nothing inside
 * is committed by default even when a user never ran `sidewise init` and
 * `.sidewise/` is only ever created lazily, by the first ledger/budget/index write. Called from every one of
 * those write paths (log.ts, budget.ts, ledger/index.ts) and from init's own explicit "create the project"
 * step, so first-run users are covered either way. Idempotent and cheap: skips the write once the file exists.
 */
export function ensureDir(paths: Pick<SidewisePaths, 'dir'>): void {
  mkdirSync(paths.dir, { recursive: true });
  const gitignore = path.join(paths.dir, '.gitignore');
  if (!existsSync(gitignore)) writeFileSync(gitignore, '*\n');
}

/** The nearest folder at or above cwd holding .sidewise or .git; undefined outside any project. */
export function findRoot(cwd: string): string | undefined {
  let dir = path.resolve(cwd);
  for (;;) {
    if (existsSync(path.join(dir, '.sidewise')) || existsSync(path.join(dir, '.git'))) return dir;
    const up = path.dirname(dir);
    if (up === dir) return undefined;
    dir = up;
  }
}

/**
 * The project's paths, or undefined outside any project: we never create .sidewise/ in whatever folder an agent
 * happens to be in (its home, /tmp, a scratch dir). SIDEWISE_HOME names the project explicitly.
 */
export function resolvePaths(cwd: string = process.cwd(), env: Record<string, string | undefined> = process.env): SidewisePaths | undefined {
  const home = env.SIDEWISE_HOME?.trim();
  const root = home ? path.resolve(home) : findRoot(cwd);
  return root === undefined ? undefined : pathsFor(root);
}
