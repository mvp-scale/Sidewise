/**
 * `.mm3/config.yaml` → the effective `Mm3Config` (plan 2c B1): reads the file if present (never
 * creates it — same free-and-optional spirit as everything else doctor/config touch), validates it
 * (validate.ts), and merges it over the one code defaults table (defaults.ts). Precedence is env > config >
 * default; the small set of settings that already have their own env var (MM3_PROVIDER,
 * MM3_BASE_URL, JEV_MODEL, JEV_TIMEOUT_MS) keep that env var as the actual runtime authority — this
 * module's `config.<field>` is the config-or-default LAYER only (never env), because the real routing already
 * has one owner (`src/classifier/typesafe/config.ts`'s `resolveJevConfig`, which re-checks env itself and
 * takes this module's value only as its own middle layer via `deps.fileConfig` — see that file). What this
 * module DOES do is label each of those fields' `source` as `'env'` whenever that env var is set, purely for
 * `mm3 config`'s own printer, even though the VALUE shown here is still the config/default one — a real
 * run's actual value for those four fields comes from resolveJevConfig, not from reading this object alone.
 * Every other key (budget, pricing, timeoutMs's siblings retries/backoffMs, sweep, requestMaxBytes, reuse,
 * mdl) has no env var at all, so config.<field> here IS the real effective value for those.
 */
import { existsSync, readFileSync } from 'node:fs';
import { parseDocument } from 'yaml';
import type { Mm3Paths } from '../ledger/paths.ts';
import { CONFIG_KEYS, DEFAULT_CONFIG, type ConfigSource, type Mm3Config } from './defaults.ts';
import { validateConfig, type ConfigStop } from './validate.ts';

interface FileReadResult {
  /** undefined when the file is missing, unreadable, or fails to parse — `stops` explains which. */
  raw: Record<string, unknown> | undefined;
  stops: ConfigStop[];
  present: boolean;
}

/** Reads and parses `paths.config` if it exists. Never throws, never writes, never creates the file. A YAML
 *  syntax error becomes one stop naming the line, the same style read.ts's request parser uses. */
function readConfigFile(paths: Mm3Paths | undefined): FileReadResult {
  if (!paths || !existsSync(paths.config)) return { raw: undefined, stops: [], present: false };
  let text: string;
  try {
    text = readFileSync(paths.config, 'utf8');
  } catch {
    return { raw: undefined, stops: [], present: false };
  }
  const doc = parseDocument(text, { version: '1.2', schema: 'core', uniqueKeys: true });
  const first = doc.errors[0];
  if (first) {
    const line = first.linePos?.[0]?.line ?? 1;
    return { raw: undefined, stops: [{ path: '', text: `✖ config: line ${line} of config.yaml does not parse → fix the YAML syntax` }], present: true };
  }
  let value: unknown;
  try {
    value = doc.toJS({ maxAliasCount: 50 });
  } catch {
    return { raw: undefined, stops: [{ path: '', text: '✖ config: too many aliases (*) in config.yaml → write it out in full' }], present: true };
  }
  if (value === null || value === undefined) return { raw: {}, stops: [], present: true }; // an empty file: no overrides, no problem
  if (typeof value !== 'object' || Array.isArray(value)) {
    return { raw: undefined, stops: [{ path: '', text: '✖ config: config.yaml is not a YAML mapping → write budget:, provider: etc. as top-level keys' }], present: true };
  }
  return { raw: value as Record<string, unknown>, stops: [], present: true };
}

export interface ResolvedConfig {
  config: Mm3Config;
  /** Dotted-path → where the shown value (or, for the four env-aware fields, the value that WOULD win at
   *  runtime) came from. Every leaf `mm3 config` prints has an entry. */
  sources: Record<string, ConfigSource>;
  /** Validation/parse stops from the file, if any — non-empty only when config.yaml exists and has a problem. */
  stops: ConfigStop[];
  /** Whether config.yaml exists at all (distinct from "exists but is empty/all-default"). */
  present: boolean;
}

const cleanEnv = (v: string | undefined): string | undefined => {
  const t = v?.trim();
  return t ? t : undefined;
};

function positiveOr<T extends number | undefined>(v: number | undefined, fallback: T): number | T {
  return v !== undefined && Number.isFinite(v) && v > 0 ? v : fallback;
}

/** The full precedence resolution: env (where one exists) > config.yaml > DEFAULT_CONFIG. Never throws — a
 *  broken config.yaml surfaces as `stops` (the caller decides whether that's fatal, e.g. `mm3 doctor`
 *  reports it; most other callers just fall back to defaults and keep going, same as a missing key). */
export function resolveConfig(paths: Mm3Paths | undefined, env: Record<string, string | undefined> = {}): ResolvedConfig {
  const file = readConfigFile(paths);
  const validated = file.raw !== undefined ? validateConfig(file.raw) : { stops: [], value: {} };
  const overrides = validated.value;
  const stops = [...file.stops, ...validated.stops];
  const sources: Record<string, ConfigSource> = {};

  const envProvider = cleanEnv(env.MM3_PROVIDER);
  const envBaseURL = cleanEnv(env.MM3_BASE_URL);
  const envModel = cleanEnv(env.JEV_MODEL);
  const envTimeoutRaw = Number(cleanEnv(env.JEV_TIMEOUT_MS));
  const envTimeout = Number.isFinite(envTimeoutRaw) && envTimeoutRaw > 0 ? envTimeoutRaw : undefined;

  /** Labels `path`'s source (see module doc: for the 4 env-aware fields this is a LABEL only, not what
   *  `config.<field>` below is set to) and returns the config-or-default value either way. */
  function layer<T>(path: string, envSet: boolean, configVal: T | undefined, defaultVal: T): T {
    sources[path] = envSet ? 'env' : configVal !== undefined ? 'config' : 'default';
    return configVal !== undefined ? configVal : defaultVal;
  }

  const config: Mm3Config = {
    budget: {
      usd: layer('budget.usd', false, overrides.budget?.usd, DEFAULT_CONFIG.budget.usd),
      runs: layer('budget.runs', false, overrides.budget?.runs, DEFAULT_CONFIG.budget.runs),
      per: layer('budget.per', false, overrides.budget?.per, DEFAULT_CONFIG.budget.per),
      ...(overrides.budget?.since !== undefined ? { since: overrides.budget.since } : {}),
    },
    provider: layer('provider', envProvider !== undefined, overrides.provider, DEFAULT_CONFIG.provider),
    baseURL: layer('baseURL', envBaseURL !== undefined, overrides.baseURL, DEFAULT_CONFIG.baseURL),
    model: layer('model', envModel !== undefined, overrides.model, DEFAULT_CONFIG.model),
    pricing: { ...DEFAULT_CONFIG.pricing, ...overrides.pricing },
    timeoutMs: layer('timeoutMs', envTimeout !== undefined, overrides.timeoutMs, DEFAULT_CONFIG.timeoutMs),
    retries: layer('retries', false, overrides.retries, DEFAULT_CONFIG.retries),
    backoffMs: layer('backoffMs', false, overrides.backoffMs, DEFAULT_CONFIG.backoffMs),
    sweep: {
      maxQuestionsPerCall: layer('sweep.maxQuestionsPerCall', false, overrides.sweep?.maxQuestionsPerCall, DEFAULT_CONFIG.sweep.maxQuestionsPerCall),
      ...(overrides.sweep?.maxItems !== undefined ? { maxItems: overrides.sweep.maxItems } : {}),
    },
    requestMaxBytes: layer('requestMaxBytes', false, overrides.requestMaxBytes, DEFAULT_CONFIG.requestMaxBytes),
    reuse: {
      ...(overrides.reuse?.maxAgeDays !== undefined ? { maxAgeDays: overrides.reuse.maxAgeDays } : {}),
      ...(overrides.reuse?.maxCommits !== undefined ? { maxCommits: overrides.reuse.maxCommits } : {}),
    },
    mdl: { ...overrides.mdl },
  };
  sources['sweep.maxItems'] = overrides.sweep?.maxItems !== undefined ? 'config' : 'default';
  sources['reuse.maxAgeDays'] = overrides.reuse?.maxAgeDays !== undefined ? 'config' : 'default';
  sources['reuse.maxCommits'] = overrides.reuse?.maxCommits !== undefined ? 'config' : 'default';
  sources['budget.since'] = overrides.budget?.since !== undefined ? 'config' : 'default';
  for (const model of new Set([...Object.keys(DEFAULT_CONFIG.pricing), ...Object.keys(overrides.pricing ?? {})])) {
    sources[`pricing.${model}`] = overrides.pricing && model in overrides.pricing ? 'config' : 'default';
  }
  for (const field of Object.keys(overrides.mdl ?? {})) sources[`mdl.${field}`] = 'config';

  return { config, sources, stops, present: file.present };
}

/** The subset `selectProvider`/`resolveJevConfig` accept as `deps.fileConfig` — see typesafe/config.ts. Reads
 *  straight off the resolved config; env still wins inside resolveJevConfig regardless of what's passed here. */
export function classifierFileConfig(config: Mm3Config): { provider?: string; baseURL?: string; model?: string; timeoutMs?: number; retries?: number; backoffMs?: number } {
  return {
    ...(config.provider !== undefined ? { provider: config.provider } : {}),
    ...(config.baseURL !== undefined ? { baseURL: config.baseURL } : {}),
    ...(config.model !== undefined ? { model: config.model } : {}),
    timeoutMs: positiveOr(config.timeoutMs, DEFAULT_CONFIG.timeoutMs),
    retries: positiveOr(config.retries, DEFAULT_CONFIG.retries),
    backoffMs: positiveOr(config.backoffMs, DEFAULT_CONFIG.backoffMs),
  };
}

export { CONFIG_KEYS };
