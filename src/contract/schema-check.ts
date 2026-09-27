/**
 * The request schema (skills/sidewise/references/request.schema.json), checked by hand so the runtime needs no
 * schema library. Each check mirrors one schema rule, worded as a help-first stop; test/contract/
 * schema-agreement.test.ts proves the two agree on a corpus (these checks find nothing exactly when the schema
 * accepts). Rules the schema can't express live in validate.ts.
 */
import { clip } from '../util/text.ts';
import { AREAS, CHANGES, DEPTHS, RISKS, STAGES, VERBS, WHYS, type Stop } from './types.ts';

const TAG = /^[a-z0-9]+(-[a-z0-9]+)*$/u;
const RUN_ID = /^SW-\d{4,}$/u;
const PATH = /^[^\s:]+(:\d+(-\d+)?)?$/u;
const QNUM = /^[1-9][0-9]*$/u;
const SIDE_KEYS = ['goal', 'depth', 'where', 'parent', 'ask', 'over', 'from', 'compare', 'verb'];
const CATEGORY_KEYS = ['pass', 'need', 'tags'];
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

function lineProblem(v: unknown): string | undefined {
  if (typeof v !== 'string') return `${show(v)} is not text`;
  if (v.includes('\n')) return 'has a line break';
  if (len(v) < 3) return 'is too short';
  if (len(v) > 160) return 'is longer than 160 characters';
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
  for (const [k, q] of Object.entries(v)) {
    if (CATEGORY_KEYS.includes(k)) continue;
    if (!QNUM.test(k)) {
      out.add(`${field}.${clip(k, 20)}`, 'not a question number or category key', /^0+$/u.test(k) ? 'number questions from 1' : 'a category holds pass, need, tags and numbered questions');
      continue;
    }
    checkQuestion(q, k, out);
  }
}

function checkAsk(ask: unknown, out: Out): void {
  if (!isObj(ask)) return out.add('side.ask', 'is not a mapping', 'write categories under ask:, each with pass: and numbered questions');
  if (Object.keys(ask).length === 0) return out.add('side.ask', 'is empty', 'add a category with pass: and numbered questions');
  checkTagKeys(ask, 'side.ask', 'category or layer', out);
  for (const [name, v] of Object.entries(ask)) {
    const field = `side.ask.${clip(name, 20)}`;
    if (!isObj(v)) {
      out.add(field, 'is not a category', 'give it pass: and numbered questions');
      continue;
    }
    if ('pass' in v) {
      checkCategory(v, field, out);
      continue;
    }
    // No pass: a layer (a sweep), whose values are categories. A numbered key holding a question means a missing pass.
    if (Object.entries(v).some(([k, x]) => QNUM.test(k) && !isObj(x))) {
      out.add(field, 'has questions but no pass', 'add "pass: yes" or "pass: no"');
      continue;
    }
    if (Object.keys(v).length === 0) {
      out.add(field, 'is empty', 'give it pass: and numbered questions');
      continue;
    }
    checkTagKeys(v, field, 'category', out);
    for (const [cname, c] of Object.entries(v)) {
      const cfield = `${field}.${clip(cname, 20)}`;
      if (!isObj(c) || !('pass' in c)) out.add(cfield, 'is not a category', 'give it pass: and numbered questions');
      else checkCategory(c, cfield, out);
    }
  }
}

function checkOverShape(over: unknown, out: Out): void {
  if (!isObj(over) || Object.keys(over).length === 0) return out.add('side.over', 'is not a mapping of layers', 'write over: with a layer name and its items, e.g. part: [a, b]');
  checkTagKeys(over, 'side.over', 'layer', out);
  for (const [layer, v] of Object.entries(over)) {
    if (typeof v === 'string') continue;
    if (!Array.isArray(v)) out.add(`side.over.${clip(layer, 20)}`, 'is not a list or a pattern', 'write a list of items, a file pattern, or each');
    else if (v.length < 1 || v.length > 30) out.add(`side.over.${clip(layer, 20)}`, `${v.length} items`, 'give 1–30 items');
  }
}

function checkSide(side: unknown, out: Out): void {
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
  if ('verb' in side && !(VERBS as readonly unknown[]).includes(side.verb)) out.add('side.verb', show(side.verb), `use ${list(VERBS)}, or leave it out`);
  if ('ask' in side) checkAsk(side.ask, out);
  if ('over' in side) checkOverShape(side.over, out);
}

const WISE_KEYS = ['why', 'area', 'stage', 'change', 'risk', 'parent'];

function checkWise(wise: unknown, out: Out): void {
  if (!isObj(wise)) return out.add('wise', 'is not a mapping', 'write why:, area: or parent: under wise:, or leave wise out');
  for (const k of Object.keys(wise)) if (!WISE_KEYS.includes(k)) out.add(`wise.${clip(k, 20)}`, 'not a field', `use ${list(WISE_KEYS)}`);
  if ('why' in wise && !(WHYS as readonly unknown[]).includes(wise.why)) out.add('wise.why', show(wise.why), `use ${list(WHYS)}`);
  if ('area' in wise && !(AREAS as readonly unknown[]).includes(wise.area)) out.add('wise.area', show(wise.area), `use ${list(AREAS)}`);
  if ('stage' in wise && !(STAGES as readonly unknown[]).includes(wise.stage)) out.add('wise.stage', show(wise.stage), `use ${list(STAGES)}`);
  if ('change' in wise && !(CHANGES as readonly unknown[]).includes(wise.change)) out.add('wise.change', show(wise.change), `use ${list(CHANGES)}`);
  if ('risk' in wise && !(RISKS as readonly unknown[]).includes(wise.risk)) out.add('wise.risk', show(wise.risk), `use ${list(RISKS)}`);
  if ('parent' in wise && !(typeof wise.parent === 'string' && RUN_ID.test(wise.parent))) out.add('wise.parent', `${show(wise.parent)} is not a run id`, 'use SW-####');
}

/** Every schema violation in a parsed request, as schema-class stops. Empty when the schema accepts it. */
export function checkSchema(value: unknown): Stop[] {
  const out = new Out();
  if (!isObj(value)) {
    out.add('request', 'is not a mapping', 'start with side:');
    return out.stops;
  }
  for (const k of Object.keys(value)) {
    if (k !== 'side' && k !== 'wise') out.add(clip(k, 20), 'not a block', 'the request holds only side: and wise:; put fields under side:');
  }
  if (!('side' in value)) out.add('side', 'missing', 'start with side: and a goal');
  else checkSide(value.side, out);
  if ('wise' in value) checkWise(value.wise, out);
  return out.stops;
}
