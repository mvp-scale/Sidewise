/** The request and answer model of the YAML call contract v1 (skills/sidewise/references/contract.md). */
export const VERBS = ['view', 'class', 'change', 'scan', 'drill', 'loop'] as const;
export type Verb = (typeof VERBS)[number];

export const DEPTHS = ['quick', 'standard', 'thorough'] as const;
export type Depth = (typeof DEPTHS)[number];
/** One subject: exactly this many yes/no questions. A sweep: at most this many items asked per layer. */
export const DEPTH_COUNT: Record<Depth, number> = { quick: 10, standard: 20, thorough: 30 };

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

export const MAX_EXTRAS = 5; // scale + choice questions per request

export type Pass = 'yes' | 'no' | string[];
export type Need = 'all' | 'most' | 'any';

export type Question =
  | { n: number; kind: 'yesno'; text: string }
  | { n: number; kind: 'scale'; text: string; levels: string[] }
  | { n: number; kind: 'choice'; text: string; options: string[] };

export interface Category {
  name: string;
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
  /** One subject: the categories straight under ask. Empty in a sweep. */
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
