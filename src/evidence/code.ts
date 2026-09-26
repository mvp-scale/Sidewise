/**
 * Our code as classifier evidence: each `where` place becomes one state entry ("code:<path>[:lines]"),
 * redacted and size-capped. Paths must stay inside the project, symlinks resolved; a folder or a bad line range
 * is a Stop (scan covers folders). This is the one place line ranges are checked.
 */
import { readFileSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import type { Place } from '../lens/request.ts';
import { redact } from '../ledger/redact.ts';

export const EVIDENCE_LIMITS = { perFileChars: 20_000, totalChars: 60_000 } as const;

export interface CodeEvidence {
  state: Record<string, string>;
  notes: string[];
}

export type EvidenceResult = { ok: true; evidence: CodeEvidence } | { ok: false; errors: string[] };

const LINES = /^(\d+)(?:-(\d+))?$/;

/** "start" or "start-end" with 1 ≤ start ≤ end, else undefined. */
function lineRange(lines: string): { start: number; end: number } | undefined {
  const m = LINES.exec(lines);
  if (!m) return undefined;
  const start = Number(m[1]);
  const end = m[2] === undefined ? start : Number(m[2]);
  return start >= 1 && start <= end ? { start, end } : undefined;
}

const isOutside = (rel: string): boolean => rel.startsWith('..') || path.isAbsolute(rel);

export function readCodeEvidence(root: string, where: readonly Place[]): EvidenceResult {
  const errors: string[] = [];
  const notes: string[] = [];
  const state: Record<string, string> = {};
  let total = 0;
  for (const place of where) {
    const full = path.resolve(root, place.path);
    const rel = path.relative(root, full);
    const outside = `✖ where: "${place.path}" is outside the project → use a path inside the project`;
    if (isOutside(rel)) {
      errors.push(outside);
      continue;
    }
    const range = place.lines ? lineRange(place.lines) : undefined;
    if (place.lines && !range) {
      errors.push(`✖ where: "${place.path}:${place.lines}" has a bad line range → use start-end with 1 ≤ start ≤ end`);
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
        errors.push(`✖ where: "${place.path}" is a folder → name a file (scan covers folders)`);
        continue;
      }
      text = readFileSync(full, 'utf8');
    } catch {
      errors.push(`✖ where: cannot read "${place.path}" → check the path`);
      continue;
    }
    const shown = `${rel.split(path.sep).join('/')}${place.lines ? `:${place.lines}` : ''}`;
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
    state[`code:${shown}`] = body;
  }
  return errors.length ? { ok: false, errors } : { ok: true, evidence: { state, notes } };
}
