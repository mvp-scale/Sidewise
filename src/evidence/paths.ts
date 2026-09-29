/**
 * Shared by code.ts, git.ts and units.ts: whether a path relative to the project root has escaped it (a `..`
 * segment, or gone absolute) — the one check that keeps evidence and drill reads inside the project.
 */
import path from 'node:path';

export const isOutside = (rel: string): boolean => rel.startsWith('..') || path.isAbsolute(rel);
