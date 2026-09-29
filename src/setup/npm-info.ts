/**
 * Everything init/uninstall/doctor need to know about how this CLI gets installed: whether `sidewise` already
 * resolves on PATH, what "self" means to pass to `npm install -g <self>` (the registry spec normally, or an
 * absolute tarball path when this process was itself launched from one — `npx <tgz> init` or
 * `npm run dev:install`), and whether npm's global prefix is writable without sudo.
 *
 * Self-spec detection: npm normalizes a tarball install to the same `node_modules/<name>` layout a registry
 * install gets, so the tarball origin can't be read back from the installed directory structure alone. The one
 * place npm still records it is the nearest ancestor `package-lock.json`'s own entry for this package: its
 * `resolved` field is `file:<relative path>` (relative to the lockfile's own directory) for a tarball
 * dependency, and a registry URL otherwise. This is what `npm install <tarball>` writes in a real project, and
 * what `npx <tgz>` writes in its own ephemeral `~/.npm/_npx/<hash>/package-lock.json` — confirmed empirically
 * against this repo's own `npm pack` output before relying on it here. A global install has no such lockfile,
 * so a tarball global-installed copy running `sidewise init` again falls back to the registry spec; noted as a
 * known gap rather than guessed at further.
 */
import { accessSync, constants, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import type { Runner } from './runner.ts';

type Env = Record<string, string | undefined>;

/** The first matching, existing file named `name` (plus a PATHEXT extension on Windows) on PATH; undefined if
 *  none. Pure filesystem checks — no shell, so it can't be tricked by a PATH entry with spaces or globs. */
export function findOnPath(name: string, env: Env = process.env, platform: NodeJS.Platform = process.platform): string | undefined {
  const pathVar = env.PATH ?? env.Path ?? '';
  const dirs = pathVar.split(path.delimiter).filter(Boolean);
  const exts = platform === 'win32' ? (env.PATHEXT ?? '.EXE;.CMD;.BAT').split(';') : [''];
  for (const dir of dirs) {
    for (const ext of exts) {
      const candidate = path.join(dir, name + ext);
      try {
        if (statSync(candidate).isFile()) return candidate;
      } catch {
        // not here: keep looking
      }
    }
  }
  return undefined;
}

export interface SelfSpec {
  spec: string;
  kind: 'registry' | 'tarball';
}

function lockDirAbove(packageDir: string, sep: string): string | undefined {
  const segments = packageDir.split(sep);
  const idx = segments.lastIndexOf('node_modules');
  if (idx <= 0) return undefined;
  return segments.slice(0, idx).join(sep);
}

/** `packageDir` is this package's own directory (its package.json's dirname); `pkg` is that package.json's own
 *  `name`/`version`. `readFile` is injectable so tests can point at a fixture lockfile instead of a real one. */
export function detectSelfSpec(packageDir: string, pkg: { name: string; version: string }, readFile: (file: string) => string = (f) => readFileSync(f, 'utf8')): SelfSpec {
  const registry: SelfSpec = { spec: `${pkg.name}@${pkg.version}`, kind: 'registry' };
  try {
    const lockDir = lockDirAbove(packageDir, path.sep);
    if (!lockDir) return registry;
    const lock = JSON.parse(readFile(path.join(lockDir, 'package-lock.json'))) as { packages?: Record<string, { resolved?: string }> };
    const resolved = lock.packages?.[`node_modules/${pkg.name}`]?.resolved;
    if (typeof resolved === 'string' && resolved.startsWith('file:')) {
      const rel = decodeURIComponent(resolved.slice('file:'.length));
      return { spec: path.resolve(lockDir, rel), kind: 'tarball' };
    }
  } catch {
    // no lockfile, or it doesn't mention this package: the registry spec is the right default either way
  }
  return registry;
}

/** Walks up from `dir` to the first ancestor that exists, then checks that one for write access — covers "the
 *  target doesn't exist yet, but npm would create it under a writable parent" (a fresh ~/.local/lib/node_modules). */
export function isWritableDir(dir: string): boolean {
  try {
    accessSync(dir, constants.W_OK);
    return true;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') return false;
    const parent = path.dirname(dir);
    return parent === dir ? false : isWritableDir(parent);
  }
}

/** `npm config get prefix`, trimmed; undefined if npm itself can't be run (never thrown). */
export function npmGlobalPrefix(runner: Runner): string | undefined {
  const r = runner('npm', ['config', 'get', 'prefix']);
  return r.status === 0 ? r.stdout.trim() || undefined : undefined;
}
