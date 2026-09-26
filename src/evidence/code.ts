/**
 * Our code as classifier evidence: each `where` place becomes one state entry ("code:<path>[:lines]"),
 * redacted and size-capped. Paths must stay inside the project; a folder is a Stop (scan covers folders).
 */
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import type { Place } from '../lens/request.ts';
import { redact } from '../ledger/redact.ts';

export const EVIDENCE_LIMITS = { perFileChars: 20_000, totalChars: 60_000 } as const;

export interface CodeEvidence {
  state: Record<string, string>;
  notes: string[];
}

export type EvidenceResult = { ok: true; evidence: CodeEvidence } | { ok: false; errors: string[] };

function slice(text: string, lines: string | undefined): string {
  if (!lines) return text;
  const [start = 1, end = start] = lines.split('-').map(Number);
  return text.split('\n').slice(start - 1, end).join('\n');
}

export function readCodeEvidence(root: string, where: readonly Place[]): EvidenceResult {
  const errors: string[] = [];
  const notes: string[] = [];
  const state: Record<string, string> = {};
  let total = 0;
  for (const place of where) {
    const full = path.resolve(root, place.path);
    const rel = path.relative(root, full);
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
      errors.push(`✖ where: "${place.path}" is outside the project → use a path inside the project`);
      continue;
    }
    let text: string;
    try {
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
    let body = redact(slice(text, place.lines));
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
