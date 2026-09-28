/**
 * The request schema (skills/sidewise/references/request.schema.json), checked by hand so the runtime needs no
 * schema library. Each check mirrors one schema rule, worded as a help-first stop; test/contract/
 * schema-agreement.test.ts proves the two agree on a corpus (these checks find nothing exactly when the schema
 * accepts). Rules the schema can't express (counts, per-section kind restrictions) live in validate.ts, same
 * split as before plan 2b: this file is shape only.
 */
import { clip } from '../util/text.ts';
import { DEPTHS, FAMILIES, VERBS, type Stop, type Verb } from './types.ts';
import {
  CHAIN_RE,
  closedValues,
  isCustomKey,
  MAX_CUSTOM_KEY_LEN,
  MAX_FREETEXT_LEN,
  MAX_TOUCH_LEN,
  MAX_WISE_LINES,
  WISE_FIELDS,
  WISE_KEYS,
  WISE_PARENT_KEY,
  type WiseField,
} from './wise-fields.ts';

const TAG = /^[a-z0-9]+(-[a-z0-9]+)*$/u;
const RUN_ID = /^SW-\d{4,}$/u;
const PATH = /^[^\s:]+(:\d+(-\d+)?)?$/u;
const QNUM = /^[1-9][0-9]*$/u;
const SIDE_KEYS = ['goal', 'depth', 'where', 'parent', 'ask', 'over', 'from', 'compare', 'verb', 'expect'];
const CATEGORY_KEYS = ['pass', 'need', 'tags', 'family'];
const SECTION_NAMES = ['concerns', 'decisions'];
const NOT_QUESTIONS = /^(yes|no|true|false|on|off|y|n)$/iu;

type Obj = Record<string, unknown>;
export const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
/** JSON Schema counts characters as code points, not UTF-16 units. */
const len = (s: string): number => [...s].length;
const show = (v: unknown): string => clip(typeof v === 'string' ? `"${v}"` : (JSON.stringify(v) ?? String(v)), 40);
const list = (xs: readonly string[]): string => `${xs.slice(0, -1).join(', ')} or ${xs.at(-1)}`;
const isTag = (k: string): boolean => TAG.test(k) && len(k) <= 20;

class Out {
  readonly stops: Stop[] = [];
  add(field: string, problem: string, fix: string): void {
    this.stops.push({ cls: 'schema', text: `✖ ${field}: ${problem} → ${fix}` });
  }
}

/** Shared with help/rules.ts so the documented cap and the enforced one can't drift apart (round-4 finding:
 *  a cold agent hit this stop with zero prior warning in `agent view`/`agent probe`). */
export const MAX_QUESTION_CHARS = 160;

function lineProblem(v: unknown): string | undefined {
  if (typeof v !== 'string') return `${show(v)} is not text`;
  if (v.includes('\n')) return 'has a line break';
  if (len(v) < 3) return 'is too short';
  if (len(v) > MAX_QUESTION_CHARS) return `is longer than ${MAX_QUESTION_CHARS} characters`;
  return undefined;
}

function checkTagKeys(o: Obj, field: string, what: string, out: Out): void {
  for (const k of Object.keys(o)) {
    if (!isTag(k)) out.add(`${field}.${k}`, `"${clip(k, 30)}" is not a ${what} name`, 'use lowercase letters and digits, one word or kebab-case, ≤ 20 characters');
  }
}

function checkStringList(v: unknown, field: string, noun: string, min: number, max: number, out: Out): void {
  if (!Array.isArray(v)) return out.add(field, `${noun} must be a list`, `write [a, b]`);
  if (v.length < min || v.length > max) out.add(field, `${v.length} ${noun}`, `give ${min}–${max}`);
  const bad = v.find((x) => typeof x !== 'string');
  if (bad !== undefined) out.add(field, `${show(bad)} is not text`, `quote it: "${String(bad)}"`);
  if (new Set(v.map((x) => JSON.stringify(x))).size !== v.length) out.add(field, `repeated ${noun}`, 'make each one different');
}

function checkQuestion(v: unknown, n: string, out: Out): void {
  const field = `question ${n}`;
  if (typeof v === 'string') {
    if (NOT_QUESTIONS.test(v.trim())) return out.add(field, 'is not a question', 'write it as text');
    const bad = lineProblem(v);
    if (bad) return out.add(field, bad, 'ask one short thing on one line');
    if (!v.endsWith('?')) return out.add(field, `doesn't end in "?"`, 'put it in quotes');
    return;
  }
  if (!isObj(v)) return out.add(field, 'is not a question', 'write it as text');
  const kind = 'scale' in v ? 'scale' : 'choice' in v ? 'choice' : undefined;
  if (!kind || ('scale' in v && 'choice' in v)) {
    return out.add(field, 'is not a question', 'write "N: <question>?", or scale: + levels:, or choice: + options:');
  }
  const listKey = kind === 'scale' ? 'levels' : 'options';
  for (const k of Object.keys(v)) {
    if (k !== kind && k !== listKey) out.add(field, `unknown key "${clip(k, 20)}"`, `a ${kind} has only ${kind}: and ${listKey}:`);
  }
  const bad = lineProblem(v[kind]);
  if (bad) out.add(field, `the ${kind} ${bad}`, 'ask one short thing on one line');
  if (!(listKey in v)) return out.add(field, `a ${kind} needs ${listKey}:`, `add ${listKey}: [a, b]`);
  checkStringList(v[listKey], field, listKey, 2, kind === 'scale' ? 10 : 8, out);
}

function checkCategory(v: Obj, field: string, out: Out): void {
  const pass = v.pass;
  const passOk =
    typeof pass === 'boolean' || pass === 'yes' || pass === 'no' || (Array.isArray(pass) && pass.length >= 1 && pass.every((x) => typeof x === 'string'));
  if (!passOk) out.add(`${field}.pass`, `${show(pass)}`, 'use yes, no, or a list of the passing levels or options');
  if ('need' in v && !['all', 'most', 'any'].includes(v.need as string)) out.add(`${field}.need`, `${show(v.need)}`, 'use all, most or any');
  if ('tags' in v) {
    const t = v.tags;
    if (!Array.isArray(t) || t.length > 3 || !t.every((x) => typeof x === 'string' && isTag(x))) {
      out.add(`${field}.tags`, `${show(t)}`, 'give up to 3 tags, lowercase kebab-case, ≤ 20 characters');
    }
  }
  if ('family' in v && !(FAMILIES as readonly unknown[]).includes(v.family)) out.add(`${field}.family`, show(v.family), `use ${list(FAMILIES)}`);
  for (const [k, q] of Object.entries(v)) {
    if (CATEGORY_KEYS.includes(k)) continue;
    if (!QNUM.test(k)) {
      out.add(`${field}.${clip(k, 20)}`, 'not a question number or category key', /^0+$/u.test(k) ? 'number questions from 1' : 'a category holds pass, need, tags, family and numbered questions');
      continue;
    }
    checkQuestion(q, k, out);
  }
}

function checkCategoriesMap(categories: unknown, field: string, out: Out): void {
  if (!isObj(categories)) return out.add(field, 'is not a mapping', 'give each category pass: and numbered questions');
  if (Object.keys(categories).length === 0) return out.add(field, 'is empty', 'add a category with pass: and numbered questions');
  checkTagKeys(categories, field, 'category', out);
  for (const [name, c] of Object.entries(categories)) {
    const cfield = `${field}.${clip(name, 20)}`;
    if (!isObj(c) || !('pass' in c)) out.add(cfield, 'is not a category', 'give it pass: and numbered questions');
    else checkCategory(c, cfield, out);
  }
}

/** concerns:/decisions: under ask (one subject) or under a layer (a sweep) — both optional at this shape
 *  level; validate.ts's cross-check enforces which verb needs what, and the exact counts. */
function checkSectionsBlock(v: Record<string, unknown>, field: string, out: Out): void {
  for (const k of Object.keys(v)) {
    if (!SECTION_NAMES.includes(k)) out.add(`${field}.${clip(k, 20)}`, 'not concerns or decisions', 'use concerns: or decisions:');
  }
  if ('concerns' in v) checkCategoriesMap(v.concerns, `${field}.concerns`, out);
  if ('decisions' in v) checkCategoriesMap(v.decisions, `${field}.decisions`, out);
}

/** side.ask: one subject is {concerns:, decisions:} straight under ask; a sweep keys those by layer instead
 *  (ask: {<layer>: {concerns:, decisions:}}). A legacy flat category directly under ask (plan 2a's shape, no
 *  concerns:/decisions: wrapper) is refused outright — nothing is published on the old contract yet. */
function checkAsk(ask: unknown, verb: Verb | undefined, out: Out): void {
  const templateHint = `sidewise template ${verb ?? '<verb>'}`;
  if (!isObj(ask)) return out.add('side.ask', 'is not a mapping', `add concerns: and decisions: (${templateHint})`);
  if (Object.keys(ask).length === 0) return out.add('side.ask', 'is empty', `add concerns: and decisions: (${templateHint})`);

  if ('concerns' in ask || 'decisions' in ask) {
    checkSectionsBlock(ask, 'side.ask', out);
    return;
  }

  const looksFlat = Object.values(ask).some((v) => isObj(v) && 'pass' in v);
  if (looksFlat) return out.add('side.ask', 'put categories under concerns: (yes/no) and decisions: (scale/choice)', templateHint);

  checkTagKeys(ask, 'side.ask', 'layer', out);
  for (const [layer, v] of Object.entries(ask)) {
    const field = `side.ask.${clip(layer, 20)}`;
    if (layer === 'concerns' || layer === 'decisions') {
      out.add(field, '"concerns"/"decisions" are reserved for ask sections', 'use a different layer name');
      continue;
    }
    if (!isObj(v) || Object.keys(v).length === 0) {
      out.add(field, 'is empty', 'give it concerns: and/or decisions:');
      continue;
    }
    checkSectionsBlock(v, field, out);
  }
}

function checkOverShape(over: unknown, out: Out): void {
  if (!isObj(over) || Object.keys(over).length === 0) return out.add('side.over', 'is not a mapping of layers', 'write over: with a layer name and its items, e.g. part: [a, b]');
  checkTagKeys(over, 'side.over', 'layer', out);
  for (const [layer, v] of Object.entries(over)) {
    if (layer === 'concerns' || layer === 'decisions') out.add(`side.over.${layer}`, '"concerns"/"decisions" are reserved for ask sections', 'use a different layer name');
    if (typeof v === 'string') continue;
    if (!Array.isArray(v)) out.add(`side.over.${clip(layer, 20)}`, 'is not a list or a pattern', 'write a list of items, a file pattern, or each');
    else if (v.length < 1 || v.length > 30) out.add(`side.over.${clip(layer, 20)}`, `${v.length} items`, 'give 1–30 items');
  }
}

function checkTouches(v: unknown, out: Out): void {
  if (!Array.isArray(v)) return out.add('wise.touches', 'must be a list', 'write [a, b]');
  if (v.length > 5) out.add('wise.touches', `${v.length} entries`, 'give up to 5');
  v.forEach((x, i) => {
    if (typeof x !== 'string' || x.includes('\n') || len(x) < 1 || len(x) > MAX_TOUCH_LEN) {
      out.add(`wise.touches[${i}]`, show(x), `each entry is 1–${MAX_TOUCH_LEN} characters, one line`);
    }
  });
}

/** wise.uses: a single chain string, or a list of up to 5 (plan 2c: "a single string is accepted as a 1-item
 *  list"). Each entry must match the C4 chain grammar (wise-fields.ts's CHAIN_RE). Returns the parsed chains
 *  (as given, normalized to a list) for validate.ts's own orphan-code-part note check, or undefined on any stop. */
function checkUses(v: unknown, out: Out): string[] | undefined {
  const list = typeof v === 'string' ? [v] : v;
  if (!Array.isArray(list)) return void out.add('wise.uses', show(v), 'write a level:name chain, e.g. container:api -> component:dao');
  if (list.length < 1 || list.length > 5) {
    out.add('wise.uses', `${list.length} chains`, 'give 1–5');
    return undefined;
  }
  let ok = true;
  list.forEach((x, i) => {
    const field = typeof v === 'string' ? 'wise.uses' : `wise.uses[${i}]`;
    if (typeof x !== 'string') {
      out.add(field, show(x), 'write level:name, e.g. container:web-app');
      ok = false;
    } else if (len(x) > MAX_FREETEXT_LEN) {
      out.add(field, `is longer than ${MAX_FREETEXT_LEN} characters`, 'shorten the chain');
      ok = false;
    } else if (!CHAIN_RE.test(x)) {
      out.add(field, show(x), 'write level:name, e.g. container:web-app');
      ok = false;
    }
  });
  return ok ? (list as string[]) : undefined;
}

/** why/stage/change/risk/blast: value must be in the field's own enum, or the literal "unknown" (plan 2c: valid
 *  in every closed field). */
function checkClosedSingle(field: WiseField, v: unknown, out: Out): void {
  const allowed = closedValues(field);
  if (!(allowed as readonly unknown[]).includes(v)) out.add(`wise.${field.key}`, show(v), `use ${list(field.values!)}`);
}

/** area: a single value, or a list of up to `maxList` (plan 2c: single or list ≤2), each one of AREAS or
 *  "unknown". */
function checkClosedList(field: WiseField, v: unknown, out: Out): void {
  const allowed = closedValues(field);
  if (Array.isArray(v) && (v.length < 1 || v.length > (field.maxList ?? Infinity))) {
    out.add(`wise.${field.key}`, show(v), `one value or a list of ≤${field.maxList}: [${field.values!.slice(0, field.maxList).join(', ')}]`);
    return;
  }
  const entries = Array.isArray(v) ? v : [v];
  const bad = entries.find((x) => !(allowed as readonly unknown[]).includes(x));
  if (bad !== undefined) out.add(`wise.${field.key}`, show(v), `use ${list(field.values!)}, or a list of ≤${field.maxList}`);
}

function checkSide(side: unknown, verb: Verb | undefined, out: Out): void {
  if (!isObj(side)) return out.add('side', 'is not a mapping', 'put goal: and the other fields under side:');
  for (const k of Object.keys(side)) {
    if (!SIDE_KEYS.includes(k)) out.add(`side.${clip(k, 20)}`, 'not a field', `use ${list(SIDE_KEYS)}`);
  }
  if (!('goal' in side)) out.add('side.goal', 'missing', 'add one line: what you want to be true');
  else {
    const bad = lineProblem(side.goal);
    if (bad) out.add('side.goal', bad, 'write one line of 3–160 characters: what you want to be true');
  }
  if ('depth' in side && !(DEPTHS as readonly unknown[]).includes(side.depth)) out.add('side.depth', show(side.depth), `use ${list(DEPTHS)}`);
  if ('where' in side) {
    const w = side.where;
    if (!Array.isArray(w) || w.length < 1 || w.length > 5) out.add('side.where', 'needs 1–5 paths', 'write where: [path/to/file.ts]');
    else for (const p of w) if (typeof p !== 'string' || !PATH.test(p)) out.add('side.where', `${show(p)} is not a path`, 'use a project path, optionally :start-end, with no spaces');
  }
  if ('parent' in side && !(typeof side.parent === 'string' && RUN_ID.test(side.parent))) out.add('side.parent', `${show(side.parent)} is not a run id`, 'use SW-####');
  if ('from' in side && !(typeof side.from === 'string' && len(side.from) >= 1 && len(side.from) <= 200)) out.add('side.from', show(side.from), 'name an item id or a category of the parent run');
  if ('compare' in side) {
    const c = side.compare;
    const ok = isObj(c) && typeof c.before === 'string' && typeof c.after === 'string' && Object.keys(c).every((k) => k === 'before' || k === 'after');
    if (!ok) out.add('side.compare', show(c), 'write compare: {before: main, after: HEAD}');
  }
  if ('expect' in side) {
    const e = side.expect;
    if (e === 'none') {
      // plan 2c N4: "none" predicts no flips at all — any flip is reported as unexpected:.
    } else if (!Array.isArray(e) || e.length < 1 || e.length > 9 || !e.every((x) => typeof x === 'string' && isTag(x))) {
      out.add('side.expect', show(e), 'give 1–9 concern names, lowercase kebab-case, ≤ 20 characters, or the word "none"');
    } else if (new Set(e).size !== e.length) {
      out.add('side.expect', 'repeated concern name', 'make each one different');
    }
  }
  if ('verb' in side && !(VERBS as readonly unknown[]).includes(side.verb)) out.add('side.verb', show(side.verb), `use ${list(VERBS)}, or leave it out`);
  if ('ask' in side) checkAsk(side.ask, verb, out);
  if ('over' in side) checkOverShape(side.over, out);
}

/** Every catalog field, dispatched by kind — the single place that decides which checker a field's value goes
 *  through, generated from wise-fields.ts's WISE_FIELDS table (plan 2c A4: "schema check, validator, card and
 *  stops are generated" from one module). `parent` isn't in WISE_FIELDS (it's an alias of side.parent, a run id,
 *  not a catalog value) and keeps its own check below, same as before. */
function checkWiseField(field: WiseField, v: unknown, out: Out): void {
  switch (field.kind) {
    case 'closed-single':
      checkClosedSingle(field, v, out);
      return;
    case 'closed-list':
      checkClosedList(field, v, out);
      return;
    case 'freetext': {
      const bad = lineProblem(v);
      if (bad) out.add(`wise.${field.key}`, bad, "write one line of 3–160 characters: what you're solving now");
      return;
    }
    case 'chain-list':
      checkUses(v, out);
      return;
    case 'freetext-list':
      checkTouches(v, out);
      return;
  }
}

/** Any wise key beyond the catalog and `parent`: accepted when it's a valid lower-kebab key (≤20 chars) whose
 *  value is one line ≤160, or a list of ≤5 such lines — recorded as-is, no further checking (plan 2c A4's
 *  "custom keys"). A malformed key (not kebab-case, too long, uppercase) still gets the old "not a field" stop. */
/** A key that isn't in the catalog and isn't shaped like a valid custom key (not lower-kebab, or over the
 *  length cap) — the old "not a field" stop. */
function checkUnknownWiseKey(k: string, out: Out): void {
  out.add(`wise.${clip(k, 20)}`, 'not a field', `use ${list(WISE_KEYS)}, or a lower-kebab key ≤${MAX_CUSTOM_KEY_LEN} characters`);
}

/** A validly-shaped custom key's own value: one line ≤160, or a list of ≤5 such lines, recorded as-is. */
function checkCustomWiseValue(k: string, v: unknown, out: Out): void {
  if (Array.isArray(v) && (v.length < 1 || v.length > 5)) return out.add(`wise.${k}`, `${v.length} entries`, 'give 1–5');
  const entries = Array.isArray(v) ? v : [v];
  const bad = entries.find((x) => typeof x !== 'string' || x.includes('\n') || len(x) > MAX_FREETEXT_LEN);
  if (bad !== undefined) out.add(`wise.${k}`, show(bad), `write one line ≤${MAX_FREETEXT_LEN} characters, or a list of ≤5`);
}

/** The `wise:` block's own source-line count (raw YAML text, since a parsed value has already lost the
 *  formatting the cap is measured against — plan 2c A4: "count the source lines of the block"). Counted as: the
 *  top-level `wise:` line itself, plus every following line up to (not including) the next column-0 key or EOF —
 *  blank lines inside the block count too (an agent padding the block with blank lines still uses up its cap).
 *  `undefined` when the request has no top-level `wise:` line at all (nothing to cap). */
export function wiseBlockLineCount(rawText: string | undefined): number | undefined {
  if (!rawText) return undefined;
  const lines = rawText.split(/\r?\n/u);
  const start = lines.findIndex((l) => /^wise\s*:/u.test(l));
  if (start === -1) return undefined;
  let count = 1;
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.trim() !== '' && !/^\s/u.test(line)) break; // next column-0 key
    count++;
  }
  return count;
}

function checkWise(wise: unknown, out: Out, rawText?: string): void {
  if (!isObj(wise)) return out.add('wise', 'is not a mapping', 'write why:, area: or parent: under wise:, or leave wise out');
  const byKey = new Map(WISE_FIELDS.map((f) => [f.key, f]));
  const isKnown = (k: string): boolean => k === WISE_PARENT_KEY || byKey.has(k);
  // Pass 1: every genuinely unrecognized key (old behavior: these stops come first, regardless of where the
  // key sits in the object — same discipline as the old blanket "for k of keys" pass this replaces).
  for (const k of Object.keys(wise)) if (!isKnown(k) && !isCustomKey(k)) checkUnknownWiseKey(k, out);
  // Pass 2: every catalog field present, in the table's own order (not object insertion order) — stable output.
  for (const f of WISE_FIELDS) if (f.key in wise) checkWiseField(f, wise[f.key], out);
  if (WISE_PARENT_KEY in wise && !(typeof wise[WISE_PARENT_KEY] === 'string' && RUN_ID.test(wise[WISE_PARENT_KEY] as string))) {
    out.add(`wise.${WISE_PARENT_KEY}`, `${show(wise[WISE_PARENT_KEY])} is not a run id`, 'use SW-####');
  }
  // Pass 3: every validly-shaped custom key's own value.
  for (const [k, v] of Object.entries(wise)) if (!isKnown(k) && isCustomKey(k)) checkCustomWiseValue(k, v, out);
  const lineCount = wiseBlockLineCount(rawText);
  if (lineCount !== undefined && lineCount > MAX_WISE_LINES) {
    out.add('wise', `${lineCount} lines`, `the wise block is capped at ${MAX_WISE_LINES} lines`);
  }
}

/** Every schema violation in a parsed request, as schema-class stops. Empty when the schema accepts it.
 *  `verb` is used only to word the flat-ask/empty-ask fix text ("sidewise template <verb>"); every other check
 *  here is verb-agnostic, matching the published schema (which has no concept of verb either). `rawText`: the
 *  original request text, threaded through only so checkWise can count the wise: block's own SOURCE lines
 *  (plan 2c A4's ≤25-line cap) — a parsed value has already lost the formatting that cap is measured against. */
export function checkSchema(value: unknown, verb?: Verb, rawText?: string): Stop[] {
  const out = new Out();
  if (!isObj(value)) {
    out.add('request', 'is not a mapping', 'start with side:');
    return out.stops;
  }
  for (const k of Object.keys(value)) {
    if (k !== 'side' && k !== 'wise') out.add(clip(k, 20), 'not a block', 'the request holds only side: and wise:; put fields under side:');
  }
  if (!('side' in value)) out.add('side', 'missing', 'start with side: and a goal');
  else checkSide(value.side, verb, out);
  if ('wise' in value) checkWise(value.wise, out, rawText);
  return out.stops;
}
