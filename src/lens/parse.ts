/**
 * Parses request text into a Request. Only structure is checked here: a line that is not the header, a field,
 * a numbered slot or a primitive is an error with its line number. Count and content rules live in
 * validate.ts, so all of a request's problems are reported at once.
 *
 *   sidewise class L1
 *   where: src/user.ts:10-24 · area: api
 *    1  Is request text placed directly into the SQL query?
 *    3 !Is the id checked to be a number before use?
 *   ~ How severe is the worst issue? none | low | high
 *   ? Where should this go? ship | fix | block
 *   + Is it covered by a test?
 */
import { VERBS, type Level, type Place, type Primitive, type Request, type Slot, type Verb } from './request.ts';

export type ParseResult = { ok: true; request: Request } | { ok: false; errors: string[] };

const HEADER = /^sidewise\s+(\S+)\s+L(\S+)$/;
const FIELD = /^(perspective|where|problem|tags|focus|parent)\s*:\s*(.*)$/;
const SLOT = /^(\d{1,2})\s+(!?)\s*(\S.*)$/;
const PRIMITIVE = /^([~?+])\s+(\S.*)$/;
const PLACE = /^(.+?)(?::(\d+(?:-\d+)?))?$/;

const isVerb = (v: string): v is Verb => (VERBS as readonly string[]).includes(v);
const clip = (s: string): string => (s.length > 60 ? `${s.slice(0, 59)}…` : s);

function parsePlace(value: string): Place {
  const [head = '', ...rest] = value.split('·').map((s) => s.trim());
  const m = PLACE.exec(head);
  const place: Place = { path: m?.[1] ?? head };
  if (m?.[2]) place.lines = m[2];
  for (const part of rest) {
    const area = /^area\s*:\s*(.+)$/.exec(part)?.[1];
    if (area) place.area = area.trim();
  }
  return place;
}

function parsePrimitive(sign: string, rest: string, lineNo: number): Primitive | string {
  if (sign === '+') return { kind: 'bool', text: rest.trim(), options: [] };
  const at = rest.lastIndexOf('?');
  const text = at >= 0 ? rest.slice(0, at + 1).trim() : '';
  const options = at >= 0 ? rest.slice(at + 1).split('|').map((o) => o.trim()).filter(Boolean) : [];
  if (!text || options.length === 0) return `✖ line ${lineNo}: "${clip(`${sign} ${rest}`)}" → write "${sign} <question>? option | option"`;
  return { kind: sign === '~' ? 'scale' : 'direction', text, options };
}

function parseHeader(line: string, lineNo: number): { verb: Verb; level: Level } | string {
  const h = HEADER.exec(line);
  if (!h) return `✖ line ${lineNo}: expected the header "sidewise <verb> L<1-3>" → e.g. "sidewise class L1"`;
  const verb = h[1] ?? '';
  const level = Number(h[2]);
  if (!isVerb(verb)) return `✖ line ${lineNo}: "${verb}" is not a verb → use one of ${VERBS.join(', ')}`;
  if (level !== 1 && level !== 2 && level !== 3) return `✖ line ${lineNo}: level "L${h[2]}" → use L1, L2 or L3`;
  return { verb, level };
}

export function parseRequest(text: string): ParseResult {
  const errors: string[] = [];
  const fields = new Map<string, string>();
  const where: Place[] = [];
  const slots: Slot[] = [];
  const primitives: Primitive[] = [];
  let header: { verb: Verb; level: Level } | undefined;
  let headerSeen = false;
  let notARequest: string | undefined; // no header line at all (JSON, YAML, binary, prose): one stop, not one per line

  text
    .replace(/^﻿/, '')
    .split(/\r?\n/)
    .forEach((raw, i) => {
      const lineNo = i + 1;
      const line = raw.trim();
      if (notARequest || !line || line.startsWith('#')) return;
      if (!headerSeen) {
        headerSeen = true;
        const h = parseHeader(line, lineNo);
        if (!HEADER.test(line) && typeof h === 'string') notARequest = h;
        if (typeof h === 'string') errors.push(h);
        else header = h;
        return;
      }
      const f = FIELD.exec(line);
      if (f) {
        const name = f[1] ?? '';
        const value = (f[2] ?? '').trim();
        if (name === 'where') {
          if (value) where.push(parsePlace(value));
        } else if (fields.has(name)) {
          errors.push(`✖ line ${lineNo}: "${name}" appears twice → keep one`);
        } else {
          fields.set(name, value);
        }
        return;
      }
      const s = SLOT.exec(line);
      if (s) {
        slots.push({ pos: Number(s[1]), reverse: s[2] === '!', text: (s[3] ?? '').trim() });
        return;
      }
      const p = PRIMITIVE.exec(line);
      if (p) {
        const r = parsePrimitive(p[1] ?? '', p[2] ?? '', lineNo);
        if (typeof r === 'string') errors.push(r);
        else primitives.push(r);
        return;
      }
      errors.push(`✖ line ${lineNo}: "${clip(line)}" is not a field, slot or primitive → fields look like "focus: …", slots like " 1  Is …?", primitives start with ~, ? or +`);
    });

  if (!headerSeen) return { ok: false, errors: ['✖ request: empty → start with the header "sidewise class L1"'] };
  if (notARequest) return { ok: false, errors: [notARequest] };
  if (errors.length || !header) return { ok: false, errors };
  const tags = (fields.get('tags') ?? '').split(',').map((t) => t.trim()).filter(Boolean);
  const parent = fields.get('parent');
  return {
    ok: true,
    request: {
      verb: header.verb,
      level: header.level,
      perspective: fields.get('perspective') ?? '',
      where,
      problem: fields.get('problem') ?? '',
      tags,
      focus: fields.get('focus') ?? '',
      ...(parent ? { parent } : {}),
      slots,
      primitives,
    },
  };
}
