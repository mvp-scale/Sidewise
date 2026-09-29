/**
 * `npm run check:plugin`: rebuilds the plugin bundle into a temp file with the exact same logic as
 * `npm run build:plugin` (scripts/build-plugin.ts's `bundlePlugin`) and diffs it against the committed
 * `bin/sidewise.mjs` — so a source change that forgot to re-run build:plugin (and commit the result) fails
 * loudly instead of shipping a stale plugin bundle. Wired into CI and the pre-PR checks, not the pre-commit
 * hook (AGENTS.md: the pre-commit hook stays fast).
 */
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { bundlePlugin } from './build-plugin.ts';

export const COMMITTED_BUNDLE = 'bin/sidewise.mjs';
export const STALE_MESSAGE = `✖ plugin: ${COMMITTED_BUNDLE} is stale → run "npm run build:plugin" and commit the result`;

/** Pure diff of two already-read file contents — the real run below does the actual rebuild/read/cleanup. */
export function pluginBundleProblem(committed: string | undefined, freshlyBuilt: string): string | undefined {
  if (committed === undefined) return `✖ plugin: ${COMMITTED_BUNDLE} is missing → run "npm run build:plugin" and commit the result`;
  return committed === freshlyBuilt ? undefined : STALE_MESSAGE;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'sidewise-check-plugin-'));
  const tmpFile = path.join(tmpDir, 'sidewise.mjs');
  try {
    await bundlePlugin(tmpFile);
    const committed = existsSync(COMMITTED_BUNDLE) ? readFileSync(COMMITTED_BUNDLE, 'utf8') : undefined;
    const fresh = readFileSync(tmpFile, 'utf8');
    const problem = pluginBundleProblem(committed, fresh);
    if (problem) {
      console.error(problem);
      process.exit(1);
    }
    console.log('plugin bundle OK');
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}
