/**
 * Request text → a plain value. YAML 1.2 core schema through the `yaml` package, so JSON works too and
 * no/yes stay text. A parse error becomes ONE help-first stop (later errors are echoes of the first) naming
 * the line and the fix; the traps agents fall into (": " in an unquoted question, a category in { }) get
 * their own wording.
 */
import { parseDocument } from 'yaml';
import { clip } from '../util/text.ts';

export type ReadResult = { ok: true; value: Record<string, unknown> } | { ok: false; stops: string[] };

const SKELETON = '(sidewise template class prints a skeleton)';
const QUESTION_LINE = /^\s*(\d+)\s*:\s?(.*)$/u;

/** The line an error points at, or the nearest non-blank line above it (an unclosed { } is reported past its end). */
function sourceLine(lines: readonly string[], line: number): { no: number; text: string } {
  for (let no = Math.min(line, lines.length); no >= 1; no--) {
    const text = lines[no - 1] ?? '';
    if (text.trim()) return { no, text };
  }
  return { no: line, text: '' };
}

export function describeParseError(lines: readonly string[], code: string, line: number): string {
  if (code === 'MULTIPLE_DOCS') return '✖ yaml: more than one document (---) → send one request per run';
  const at = sourceLine(lines, line);
  if (code === 'TAB_AS_INDENT') return `✖ yaml: line ${at.no} is indented with a tab → indent with spaces`;
  if (code === 'DUPLICATE_KEY') {
    const key = /^\s*(?:-\s+)?([^:#]+?)\s*:/u.exec(at.text)?.[1] ?? '';
    return /^\d+$/u.test(key)
      ? `✖ question ${key}: numbered twice (line ${at.no}) → give each question its own number`
      : `✖ yaml: line ${at.no} repeats the key "${clip(key, 30)}" → give each key once`;
  }
  if (/[{}]/u.test(at.text)) return `✖ yaml: line ${at.no} puts a category or question in { } → use the indented form`;
  const q = QUESTION_LINE.exec(at.text);
  if (q && /:(\s|$)/u.test(q[2] ?? '')) return `✖ question ${q[1]} has ": " → put it in quotes`;
  return `✖ yaml: line ${at.no} does not parse → use the indented form, and put any question with ": " or " #" in quotes`;
}

export function readRequestText(text: string): ReadResult {
  const src = text.replace(/^﻿/u, '');
  if (!src.trim()) return { ok: false, stops: [`✖ request: empty → start with "side:" ${SKELETON}`] };
  if (/^\s*sidewise\s+\w+\s+L\d/u.test(src)) return { ok: false, stops: [`✖ request: this is the old text format → send YAML ${SKELETON}`] };
  const doc = parseDocument(src, { version: '1.2', schema: 'core', uniqueKeys: true });
  const first = doc.errors[0];
  if (first) return { ok: false, stops: [describeParseError(src.split(/\r?\n/u), first.code, first.linePos?.[0]?.line ?? 1)] };
  let value: unknown;
  try {
    value = doc.toJS({ maxAliasCount: 50 });
  } catch {
    return { ok: false, stops: ['✖ yaml: too many aliases (*) → write the request out in full'] };
  }
  if (value === null || value === undefined) return { ok: false, stops: [`✖ request: empty → start with "side:" ${SKELETON}`] };
  if (typeof value !== 'object' || Array.isArray(value)) return { ok: false, stops: [`✖ request: not a YAML mapping → start with "side:" ${SKELETON}`] };
  return { ok: true, value: value as Record<string, unknown> };
}
