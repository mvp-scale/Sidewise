/**
 * Our code as classifier evidence: each `where` entry ("path" or "path:start-end") becomes one evidence file,
 * redacted and size-capped. Paths must stay inside the project, symlinks resolved; a folder or a bad line range
 * is a Stop. This is the one place line ranges are checked — schema-check.ts already confirmed the shape.
 */
import { readFileSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import { redact } from '../ledger/redact.ts';
import { isOutside } from './paths.ts';

export const EVIDENCE_LIMITS = { perFileChars: 20_000, totalChars: 60_000 } as const;

export interface CodeEvidence {
  files: Record<string, string>;
  notes: string[];
}

export type EvidenceResult = { ok: true; evidence: CodeEvidence } | { ok: false; errors: string[] };

const LINES = /^(\d+)(?:-(\d+))?$/;
const TAIL = /:(\d+(?:-\d+)?)$/u;

/** "start" or "start-end" with 1 ≤ start ≤ end, else undefined. */
function lineRange(lines: string): { start: number; end: number } | undefined {
  const m = LINES.exec(lines);
  if (!m) return undefined;
  const start = Number(m[1]);
  const end = m[2] === undefined ? start : Number(m[2]);
  return start >= 1 && start <= end ? { start, end } : undefined;
}

/** "path" or "path:lines" (schema-check.ts already confirmed the path itself has no other ":"). */
function splitWhere(entry: string): { path: string; lines?: string } {
  const m = TAIL.exec(entry);
  return m ? { path: entry.slice(0, m.index), lines: m[1]! } : { path: entry };
}

export function readCodeEvidence(root: string, where: readonly string[]): EvidenceResult {
  const errors: string[] = [];
  const notes: string[] = [];
  const files: Record<string, string> = {};
  let total = 0;
  for (const entry of where) {
    const { path: rawPath, lines } = splitWhere(entry);
    const full = path.resolve(root, rawPath);
    const rel = path.relative(root, full);
    const outside = `✖ side.where: "${rawPath}" is outside the project → use a path inside the project`;
    if (isOutside(rel)) {
      errors.push(outside);
      continue;
    }
    const range = lines ? lineRange(lines) : undefined;
    if (lines && !range) {
      errors.push(`✖ side.where: "${entry}" has a bad line range → use start-end with 1 ≤ start ≤ end`);
      continue;
    }
    let text: string;
    try {
      // Resolve symlinks on both sides: a link inside the project that points outside it is still outside.
      if (isOutside(path.relative(realpathSync(root), realpathSync(full)))) {
        errors.push(outside);
        continue;
      }
      if (statSync(full).isDirectory()) {
        errors.push(`✖ side.where: "${rawPath}" is a folder → name a file (scan covers folders)`);
        continue;
      }
      text = readFileSync(full, 'utf8');
    } catch {
      errors.push(`✖ side.where: cannot read "${rawPath}" → check the path`);
      continue;
    }
    const shown = `${rel.split(path.sep).join('/')}${lines ? `:${lines}` : ''}`;
    let body = redact(range ? text.split('\n').slice(range.start - 1, range.end).join('\n') : text);
    if (body.length > EVIDENCE_LIMITS.perFileChars) {
      body = body.slice(0, EVIDENCE_LIMITS.perFileChars);
      notes.push(`${shown} truncated to ${EVIDENCE_LIMITS.perFileChars} chars`);
    }
    const room = EVIDENCE_LIMITS.totalChars - total;
    if (room <= 0) {
      notes.push(`${shown} skipped: evidence limit reached`);
      continue;
    }
    if (body.length > room) {
      body = body.slice(0, room);
      notes.push(`${shown} truncated: evidence limit reached`);
    }
    total += body.length;
    files[shown] = body;
  }
  return errors.length ? { ok: false, errors } : { ok: true, evidence: { files, notes } };
}
