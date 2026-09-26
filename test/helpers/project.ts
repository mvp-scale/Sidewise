/** A throwaway project folder with source files and its own .sidewise ledger. */
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathsFor, type SidewisePaths } from '../../src/ledger/paths.ts';

export const USER_TS = 'export function findUser(id: string) {\n  return db.query(`SELECT * FROM users WHERE id = ${id}`);\n}\n';

export function tempProject(files: Record<string, string> = { 'src/user.ts': USER_TS }): { root: string; paths: SidewisePaths } {
  const root = mkdtempSync(path.join(os.tmpdir(), 'sidewise-'));
  for (const [rel, text] of Object.entries(files)) {
    const full = path.join(root, rel);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, text);
  }
  return { root, paths: pathsFor(root) };
}
