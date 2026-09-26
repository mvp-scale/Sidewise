/**
 * Code units: the resolver that turns scan's `over: {file: <pattern>, function: each, call: each}` into
 * layers.ts items (file -> function -> call), plus the on-disk re-read a stored unit needs for drill
 * continuing from a parent run. createCodeResolver is dispatched by what its *parent* item's unit.kind is,
 * not by the layer's name (an agent can call a layer anything). Every pattern and path this module is handed
 * already passed checkOver before expand() ever runs a resolver, so a resolver can't itself fail — a file
 * that can't be read is a note, not a stop. readUnit is the mirror operation for drill: the ledger stores a
 * unit (path + kind + lines), not the source text itself, so the code may have moved since the parent run.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { Item, Resolved, Resolver, UnitRef } from '../contract/layers.ts';
import { expandGlob, MAX_FILES } from './glob.ts';
import { splitCalls, splitFunctions } from './split.ts';

export type UnitReadResult = { ok: true; text: string } | { ok: false; error: string };

const isOutside = (rel: string): boolean => rel.startsWith('..') || path.isAbsolute(rel);

const LINES = /^(\d+)-(\d+)$/;

/** A unit's own "start-end" -> {start, end}, or undefined if it isn't well-formed. */
function lineRange(lines: string): { start: number; end: number } | undefined {
  const m = LINES.exec(lines);
  if (!m) return undefined;
  const start = Number(m[1]);
  const end = Number(m[2]);
  return start >= 1 && start <= end ? { start, end } : undefined;
}

/** The sweep's first layer: a glob becomes whole-file items, id = the relative path. */
function readFiles(root: string, spec: string, notes: string[]): Resolved[] {
  const { files, truncated } = expandGlob(root, spec);
  if (truncated) notes.push(`${spec}: matched more than ${MAX_FILES} files, using the first ${MAX_FILES}`);
  const out: Resolved[] = [];
  for (const rel of files) {
    let text: string;
    try {
      text = readFileSync(path.join(root, rel), 'utf8');
    } catch {
      // The directory walk (expandGlob) and this read aren't atomic: the file may have vanished, or become
      // unreadable, in between. Either way, that one file contributes nothing rather than failing the sweep.
      notes.push(`${rel}: could not read, skipped`);
      continue;
    }
    const lineCount = text ? text.split('\n').length : 1;
    out.push({ name: rel, text, unit: { path: rel, kind: 'file', name: rel, lines: `1-${lineCount}` } });
  }
  return out;
}

/** A file's functions. splitFunctions' start/end are already file-absolute. */
function readFunctions(parent: Item): Resolved[] {
  const unit = parent.unit!;
  return splitFunctions(parent.text).map((u) => ({
    name: u.name,
    text: u.text,
    unit: { path: unit.path, kind: 'function' as const, name: u.name, lines: `${u.start}-${u.end}` },
  }));
}

/** A function's (or a call's) calls. splitCalls' start/end are relative to the parent's own slice, so offset
 * by the parent's file-absolute start to land back on file-absolute lines. */
function readCalls(parent: Item): Resolved[] {
  const unit = parent.unit!;
  const base = Number(unit.lines.split('-')[0]) - 1;
  return splitCalls(parent.text).map((u) => ({
    name: u.name,
    text: u.text,
    unit: { path: unit.path, kind: 'call' as const, name: u.name, lines: `${u.start + base}-${u.end + base}` },
  }));
}

/** One Resolver for every depth of scan's chain: file -> function -> call. */
export function createCodeResolver(root: string, notes: string[]): Resolver {
  return (_layer: string, spec: string, parent: Item | null): Resolved[] => {
    if (parent === null) return readFiles(root, spec, notes);
    if (parent.unit!.kind === 'file') return readFunctions(parent);
    return readCalls(parent);
  };
}

/** Re-reads one stored UnitRef's current text from disk, for drill continuing from a parent run. Errors are
 * plain strings, not "✖ field: …" stops — the caller (drill.ts) knows which field is at fault (side.from)
 * and wraps the reason into its own stop text. */
export function readUnit(root: string, unit: UnitRef): UnitReadResult {
  const full = path.resolve(root, unit.path);
  const rel = path.relative(root, full);
  if (isOutside(rel)) return { ok: false, error: `"${unit.path}" is outside the project` };
  let text: string;
  try {
    text = readFileSync(full, 'utf8');
  } catch {
    return { ok: false, error: `cannot read "${unit.path}"` };
  }
  if (unit.kind === 'file') return { ok: true, text };
  const range = lineRange(unit.lines);
  if (!range) return { ok: false, error: `"${unit.path}:${unit.lines}" has a bad line range` };
  const lines = text.split('\n');
  if (range.end > lines.length) return { ok: false, error: `"${unit.path}:${unit.lines}" is past the end of the file now` };
  return { ok: true, text: lines.slice(range.start - 1, range.end).join('\n') };
}
