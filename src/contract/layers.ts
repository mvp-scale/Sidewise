/**
 * Sweeps: the layers of `over` and their expansion into items (contract: scan, loop, drill).
 * A layer is a top-level key of `over`, or a key nested inside an item: `- name: x` plus child layers beside
 * it, or `- x: {child: [...]}`. Different items may have different child layers. Top-level keys after the
 * first form a chain: their value (`each`, or a file pattern) applies to every item of the layer before.
 * Item ids are the names joined by "/" (payments/refunds). Pure: a code layer (a pattern, `each`) becomes
 * items through a resolver the verb passes in.
 */
import { clip } from '../util/text.ts';
import { isObj } from './schema-check.ts';

export const MAX_LAYERS = 4;
/** A name an agent writes: 1–80 characters, no "/" (ids join names with it) and no "#" (question ids use it). */
const NAME = /^[^/#\n]{1,80}$/u;
const TAG = /^[a-z0-9]+(-[a-z0-9]+)*$/u;
export const BLANK = /\{([a-z0-9]+(?:-[a-z0-9]+)*)\}/gu;

export interface UnitRef {
  path: string;
  kind: 'file' | 'function' | 'call';
  name: string;
  /** "start-end", 1-based, inclusive. */
  lines: string;
}

export interface Item {
  id: string;
  layer: string;
  name: string;
  parent: string | null;
  /** Layer name → this item's name and its ancestors': fills the {blanks}. */
  fill: Record<string, string>;
  /** What the classifier reads for this item: its name (an idea) or its redacted code. */
  text: string;
  unit?: UnitRef;
}

export interface Resolved {
  name: string;
  text: string;
  unit?: UnitRef;
}

/** Turns a code layer ("src/*.ts", "each") into items under `parent` (null for the first layer). */
export type Resolver = (layer: string, spec: string, parent: Item | null) => Resolved[];

type Parsed = { name: string; children: Record<string, unknown> } | { problem: string };

/** One list entry → its name and child layers, or what is wrong with it. */
export function parseItem(raw: unknown): Parsed {
  if (typeof raw === 'string') return { name: raw.trim(), children: {} };
  if (typeof raw === 'number') return { name: String(raw), children: {} };
  if (isObj(raw)) {
    if ('name' in raw) {
      const { name, ...children } = raw;
      if (typeof name !== 'string' && typeof name !== 'number') return { problem: 'an item has a name: that is not text → write its name as text' };
      return { name: String(name).trim(), children };
    }
    const keys = Object.keys(raw);
    if (keys.length === 1) {
      const name = keys[0]!;
      const v = raw[name];
      if (v === null) return { name: name.trim(), children: {} };
      if (isObj(v)) return { name: name.trim(), children: v };
      return { problem: `"${clip(name, 30)}" has a value but no layer name → write "- name: ${clip(name, 30)}" and "<layer>: [...]"` };
    }
    return { problem: 'an item with several keys needs name: → write "- name: <item>" plus its child layers' };
  }
  return { problem: 'an item is empty or not text → write its name' };
}

export interface LayerMap {
  /** Every layer: the top-level keys in order, then nested ones as they are found. */
  layers: string[];
  /** The top-level keys in order. */
  chain: string[];
  /** Layer → every layer above it on some path. */
  ancestors: Map<string, Set<string>>;
  problems: string[];
}

export function mapLayers(over: Record<string, unknown>): LayerMap {
  const chain = Object.keys(over);
  const layers = [...chain];
  const ancestors = new Map<string, Set<string>>();
  const problems: string[] = [];
  const link = (child: string, parent: string | null): void => {
    const set = ancestors.get(child) ?? new Set<string>();
    ancestors.set(child, set);
    if (parent === null) return;
    set.add(parent);
    for (const a of ancestors.get(parent) ?? []) set.add(a);
  };
  chain.forEach((l, i) => link(l, i ? chain[i - 1]! : null));
  const walk = (layer: string, value: unknown): void => {
    if (!Array.isArray(value)) return;
    for (const raw of value) {
      const it = parseItem(raw);
      if ('problem' in it) continue;
      for (const [child, v] of Object.entries(it.children)) {
        if (chain.includes(child)) {
          problems.push(`✖ mak.over.${clip(child, 20)}: used at the top and inside "${clip(it.name, 30)}" → pick one`);
          continue;
        }
        if (!layers.includes(child)) layers.push(child);
        link(child, layer);
        walk(child, v);
      }
    }
  };
  for (const l of chain) walk(l, over[l]);
  if (layers.length > MAX_LAYERS) problems.push(`✖ mak.over: ${layers.length} layers → at most ${MAX_LAYERS}; split the request`);
  // "concerns"/"decisions" are reserved for ask's own sections (plan 2b): a layer named either would make
  // ask: {<layer>: {concerns:, decisions:}} ambiguous with ask's one-subject shape.
  for (const l of layers) if (l === 'concerns' || l === 'decisions') problems.push(`✖ mak.over.${l}: "${l}" is reserved for ask sections → use a different layer name`);
  return { layers, chain, ancestors, problems: [...new Set(problems)] };
}

/** What a string layer may be: scan starts with a file pattern; later layers (and drill's) may be "each". */
export type StringRule = 'scan' | 'each-only' | 'none';

/** The first layer, at any depth, written as a string ("each" or a pattern) rather than a list of items — or
 * null if every layer in `over` is a plain list. drill.ts uses this to tell an idea continuation (drilling a
 * loop item, which has no code to split with "each") from a code one (drilling a scan item), before it ever
 * calls a resolver — an idea item has no unit, so createCodeResolver has nothing to dispatch on. */
export function firstStringLayer(over: Record<string, unknown>): string | null {
  for (const [layer, v] of Object.entries(over)) {
    if (typeof v === 'string') return layer;
    if (!Array.isArray(v)) continue;
    for (const raw of v) {
      const it = parseItem(raw);
      if ('problem' in it) continue;
      const found = firstStringLayer(it.children);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Problems with the items as written: shape, names, duplicates, string layers, and more than `cap` listed
 * items in one layer. Code layers are counted later, by the verb (the cap there counts items asked).
 */
export function checkOver(over: Record<string, unknown>, rule: StringRule, cap: number): string[] {
  const { chain, problems } = mapLayers(over);
  const out = [...problems];
  const counts = new Map<string, number>();
  chain.forEach((layer, i) => {
    const v = over[layer];
    if (typeof v !== 'string') {
      if (i > 0) out.push(`✖ mak.over.${layer}: a list at the top applies to nothing → nest it under its parent items (- name: x, ${layer}: [...]), or use each`);
      return;
    }
    if (rule === 'none') out.push(`✖ mak.over.${layer}: loop sweeps ideas you list → write the items as a list; use scan for files`);
    else if (rule === 'scan' && i === 0 && v === 'each') out.push(`✖ mak.over.${layer}: scan needs a file pattern first → e.g. ${layer}: src/**/*.ts`);
    else if ((rule === 'each-only' || i > 0) && v !== 'each') out.push(`✖ mak.over.${layer}: "${clip(v, 30)}" → use each (we split the layer above)`);
    else if (rule === 'scan' && i === 0 && (v.startsWith('/') || v.split('/').includes('..'))) out.push(`✖ mak.over.${layer}: "${clip(v, 40)}" is outside the project → use a pattern inside it`);
  });
  if (rule === 'scan' && typeof over[chain[0]!] !== 'string') out.push(`✖ mak.over.${chain[0]}: scan needs a file pattern first → e.g. ${chain[0]}: src/**/*.ts`);
  const walk = (layer: string, value: unknown, under: string): void => {
    if (typeof value === 'string') return;
    if (!Array.isArray(value)) {
      out.push(`✖ mak.over.${layer}: under ${under}, ${layer} must be a list → ${layer}: [a, b]`);
      return;
    }
    counts.set(layer, (counts.get(layer) ?? 0) + value.length);
    const seen = new Set<string>();
    for (const raw of value) {
      const it = parseItem(raw);
      if ('problem' in it) {
        out.push(`✖ mak.over.${layer}: ${it.problem}`);
        continue;
      }
      if (!NAME.test(it.name)) out.push(`✖ mak.over.${layer}: item "${clip(it.name, 30)}" → names are 1–80 characters, without "/" or "#"`);
      if (seen.has(it.name)) out.push(`✖ mak.over.${layer}: "${clip(it.name, 30)}" twice under ${under} → give each item its own name`);
      seen.add(it.name);
      for (const [child, v] of Object.entries(it.children)) {
        if (!TAG.test(child) || child.length > 20) {
          out.push(`✖ mak.over.${layer}: under "${clip(it.name, 30)}", "${clip(child, 20)}" is not a layer name → lowercase, one word or kebab-case`);
          continue;
        }
        walk(child, v, `"${clip(it.name, 30)}"`);
      }
    }
  };
  for (const l of chain) walk(l, over[l], 'the top');
  for (const [layer, n] of counts) {
    if (n > cap) out.push(`✖ mak.over.${layer}: ${n} items → at most ${cap} per layer at this depth; raise depth or split the request`);
  }
  return [...new Set(out)];
}

export interface ExpandOptions {
  resolve?: Resolver;
  /** drill: the parent run's item the new layers hang under. Its id prefixes theirs; its fill carries down. */
  root?: Item | null;
}

/** The items, parents before children (so a layer's items keep the order they were written in). */
export function expand(over: Record<string, unknown>, opts: ExpandOptions = {}): { layers: string[]; items: Item[] } {
  const { layers, chain } = mapLayers(over);
  const items: Item[] = [];
  const add = (layer: string, value: unknown, parent: Item | null): void => {
    const entries: Array<Resolved & { children: Record<string, unknown> }> = [];
    if (typeof value === 'string') {
      if (!opts.resolve) throw new Error(`layer ${layer}: "${value}" needs a resolver`);
      for (const r of opts.resolve(layer, value, parent)) entries.push({ ...r, children: {} });
    } else if (Array.isArray(value)) {
      for (const raw of value) {
        const it = parseItem(raw);
        if (!('problem' in it)) entries.push({ name: it.name, text: it.name, children: it.children });
      }
    }
    const next = chain[chain.indexOf(layer) + 1];
    for (const e of entries) {
      const item: Item = {
        id: parent ? `${parent.id}/${e.name}` : e.name,
        layer,
        name: e.name,
        parent: parent?.id ?? null,
        fill: { ...(parent?.fill ?? {}), [layer]: e.name },
        text: e.text,
        ...(e.unit ? { unit: e.unit } : {}),
      };
      items.push(item);
      for (const [child, v] of Object.entries(e.children)) add(child, v, item);
      if (chain.includes(layer) && next !== undefined) add(next, over[next], item);
    }
  };
  add(chain[0]!, over[chain[0]!], opts.root ?? null);
  return { layers, items };
}

/** The {blanks} in a question. */
export function blanksIn(text: string): string[] {
  return [...text.matchAll(BLANK)].map((m) => m[1]!);
}

/** Fills {layer} blanks from an item's fill; an unknown blank is left as written (validation stops those). */
export function fillBlanks(text: string, fill: Record<string, string>): string {
  return text.replace(BLANK, (m, name: string) => fill[name] ?? m);
}
