/** The request and answer model of the YAML call contract v1 (skills/sidewise/references/contract.md). */
export const VERBS = ['view', 'class', 'change', 'scan', 'drill', 'loop'] as const;
export type Verb = (typeof VERBS)[number];

export const DEPTHS = ['quick', 'standard', 'thorough'] as const;
export type Depth = (typeof DEPTHS)[number];
/** quick/standard/thorough = k = 1/2/3: the concerns section holds exactly 3k categories, each with exactly 3
 *  yes/no probes, so exactly this many yes/no questions in total (9/18/27) — plan 2b. Distinct from
 *  SWEEP_ITEM_CAP below, which kept the old 10/20/30 numbers for a different thing (items per layer). */
export const DEPTH_COUNT: Record<Depth, number> = { quick: 9, standard: 18, thorough: 27 };
/** A sweep: at most this many items asked per layer (reused items are free and don't count) — unchanged from
 *  plan 2a even though DEPTH_COUNT's own numbers moved; the two used to coincide and no longer do. */
export const SWEEP_ITEM_CAP: Record<Depth, number> = { quick: 10, standard: 20, thorough: 30 };

export const WHYS = ['validate', 'find', 'debug'] as const;
export const AREAS = ['data', 'api', 'ui', 'auth', 'hosting', 'build', 'tests'] as const;
export type Why = (typeof WHYS)[number];
export type Area = (typeof AREAS)[number];

/** The wise catalog: three more optional, closed fields alongside why/area. */
export const STAGES = ['design', 'build', 'review', 'pre-merge', 'post-fix', 'release'] as const;
export const CHANGES = ['feature', 'fix', 'refactor', 'dependency', 'config'] as const;
export const RISKS = ['low', 'medium', 'high'] as const;
export type Stage = (typeof STAGES)[number];
export type Change = (typeof CHANGES)[number];
export type Risk = (typeof RISKS)[number];

/** ask has two sections: concerns (exactly 3k yes/no categories) and decisions (2-5 scale/choice categories,
 *  at least one of each kind) — plan 2b. DECISIONS_MIN/MAX replace the old MAX_EXTRAS as the only rule. */
export const SECTIONS = ['concerns', 'decisions'] as const;
export type Section = (typeof SECTIONS)[number];
export const DECISIONS_MIN = 2;
export const DECISIONS_MAX = 5;

/** A concern's family (closed enum, optional): defaults to the category name when that name is itself a
 *  family; ledger-only (never sent to the classifier, never part of an answer key or pattern fingerprint). */
export const FAMILIES = ['access', 'injection', 'secrets', 'input', 'output', 'availability', 'correctness', 'design', 'design-risk', 'done', 'other'] as const;
export type Family = (typeof FAMILIES)[number];

/** wise.blast: how far a change's own blast radius reaches, C4-style. */
export const BLASTS = ['code', 'component', 'container', 'system', 'person'] as const;
export type Blast = (typeof BLASTS)[number];

export type Pass = 'yes' | 'no' | string[];
export type Need = 'all' | 'most' | 'any';

export type Question =
  | { n: number; kind: 'yesno'; text: string }
  | { n: number; kind: 'scale'; text: string; levels: string[] }
  | { n: number; kind: 'choice'; text: string; options: string[] };

export interface Category {
  name: string;
  /** Which half of ask: this category came from. Internal/ledger-only: never part of an answer key
   *  (translate.ts) or a pattern fingerprint (ledger/index.ts's categoryShape) — those must stay stable for
   *  the identical question set regardless of section or family. */
  section: Section;
  family?: Family;
  familySource?: 'given' | 'name';
  pass: Pass;
  need: Need;
  tags: string[];
  /** Sorted by number. */
  questions: Question[];
}

export interface Layer {
  name: string;
  categories: Category[];
}

export interface Side {
  verb?: Verb;
  goal: string;
  depth?: Depth;
  /** As written: "src/user.ts:1-3". */
  where: string[];
  parent?: string;
  from?: string;
  compare?: { before: string; after: string };
  /** change only: which of the parent's concerns this change should turn to pass. */
  expect?: string[];
  /** One subject: the categories straight under ask (concerns first, then decisions). Empty in a sweep. */
  categories: Category[];
  /** A sweep: the asked layers, in over's layer order. Empty for one subject. */
  layers: Layer[];
  /** A sweep's over block, as written. */
  over?: Record<string, unknown>;
}

export interface Wise {
  why?: Why;
  area?: Area;
  stage?: Stage;
  change?: Change;
  risk?: Risk;
  parent?: string;
  /** One line: what the agent is solving right now. */
  problem?: string;
  /** A C4 chain: "level:name( -> level:name)*", chains joined by "; ". */
  nodes?: string;
  /** Entities/objects the run touches, up to 5. */
  touches?: string[];
  blast?: Blast;
}

export interface Request {
  side: Side;
  wise: Wise | null;
}

/** A validation stop. `schema`: the JSON Schema rejects it too. `cross`: a rule the schema can't express. */
export interface Stop {
  cls: 'schema' | 'cross';
  text: string;
}

export type Gate = 'pass' | 'fail' | 'unsure';

/** A checked answer: yes/no as P(yes); scale and choice as a distribution keyed by level or option. */
export type Answer = { kind: 'yesno'; p: number } | { kind: 'scale' | 'choice'; dist: Record<string, number> };
