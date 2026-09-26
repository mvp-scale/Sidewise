/**
 * Help-first validation of a parsed request (every stop says what to change). Three passes, each reported on
 * its own so an agent fixes one kind of thing at a time:
 *   1. ____ blanks left from a template (sidewise template <verb>);
 *   2. the schema (schema-check.ts mirrors request.schema.json);
 *   3. the rules the schema can't express: the verb's own fields, numbering, one kind per category, depth,
 *      layers and {blanks}.
 * A problem that only weakens the answer is a note, never a stop.
 */
import { clip } from '../util/text.ts';
import { blanksIn, checkOver, mapLayers, type StringRule } from './layers.ts';
import { checkSchema, isObj } from './schema-check.ts';
import { DEPTH_COUNT, MAX_EXTRAS, type Category, type Depth, type Layer, type Question, type Request, type Side, type Stop, type Verb, type Wise } from './types.ts';

export type Validated = { ok: true; request: Request; notes: string[] } | { ok: false; stops: Stop[] };

type Field = 'depth' | 'where' | 'ask' | 'parent' | 'compare' | 'over' | 'from';

const NEEDS: Record<Verb, Field[]> = {
  class: ['depth', 'where', 'ask'],
  view: ['where'],
  change: ['parent', 'compare'],
  scan: ['depth', 'over', 'ask'],
  loop: ['depth', 'over', 'ask'],
  drill: ['parent', 'from', 'ask'],
};

const NEVER: Record<Verb, Field[]> = {
  class: ['over', 'from', 'compare', 'parent'],
  view: ['over', 'from', 'compare', 'parent'],
  change: ['ask', 'over', 'from', 'where', 'depth'],
  scan: ['where', 'from', 'compare', 'parent'],
  loop: ['from', 'compare', 'parent'],
  drill: ['compare', 'where'],
};

const STRINGS: Record<Verb, StringRule> = { scan: 'scan', drill: 'each-only', loop: 'none', class: 'none', view: 'none', change: 'none' };

/** Keys the response uses beside the categories: a category can't share one. */
const RESERVED = ['id', 'gate', 'goal', 'consensus', 'escalate', 'regressed', 'failing', 'passing', 'scanned', 'reused', 'view', 'reuse', 'runs', 'categories'];

export const IRREVERSIBLE = /\b(delete|deploy|drop|pay|payment|migrat\w*|secret|credential)s?\b/iu;
export const IRREVERSIBLE_NOTE = "looks irreversible; don't act on this alone";

function how(field: Field, verb: Verb): string {
  const sweep = verb === 'scan' || verb === 'loop' || verb === 'drill';
  switch (field) {
    case 'depth':
      return sweep ? 'add "depth: quick" (at most 10 items asked per layer; standard 20, thorough 30)' : 'add "depth: quick" (10 yes/no questions; standard 20, thorough 30)';
    case 'where':
      return 'add "where: [path/to/file.ts]"';
    case 'ask':
      return `add ask: with a category, its pass: and numbered questions (sidewise template ${verb})`;
    case 'parent':
      return 'add "parent: SW-####" (the run this builds on)';
    case 'compare':
      return 'add "compare: {before: main, after: HEAD}"';
    case 'over':
      return `add over: with the layers to sweep (sidewise template ${verb})`;
    case 'from':
      return 'add "from: <an item id or a category of the parent run>"';
  }
}

function never(field: Field, verb: Verb): string {
  if (verb === 'change' && field === 'ask') return "✖ side.ask: change replays the parent's questions → remove ask; for new questions, use class";
  if (field === 'parent') return '✖ side.parent: only drill and change build on a parent → move it to wise.parent (lineage)';
  if (field === 'over') return `✖ side.over: ${verb} asks about one subject → remove over, or use loop or scan to sweep`;
  if (field === 'where' && verb === 'scan') return '✖ side.where: scan reads the files in over → remove where';
  if (field === 'where') return `✖ side.where: ${verb} reads the parent run's code → remove where`;
  return `✖ side.${field}: ${verb} doesn't take it → remove it`;
}

const cross = (text: string): Stop => ({ cls: 'cross', text });

/** Pass 1: any ____ left from a template. */
function findBlanks(v: unknown, path: string, out: Stop[]): void {
  const label = (p: string): string => {
    const q = /^side\.ask\..*\.(\d+)$/u.exec(p);
    return q ? `question ${q[1]}` : p;
  };
  if (typeof v === 'string') {
    if (v.includes('____')) out.push(cross(`✖ ${label(path)}: still a ____ blank → fill it in`));
    return;
  }
  if (Array.isArray(v)) {
    v.forEach((x, i) => findBlanks(x, `${path}[${i}]`, out));
    return;
  }
  if (isObj(v)) {
    for (const [k, x] of Object.entries(v)) {
      const p = path ? `${path}.${k}` : k;
      if (k.includes('____')) out.push(cross(`✖ ${label(p)}: still a ____ blank → fill it in`));
      else findBlanks(x, p, out);
    }
  }
}

function toQuestion(n: number, raw: unknown): Question {
  if (typeof raw === 'string') return { n, kind: 'yesno', text: raw };
  const o = raw as Record<string, unknown>;
  if ('scale' in o) return { n, kind: 'scale', text: o.scale as string, levels: o.levels as string[] };
  return { n, kind: 'choice', text: o.choice as string, options: o.options as string[] };
}

function toCategory(name: string, raw: Record<string, unknown>): Category {
  const pass = raw.pass === true ? 'yes' : raw.pass === false ? 'no' : (raw.pass as Category['pass']);
  const questions = Object.entries(raw)
    .filter(([k]) => /^[1-9][0-9]*$/u.test(k))
    .map(([k, q]) => toQuestion(Number(k), q))
    .sort((a, b) => a.n - b.n);
  return { name, pass, need: (raw.need as Category['need']) ?? 'all', tags: (raw.tags as string[]) ?? [], questions };
}

/** One kind of question per category, and a pass that fits that kind. */
function checkCategory(c: Category, field: string, out: Stop[]): void {
  const kinds = new Set(c.questions.map((q) => q.kind));
  if (c.questions.length === 0) out.push(cross(`✖ ${field}: no questions → add at least one numbered question`));
  if (RESERVED.includes(c.name)) out.push(cross(`✖ ${field}: "${c.name}" is a word the answer uses → rename the category`));
  if (kinds.size > 1) {
    out.push(cross(`✖ ${field}: mixes ${[...kinds].map((k) => (k === 'yesno' ? 'yes/no' : k)).join(' and ')} questions → one kind per category`));
    return;
  }
  const kind = [...kinds][0];
  if (kind === 'yesno' && Array.isArray(c.pass)) out.push(cross(`✖ ${field}.pass: a list is for scale or choice questions → use yes or no`));
  if (kind && kind !== 'yesno') {
    if (!Array.isArray(c.pass)) {
      out.push(cross(`✖ ${field}.pass: ${kind} questions need the passing ${kind === 'scale' ? 'levels' : 'options'} → e.g. pass: [none, low]`));
      return;
    }
    for (const q of c.questions) {
      const allowed = q.kind === 'scale' ? q.levels : q.kind === 'choice' ? q.options : [];
      const unknown = c.pass.find((p) => !allowed.includes(p));
      if (unknown !== undefined) {
        out.push(cross(`✖ ${field}.pass: "${clip(unknown, 20)}" is not ${q.kind === 'scale' ? 'a level' : 'an option'} of question ${q.n} → use some of ${allowed.join(', ')}`));
      }
    }
  }
}

function checkNumbers(categories: readonly Category[], out: Stop[]): void {
  const seen = new Set<number>();
  for (const n of categories.flatMap((c) => c.questions.map((q) => q.n))) {
    if (seen.has(n)) out.push(cross(`✖ question ${n}: numbered twice → give each question its own number`));
    seen.add(n);
  }
  const sorted = [...seen].sort((a, b) => a - b);
  if (sorted.some((n, i) => n !== i + 1)) out.push(cross(`✖ question numbers: ${clip(sorted.join(' '), 60)} → number them 1…${sorted.length} with no gaps`));
  const extras = categories.flatMap((c) => c.questions).filter((q) => q.kind !== 'yesno').length;
  if (extras > MAX_EXTRAS) out.push(cross(`✖ side.ask: ${extras} scale/choice questions → at most ${MAX_EXTRAS}`));
}

/** Pass 3: the rules the schema can't express. Returns the normalized side when there are none. */
function checkCross(raw: Record<string, unknown>, verb: Verb): { stops: Stop[]; side?: Side } {
  const out: Stop[] = [];
  const side = raw.side as Record<string, unknown>;
  if (side.verb !== undefined && side.verb !== verb) out.push(cross(`✖ side.verb: says "${side.verb}" but you ran ${verb} → remove side.verb, or run sidewise ${side.verb}`));
  for (const f of NEEDS[verb]) if (!(f in side)) out.push(cross(`✖ side.${f}: ${verb} needs it → ${how(f, verb)}`));
  for (const f of NEVER[verb]) if (f in side) out.push(cross(never(f, verb)));

  const over = side.over as Record<string, unknown> | undefined;
  const ask = (side.ask ?? {}) as Record<string, Record<string, unknown>>;
  const depth = side.depth as Depth | undefined;
  const categories: Category[] = [];
  const layers: Layer[] = [];

  if (over === undefined) {
    for (const [name, v] of Object.entries(ask)) {
      if (!('pass' in v)) {
        out.push(cross(`✖ side.ask.${name}: categories go straight under ask for one subject → give ${name} a pass:, or add over: to sweep`));
        continue;
      }
      const c = toCategory(name, v);
      checkCategory(c, `side.ask.${name}`, out);
      categories.push(c);
      for (const q of c.questions) {
        const b = blanksIn(q.text)[0];
        if (b !== undefined && verb !== 'drill') out.push(cross(`✖ question ${q.n}: {${b}} has nothing to fill it → blanks are for sweeps (over:); write the name out`));
      }
    }
    checkNumbers(categories, out);
    const yesno = categories.flatMap((c) => c.questions).filter((q) => q.kind === 'yesno').length;
    if (verb === 'class' && depth) {
      const want = DEPTH_COUNT[depth];
      if (yesno < want) out.push(cross(`✖ side.depth: ${depth} needs ${want} yes/no questions, got ${yesno} → add ${want - yesno}`));
      if (yesno > want) out.push(cross(`✖ side.depth: ${depth} needs ${want} yes/no questions, got ${yesno} → remove ${yesno - want}, or raise the depth`));
    }
  } else {
    for (const p of checkOver(over, STRINGS[verb], DEPTH_COUNT[depth ?? 'quick'])) out.push(cross(p));
    const map = mapLayers(over);
    for (const [name, v] of Object.entries(ask)) {
      if ('pass' in v) {
        out.push(cross(`✖ side.ask.${name}: a sweep keys categories by layer → ask: {<layer>: {${name}: ...}}`));
        continue;
      }
      if (!map.layers.includes(name)) {
        out.push(cross(`✖ side.ask.${name}: not a layer in over → use one of ${map.layers.join(', ')}`));
        continue;
      }
      const cats = Object.entries(v).map(([cname, c]) => toCategory(cname, c as Record<string, unknown>));
      const allowed = [name, ...(map.ancestors.get(name) ?? [])];
      for (const c of cats) {
        checkCategory(c, `side.ask.${name}.${c.name}`, out);
        for (const q of c.questions) {
          for (const b of blanksIn(q.text)) {
            // drill: a blank that is not one of its own layers may name a layer of the parent run (the verb checks it).
            if (!allowed.includes(b) && !(verb === 'drill' && !map.layers.includes(b))) {
              out.push(cross(`✖ question ${q.n}: {${b}} is not ${name}'s layer or above it → use ${allowed.map((a) => `{${a}}`).join(' or ')}`));
            }
          }
        }
      }
      layers.push({ name, categories: cats });
      categories.push(...cats);
    }
    checkNumbers(categories, out);
    layers.sort((a, b) => map.layers.indexOf(a.name) - map.layers.indexOf(b.name));
  }
  if (out.length) return { stops: out };
  return {
    stops: [],
    side: {
      ...(side.verb !== undefined ? { verb: side.verb as Verb } : {}),
      goal: side.goal as string,
      ...(depth ? { depth } : {}),
      where: (side.where as string[] | undefined) ?? [],
      ...(side.parent !== undefined ? { parent: side.parent as string } : {}),
      ...(side.from !== undefined ? { from: side.from as string } : {}),
      ...(side.compare !== undefined ? { compare: side.compare as { before: string; after: string } } : {}),
      categories: over === undefined ? categories : [],
      layers,
      ...(over !== undefined ? { over } : {}),
    },
  };
}

export function validateRequest(value: unknown, verb: Verb): Validated {
  const blanks: Stop[] = [];
  findBlanks(value, '', blanks);
  if (blanks.length) return { ok: false, stops: blanks };
  const schema = checkSchema(value);
  if (schema.length) return { ok: false, stops: schema };
  const raw = value as Record<string, unknown>;
  const { stops, side } = checkCross(raw, verb);
  if (!side) return { ok: false, stops };
  const notes: string[] = [];
  const risky = IRREVERSIBLE.exec(side.goal);
  if (risky) notes.push(`${IRREVERSIBLE_NOTE} ("${risky[0].toLowerCase()}")`);
  if (verb === 'view' && side.depth) {
    const yesno = side.categories.flatMap((c) => c.questions).filter((q) => q.kind === 'yesno').length;
    const want = DEPTH_COUNT[side.depth];
    if (yesno !== want) notes.push(`${side.depth} expects ${want} yes/no questions, got ${yesno}; class will stop on this`);
  }
  const w = raw.wise as Wise | undefined;
  return { ok: true, request: { side, wise: w && Object.keys(w).length ? w : null }, notes };
}
