/**
 * The mdl v2 field table (plan 2c A4): the single source every mdl-block consumer is generated from — the
 * schema check (schema-check.ts's checkMdl), the cross-validator (validate.ts), the `mm3 agent mdl`
 * legend card (help/agent.ts), and `mm3 help mdl` (help/topics.ts). One table, one place to add a field
 * or change a note, so none of those four views can quietly drift from each other. Plan 2c B1 makes this
 * config-aware: `effectiveMdlFields` below merges a project's `.mm3/config.yaml` `mdl: {...}` overrides
 * on top of MDL_FIELDS; every consumer that has a project now threads the EFFECTIVE table through instead of
 * importing MDL_FIELDS directly (a caller with no project, or one that omits the parameter, still gets exactly
 * today's built-in behavior — see each function's own optional `mdlFields` parameter).
 */
import type { MdlFieldOverride } from '../config/defaults.ts';
import { AREAS, BLASTS, CHANGES, RISKS, STAGES, WHYS, type Area, type Blast, type Change, type Risk, type Stage, type Why } from './types.ts';

/** `unknown` is always a legal value for a closed field, alongside its own enum (plan 2c: "fill what you know"). */
export const UNKNOWN_VALUE = 'unknown';

type MdlFieldKind = 'closed-single' | 'closed-list' | 'freetext' | 'chain-list' | 'freetext-list';

export interface MdlField {
  key: string;
  kind: MdlFieldKind;
  /** Closed fields only: the enum this field's value(s) must be one of (plus UNKNOWN_VALUE, always). */
  values?: readonly string[];
  /** List fields only (closed-list, chain-list, freetext-list): the max list length. */
  maxList?: number;
  /** The one-line doc note shown after the field in the card (e.g. area's "omit for whole-system questions..."). */
  note?: string;
  /** plan 2c B1 config override (`mdl.<key>.as`): an additional name a request may use for this field instead
   *  of (or alongside) its built-in `key` — both names validate identically and both are accepted in a request;
   *  only ever set by `effectiveMdlFields`, never in the built-in MDL_FIELDS table. */
  alias?: string;
  /** plan 2c B1 config override (`mdl.<key>.pattern`): a regex source a freetext-kind field's value(s) must
   *  additionally match, on top of the normal length/line checks. Ignored for closed/chain-list fields. */
  pattern?: string;
  /** plan 2c B1 config override (`mdl.<key>.link`): Phase C graph-index metadata (a `handled-by` edge to a
   *  `where` path) — carried through so it round-trips, but not consumed by schema validation or the card body
   *  beyond a passthrough note; no graph exists yet to link to. */
  link?: string;
  /** plan 2c B1 config override (`mdl.<key>.literal`): when true, this built-in field is recorded as-is with
   *  no shape checking at all (the same "no further checking" treatment a custom mdl key already gets), even
   *  though it keeps its catalog `key`/enum for the card's own documentation purposes. */
  literal?: boolean;
}

/** Order matters: this is the order the card's FIELDS block, and respond.ts's mdlRecorded, both render in. */
export const MDL_FIELDS: readonly MdlField[] = [
  { key: 'why', kind: 'closed-single', values: WHYS },
  { key: 'area', kind: 'closed-list', values: AREAS, maxList: 2, note: 'omit for whole-system questions: uses carries the map' },
  { key: 'stage', kind: 'closed-single', values: STAGES, note: 'operate = live production/incident' },
  { key: 'change', kind: 'closed-single', values: CHANGES, note: 'only when a code change is involved' },
  { key: 'risk', kind: 'closed-single', values: RISKS, note: 'the stakes if this answer is wrong' },
  { key: 'problem', kind: 'freetext', note: "one line ≤160: what you're solving, in your own words" },
  { key: 'uses', kind: 'chain-list', maxList: 5, note: 'list ≤5 of chains (grammar below)' },
  { key: 'blast', kind: 'closed-single', values: BLASTS, note: "the widest level one failure reaches (person = users' data or accounts)" },
  { key: 'touches', kind: 'freetext-list', maxList: 5, note: 'list ≤5 domain objects/fields (not concepts like "authentication", not language built-ins)' },
];

/** `parent` (mdl.parent, alias of mak.parent) and `unknown` are documented separately in the card — they
 *  aren't in MDL_FIELDS because they aren't part of the closed/freetext/chain-list generation above (parent is
 *  a run id, not a value with a card note in the FIELDS table; unknown is a value, not a field). */
export const MDL_PARENT_KEY = 'parent';

export const MDL_KEYS: readonly string[] = [...MDL_FIELDS.map((f) => f.key), MDL_PARENT_KEY];

/**
 * Merges a project's `.mm3/config.yaml` `mdl: {...}` overrides onto the built-in MDL_FIELDS table (plan
 * 2c B1). No overrides (the common case: `{}` or `undefined`) returns MDL_FIELDS itself, unchanged — every
 * consumer's own optional `mdlFields` parameter defaults to `MDL_FIELDS` too, so a caller with no project
 * config sees exactly today's built-in behavior either way.
 *
 * Merge rules, per override field:
 *   values  — REPLACES the field's enum outright (closedValues still always adds `unknown` on top).
 *   note    — REPLACES the card's one-line note.
 *   as      — sets `alias`: an ADDITIONAL name a request may use for this field; the original `key` still
 *             works too (an alias adds a name, it doesn't take one away) — see schema-check.ts's checkMdl for
 *             how both are accepted and validated identically.
 *   pattern — carried through as-is (schema-check.ts applies it to freetext-kind fields).
 *   link    — carried through as-is; no validation or graph meaning yet (Phase C).
 *   literal — carried through as-is; schema-check.ts skips this field's normal shape checks when set.
 *
 * The 5 C4 chain levels (CHAIN_LEVELS) and the `uses` chain grammar (CHAIN_RE) are never touched here — B1 is
 * explicit that they're not overridable — and `parent`/`unknown` (MDL_PARENT_KEY/UNKNOWN_VALUE) are fixed
 * vocabulary, never subject to a `mdl.<field>` override (there is no catalog field named `parent` or `unknown`
 * to look up in `overrides` in the first place).
 */
export function effectiveMdlFields(overrides: Record<string, MdlFieldOverride> | undefined): readonly MdlField[] {
  if (!overrides || Object.keys(overrides).length === 0) return MDL_FIELDS;
  return MDL_FIELDS.map((f) => {
    const o = overrides[f.key];
    if (!o) return f;
    return {
      ...f,
      ...(o.values !== undefined ? { values: o.values } : {}),
      ...(o.note !== undefined ? { note: o.note } : {}),
      ...(o.as !== undefined ? { alias: o.as } : {}),
      ...(o.pattern !== undefined ? { pattern: o.pattern } : {}),
      ...(o.link !== undefined ? { link: o.link } : {}),
      ...(o.literal !== undefined ? { literal: o.literal } : {}),
    };
  });
}

/** The C4 chain grammar (plan 2c A4): chain := part (" -> " part)*, part := level:name("/"name)*["?"].
 *  `?` may end ANY part (card v2.1: "end any part with ?", not just the code level). */
export const CHAIN_LEVELS = ['person', 'system', 'container', 'component', 'code'] as const;
/** kebab-case name, or a code identifier (letters, digits, '.', '_', '-'). */
const NAME = '[A-Za-z0-9._-]+';
const PART = `(?:${CHAIN_LEVELS.join('|')}):${NAME}(?:/${NAME})*\\??`;
export const CHAIN_RE = new RegExp(`^${PART}(?: -> ${PART})*$`, 'u');

/** Hard caps (plan 2c A4). */
export const MAX_MDL_LINES = 25;
export const MAX_CUSTOM_KEY_LEN = 20;
export const MAX_FREETEXT_LEN = 160;
export const MAX_TOUCH_LEN = 40;

/** A valid custom (non-catalog) mdl key: any lower-kebab key ≤20 chars. Same shape as a category/layer tag
 *  (schema-check.ts's own TAG), but mdl-fields.ts owns its own copy so the mdl table stays self-contained. */
const CUSTOM_KEY_RE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/u;
export const isCustomKey = (k: string): boolean => CUSTOM_KEY_RE.test(k) && k.length <= MAX_CUSTOM_KEY_LEN;

/** Every allowed value for a closed field, including "unknown" — used both to validate and to render the card's
 *  "why validate | find | debug" style lines. */
export function closedValues(field: MdlField): readonly string[] {
  return [...(field.values ?? []), UNKNOWN_VALUE];
}

/** A ledger record written before plan 2c may still carry `mdl.nodes` (a single chain string, the old plan 2b
 *  shape) instead of `uses`. Any reader of a stored Mdl block should run it through this first so `nodes` and
 *  `uses` are never both something a caller has to check — old records keep `nodes` on disk (nothing rewrites
 *  history), but every reader sees it as a 1-item `uses` list. Not wired into every reader from this module
 *  alone (report.ts/view.ts own their own read paths) — see this piece's own report for which callers still
 *  need it applied. */
export function normalizeMdl<T extends { uses?: string[] }>(mdl: T & { nodes?: string }): T {
  if (mdl.uses !== undefined || mdl.nodes === undefined) return mdl;
  const { nodes, ...rest } = mdl;
  return { ...rest, uses: [nodes] } as T;
}

export type { Area, Blast, Change, Risk, Stage, Why };
