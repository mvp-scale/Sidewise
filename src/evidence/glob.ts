/**
 * Project-relative file patterns for scan (over.file) and loop's folder places, with no dependency:
 * `*` (within a folder), `**` (any depth), `?` and `{a,b}`. The walk never follows symlinks and skips .git,
 * node_modules, .sidewise and dist, so a pattern can't leave the project or wander into generated code.
 */
import { readdirSync } from 'node:fs';
import path from 'node:path';

export const SKIP_DIRS = new Set(['.git', 'node_modules', '.sidewise', 'dist']);
export const MAX_FILES = 500;

const escape = (s: string): string => s.replace(/[.+^$()|[\]\\]/gu, '\\$&');

export function globToRegExp(pattern: string): RegExp {
  let re = '';
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i]!;
    if (c === '*') {
      if (pattern[i + 1] === '*') {
        const slash = pattern[i + 2] === '/';
        re += slash ? '(?:[^/]*/)*' : '.*';
        i += slash ? 2 : 1;
      } else re += '[^/]*';
    } else if (c === '?') re += '[^/]';
    else if (c === '{') {
      const end = pattern.indexOf('}', i);
      if (end > i) {
        re += `(?:${pattern.slice(i + 1, end).split(',').map(escape).join('|')})`;
        i = end;
      } else re += '\\{';
    } else re += escape(c);
  }
  return new RegExp(`^${re}$`, 'u');
}

/** The folder a pattern can't match outside of: the path before its first wildcard. */
function staticPrefix(pattern: string): string {
  const parts = pattern.split('/');
  const fixed: string[] = [];
  for (const p of parts.slice(0, -1)) {
    if (/[*?{]/u.test(p)) break;
    fixed.push(p);
  }
  return fixed.join('/');
}

/** Files under root matching the pattern, sorted, at most MAX_FILES. */
export function expandGlob(root: string, pattern: string): { files: string[]; truncated: boolean } {
  const clean = pattern.replace(/^\.\//u, '');
  const re = globToRegExp(clean);
  const files: string[] = [];
  let truncated = false;
  const walk = (rel: string): void => {
    let entries;
    try {
      entries = readdirSync(path.join(root, rel), { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
      const child = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name)) walk(child);
      } else if (e.isFile() && re.test(child)) {
        if (files.length >= MAX_FILES) {
          truncated = true;
          return;
        }
        files.push(child);
      }
    }
  };
  walk(staticPrefix(clean));
  return { files, truncated };
}
