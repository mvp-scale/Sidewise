/** Where the ledger lives: <root>/.sidewise/. Root = SIDEWISE_HOME, else the nearest folder with .sidewise or .git, else cwd. */
import { existsSync } from 'node:fs';
import path from 'node:path';

export interface SidewisePaths {
  root: string;
  dir: string;
  log: string;
  lock: string;
  budget: string;
}

export function pathsFor(root: string): SidewisePaths {
  const dir = path.join(root, '.sidewise');
  return { root, dir, log: path.join(dir, 'log.jsonl'), lock: path.join(dir, 'lock'), budget: path.join(dir, 'budget.json') };
}

export function findRoot(cwd: string): string {
  let dir = path.resolve(cwd);
  for (;;) {
    if (existsSync(path.join(dir, '.sidewise')) || existsSync(path.join(dir, '.git'))) return dir;
    const up = path.dirname(dir);
    if (up === dir) return path.resolve(cwd);
    dir = up;
  }
}

export function resolvePaths(cwd: string = process.cwd(), env: Record<string, string | undefined> = process.env): SidewisePaths {
  const home = env.SIDEWISE_HOME?.trim();
  return pathsFor(home ? path.resolve(home) : findRoot(cwd));
}
