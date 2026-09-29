/**
 * `npm run build:plugin`: bundles `src/cli.ts` and its one runtime dependency (`yaml`) into a single committed
 * ESM file, `bin/mm3.mjs` — the second packaging (owner ruling, 2026-09-27-plugin-self-contained.md, P1).
 * Claude Code copies the plugin folder from git and never runs a build step, so this file has to be checked in
 * and kept in sync by hand (`npm run check:plugin`, scripts/check-plugin.ts, re-uses `bundlePlugin` below
 * against a temp path and diffs it against the committed one). `npm run build` (tsc, dist/) is unrelated and
 * unchanged — that's still what the npm package ships.
 */
import { chmodSync, statSync } from 'node:fs';
import * as esbuild from 'esbuild';

export const ENTRY = 'src/cli.ts';

// yaml (dist/index.js) is CJS and calls plain `require('process')` at module scope (composer.js et al). esbuild
// bundling CJS into ESM output can't always rewrite a require() of a builtin into a real static import — the
// left-over call goes through esbuild's own `__require` shim, which only forwards to a *real* `require` if one
// is already in scope; a plain .mjs has none, so it throws "Dynamic require of ... is not supported" at
// runtime (confirmed empirically: `external: ['node:*']` alone still failed this way for the bare, unprefixed
// 'process' specifier). The banner below defines that missing `require` via `node:module`'s createRequire, so
// the shim's own `typeof require !== 'undefined'` check finds a real one and just uses it — the standard fix
// for esbuild's Node+ESM+CJS-interop gap, not something specific to this codebase.
const REQUIRE_SHIM_BANNER = "import { createRequire as __mm3CreateRequire } from 'node:module';\nconst require = __mm3CreateRequire(import.meta.url);";

/** Bundles src/cli.ts to `outFile` (ESM, Node platform — esbuild's `platform: 'node'` treats every `node:`
 *  builtin as external automatically; `yaml`, the one real npm dependency, gets bundled in). The shebang
 *  `src/cli.ts` starts with survives as esbuild's own first output line; the require-shim banner (see above)
 *  is inserted right after it. */
export async function bundlePlugin(outFile: string): Promise<void> {
  await esbuild.build({
    entryPoints: [ENTRY],
    outfile: outFile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    legalComments: 'none',
    external: ['node:*'],
    banner: { js: REQUIRE_SHIM_BANNER },
  });
  // node ${CLAUDE_PLUGIN_ROOT}/bin/mm3.mjs is run directly by `node`, so the executable bit isn't load-
  // bearing the way dist/cli.js's is for a package-manager-installed bin symlink — set it anyway, to match.
  chmodSync(outFile, 0o755);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const out = 'bin/mm3.mjs';
  await bundlePlugin(out);
  console.log(`built ${out} (${statSync(out).size} bytes)`);
}
