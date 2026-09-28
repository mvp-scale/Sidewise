/**
 * The wise v2 field table (plan 2c A4): the single source every wise-block consumer is generated from — the
 * schema check (schema-check.ts's checkWise), the cross-validator (validate.ts), the `sidewise agent wise`
 * legend card (help/agent.ts), and `sidewise help wise` (help/topics.ts). One table, one place to add a field
 * or change a note, so none of those four views can quietly drift from each other. Phase B makes this
 * config-aware (`.sidewise/config.yaml`'s `wise: {...}` overrides); today it's the built-in defaults only.
 */
import { AREAS, BLASTS, CHANGES, RISKS, STAGES, WHYS, type Area, type Blast, type Change, type Risk, type Stage, type Why } from './types.ts';

/** `unknown` is always a legal value for a closed field, alongside its own enum (plan 2c: "fill what you know"). */
export const UNKNOWN_VALUE = 'unknown';

type WiseFieldKind = 'closed-single' | 'closed-list' | 'freetext' | 'chain-list' | 'freetext-list';

export interface WiseField {
  key: string;
  kind: WiseFieldKind;
  /** Closed fields only: the enum this field's value(s) must be one of (plus UNKNOWN_VALUE, always). */
  values?: readonly string[];
  /** List fields only (closed-list, chain-list, freetext-list): the max list length. */
  maxList?: number;
  /** The one-line doc note shown after the field in the card (e.g. area's "omit for whole-system questions..."). */
  note?: string;
}

/** Order matters: this is the order the card's FIELDS block, and respond.ts's wiseRecorded, both render in. */
export const WISE_FIELDS: readonly WiseField[] = [
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

/** `parent` (wise.parent, alias of side.parent) and `unknown` are documented separately in the card — they
 *  aren't in WISE_FIELDS because they aren't part of the closed/freetext/chain-list generation above (parent is
 *  a run id, not a value with a card note in the FIELDS table; unknown is a value, not a field). */
export const WISE_PARENT_KEY = 'parent';

export const WISE_KEYS: readonly string[] = [...WISE_FIELDS.map((f) => f.key), WISE_PARENT_KEY];

/** The C4 chain grammar (plan 2c A4): chain := part (" -> " part)*, part := level:name("/"name)*["?"].
 *  `?` may end ANY part (card v2.1: "end any part with ?", not just the code level). */
export const CHAIN_LEVELS = ['person', 'system', 'container', 'component', 'code'] as const;
/** kebab-case name, or a code identifier (letters, digits, '.', '_', '-'). */
const NAME = '[A-Za-z0-9._-]+';
const PART = `(?:${CHAIN_LEVELS.join('|')}):${NAME}(?:/${NAME})*\\??`;
export const CHAIN_RE = new RegExp(`^${PART}(?: -> ${PART})*$`, 'u');

/** Hard caps (plan 2c A4). */
export const MAX_WISE_LINES = 25;
export const MAX_CUSTOM_KEY_LEN = 20;
export const MAX_FREETEXT_LEN = 160;
export const MAX_TOUCH_LEN = 40;

/** A valid custom (non-catalog) wise key: any lower-kebab key ≤20 chars. Same shape as a category/layer tag
 *  (schema-check.ts's own TAG), but wise-fields.ts owns its own copy so the wise table stays self-contained. */
const CUSTOM_KEY_RE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/u;
export const isCustomKey = (k: string): boolean => CUSTOM_KEY_RE.test(k) && k.length <= MAX_CUSTOM_KEY_LEN;

/** Every allowed value for a closed field, including "unknown" — used both to validate and to render the card's
 *  "why validate | find | debug" style lines. */
export function closedValues(field: WiseField): readonly string[] {
  return [...(field.values ?? []), UNKNOWN_VALUE];
}

/** A ledger record written before plan 2c may still carry `wise.nodes` (a single chain string, the old plan 2b
 *  shape) instead of `uses`. Any reader of a stored Wise block should run it through this first so `nodes` and
 *  `uses` are never both something a caller has to check — old records keep `nodes` on disk (nothing rewrites
 *  history), but every reader sees it as a 1-item `uses` list. Not wired into every reader from this module
 *  alone (report.ts/view.ts own their own read paths) — see this piece's own report for which callers still
 *  need it applied. */
export function normalizeWise<T extends { uses?: string[] }>(wise: T & { nodes?: string }): T {
  if (wise.uses !== undefined || wise.nodes === undefined) return wise;
  const { nodes, ...rest } = wise;
  return { ...rest, uses: [nodes] } as T;
}

export type { Area, Blast, Change, Risk, Stage, Why };
