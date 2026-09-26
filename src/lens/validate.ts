/**
 * Help-first validation. A Stop breaks comparability or can't be asked (exit 2), and every Stop says what to
 * change: "✖ field: problem → fix". Anything that only weakens the answer is a Note printed with the answer.
 */
import { MAX_PRIMITIVES, SLOTS_PER_LEVEL, type Request, type Verb } from './request.ts';

export interface Validation {
  stops: string[];
  notes: string[];
}

export const IRREVERSIBLE_NOTE_PREFIX = 'looks irreversible';

const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const RUN_ID = /^SW-\d{4,}$/;
const IRREVERSIBLE = /\b(delete|deploy|drop|pay|payment|migrat\w*|secret|credential)s?\b/i;
const OPTION_RANGE = { scale: [2, 10], direction: [2, 8] } as const;
const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`;

function checkEnvelope(req: Request, implemented: readonly Verb[]): string[] {
  const out: string[] = [];
  if (!implemented.includes(req.verb)) out.push(`✖ verb: "${req.verb}" is not available yet → use ${implemented.join(' or ')}`);
  if (!req.focus) out.push('✖ focus: missing → add "focus: <the one thing this run is about>"');
  if (!req.problem) out.push('✖ problem: missing → add "problem: <one short line>"');
  if (req.where.length < 1 || req.where.length > 5) out.push(`✖ where: need 1–5 places, got ${req.where.length} → add "where: path/to/file.ts"`);
  if (req.tags.length < 1 || req.tags.length > 5) out.push(`✖ tags: need 1–5 tags, got ${req.tags.length} → e.g. "tags: sql, auth"`);
  const bad = req.tags.filter((t) => !KEBAB.test(t));
  if (bad.length) out.push(`✖ tags: ${bad.map((t) => `"${t}"`).join(', ')} not kebab-case → use lowercase words joined by -`);
  if (req.parent !== undefined && !RUN_ID.test(req.parent)) out.push(`✖ parent: "${req.parent}" is not a run id → use SW-####`);
  return out;
}

function checkSlots(req: Request): string[] {
  const out: string[] = [];
  const need = SLOTS_PER_LEVEL[req.level];
  const got = req.slots.length;
  if (got < need) out.push(`✖ slots: L${req.level} needs ${need}, got ${got} → add ${plural(need - got, 'question')} on the same focus`);
  if (got > need) out.push(`✖ slots: L${req.level} needs ${need}, got ${got} → remove ${got - need}, or raise the level`);
  const wrong = req.slots.findIndex((s, i) => s.pos !== i + 1);
  if (wrong >= 0) out.push(`✖ slots: slot ${wrong + 1} is numbered ${req.slots[wrong]!.pos} → number them 1 to ${got} in order`);
  const seen = new Map<string, number>();
  for (const s of req.slots) {
    const key = s.text.toLowerCase().replace(/\s+/g, ' ');
    const first = seen.get(key);
    if (first !== undefined) out.push(`✖ slots: ${s.pos} repeats ${first} → ask something different`);
    else seen.set(key, s.pos);
  }
  return out;
}

function checkPrimitives(req: Request): string[] {
  const out: string[] = [];
  if (req.primitives.length > MAX_PRIMITIVES) out.push(`✖ primitives: at most ${MAX_PRIMITIVES}, got ${req.primitives.length} → remove ${req.primitives.length - MAX_PRIMITIVES}`);
  for (const p of req.primitives) {
    if (p.kind === 'bool') continue;
    const [min, max] = OPTION_RANGE[p.kind];
    const noun = p.kind === 'scale' ? 'levels' : 'options';
    if (p.options.length < min || p.options.length > max) out.push(`✖ primitive "${p.text}": a ${p.kind} needs ${min}–${max} ${noun}, got ${p.options.length} → separate them with |`);
    if (new Set(p.options).size !== p.options.length) out.push(`✖ primitive "${p.text}": repeated ${noun} → make each one different`);
  }
  return out;
}

function slotNotes(req: Request): string[] {
  const out: string[] = [];
  const want = 2 * (SLOTS_PER_LEVEL[req.level] / 10);
  const reversed = req.slots.filter((s) => s.reverse).length;
  if (req.slots.length && reversed < want) out.push(`only ${plural(reversed, 'reversed (!) question')}; ${want} catch yes-bias → mark ${want - reversed} more with !`);
  const openings = new Map<string, number>();
  for (const s of req.slots) {
    const words = s.text.toLowerCase().split(/\s+/).slice(0, 3);
    if (words.length < 3) continue;
    const key = words.join(' ');
    const first = openings.get(key);
    if (first !== undefined) out.push(`${first} and ${s.pos} open the same way; they may ask the same thing`);
    else openings.set(key, s.pos);
  }
  return out;
}

export function validate(req: Request, implemented: readonly Verb[]): Validation {
  const stops = [...checkEnvelope(req, implemented), ...checkSlots(req), ...checkPrimitives(req)];
  const notes: string[] = [];
  if (!req.perspective) notes.push('no perspective; recorded as "agent"');
  notes.push(...slotNotes(req));
  const risky = IRREVERSIBLE.exec(`${req.focus} ${req.problem} ${req.tags.join(' ')}`);
  if (risky && req.level < 3) notes.push(`${IRREVERSIBLE_NOTE_PREFIX} ("${risky[0].toLowerCase()}"); consider L3 and don't act on this alone`);
  return { stops, notes };
}
