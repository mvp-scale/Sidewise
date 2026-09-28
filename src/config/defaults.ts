/**
 * The ONE code defaults table for `.sidewise/config.yaml` (plan 2c B1): every setting Sidewise can run with,
 * and the value it runs with when a project's config is silent on it. `config/load.ts` merges a project's
 * sparse overrides on top of this; `config/validate.ts` checks a raw override object shape-by-shape against
 * it. Nothing here reads a file or an env var — this module is pure data plus the types that describe it.
 */

/** Where an effective value actually came from — `sidewise config` shows this per key. */
export type ConfigSource = 'default' | 'config' | 'env';

export interface PricingRate {
  inputPerMTok?: number;
  outputPerMTok?: number;
  perSecond?: number;
  perCall?: number;
}

/** A project's per-field override of the built-in wise catalog (src/contract/wise-fields.ts). Renames go
 *  through `as` (an alias, never a redefinition of the C4 levels, which are never overridable). Not yet
 *  consumed by wise-fields.ts/the wise card/the template wise blocks — this module only carries the shape
 *  through validation and the effective-config printer; wiring it into the card generation is a later piece. */
export interface WiseFieldOverride {
  values?: string[];
  note?: string;
  as?: string;
  pattern?: string;
  link?: string;
  literal?: boolean;
}

export interface SidewiseConfig {
  budget: { usd: number; runs: number; per: 'total' | 'day' | 'hour'; since?: string };
  provider?: string;
  baseURL?: string;
  model?: string;
  /** Keyed by model id (e.g. `jev-1.13.0`) — the default seeds TypeSafe's own currently-published rate (moved
   *  here from `src/classifier/typesafe/answers.ts`'s `RATE_PER_INPUT_TOKEN`; that module still owns actually
   *  reading it for cost estimates — see plan 2c B2). */
  pricing: Record<string, PricingRate>;
  timeoutMs: number;
  retries: number;
  backoffMs: number;
  sweep: {
    /** Lower-only: a project may tighten this below whatever the code's own compiled-in ceiling is for a
     *  given depth, never raise it past that ceiling. undefined = no project-level cap beyond the code's own. */
    maxItems?: number;
    maxQuestionsPerCall: number;
  };
  requestMaxBytes: number;
  reuse: {
    /** undefined = off (no age-based re-ask) — the plan's documented default. */
    maxAgeDays?: number;
    /** undefined = off (no commit-count-based re-ask). */
    maxCommits?: number;
  };
  /** Per built-in wise field key (why/area/stage/change/risk/problem/uses/blast/touches) → its override. */
  wise: Record<string, WiseFieldOverride>;
}

export const DEFAULT_CONFIG: SidewiseConfig = {
  budget: { usd: 5, runs: 500, per: 'total' },
  pricing: {
    'jev-1.13.0': { inputPerMTok: 42 / 1_000 }, // $42/Btok = $0.042/Mtok (docs.typesafe.ai/models.md) — see answers.ts
  },
  timeoutMs: 20_000,
  retries: 2,
  backoffMs: 1000,
  sweep: { maxQuestionsPerCall: 500 },
  requestMaxBytes: 1_048_576,
  reuse: {},
  wise: {},
};

/** Top-level config keys, in the order `sidewise config` prints them. Used by validate.ts for the
 *  unknown-key/did-you-mean check and by load.ts for the printer. */
export const CONFIG_KEYS = ['budget', 'provider', 'baseURL', 'model', 'pricing', 'timeoutMs', 'retries', 'backoffMs', 'sweep', 'requestMaxBytes', 'reuse', 'wise'] as const;
export type ConfigKey = (typeof CONFIG_KEYS)[number];

/** Request-contract concepts an agent might mistake for project settings — plan 2c B1's "not configurable
 *  (request contract) → set it per request" stop. `depth` is the named example in the plan; the others are the
 *  same category of per-request-only field (side: keys that never belong at the project level). */
export const CONTRACT_ONLY_KEYS = ['depth', 'goal', 'where', 'ask', 'over', 'wise.parent'] as const;

/** A key name that looks like it's meant to hold a secret, wherever it appears in the config tree — plan 2c
 *  B1's "keys go in env or the keychain" stop (AGENTS.md rule 6: secrets never in the project or config). */
export const SECRET_LIKE_KEYS = ['apikey', 'api_key', 'key', 'token', 'secret', 'password', 'credential', 'credentials'] as const;
