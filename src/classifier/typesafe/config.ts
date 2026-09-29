/**
 * Errors and env-to-config resolution for the `/v1/systemone` client (client.ts). Route selection, the
 * pinned model and the base URL all come from here; nothing here makes a network call.
 */
import { DEFAULT_CONFIG, type PricingRate } from '../../config/defaults.ts';

export class JevConfigError extends Error {
  /** 1 (default): a provider problem (no key) — bucketed with other provider errors. 2: a config value the
   *  caller must fix before anything runs (a bad SIDEWISE_BASE_URL) — a usage mistake, not a runtime provider
   *  failure. */
  readonly exit: 1 | 2;
  constructor(message: string, exit: 1 | 2 = 1) {
    super(message);
    this.name = 'JevConfigError';
    this.exit = exit;
  }
}

export class JevApiError extends Error {
  readonly status: number | undefined;
  readonly retryable: boolean;
  readonly retryAfterMs: number | undefined;
  readonly body: unknown;
  constructor(
    message: string,
    opts: { status?: number; retryable: boolean; retryAfterMs?: number; body?: unknown; cause?: unknown },
  ) {
    super(message, opts.cause === undefined ? undefined : { cause: opts.cause });
    this.name = 'JevApiError';
    this.status = opts.status;
    this.retryable = opts.retryable;
    this.retryAfterMs = opts.retryAfterMs;
    this.body = opts.body;
  }
}

type JevRoute = 'direct' | 'gateway';

/** Where init (setup/keystore.ts) found a key outside env: the OS keychain, or the user credentials file.
 *  `provider` says which route it's for, same as the credentials file's own "typesafe"/"gateway" key. */
export interface StoredKey {
  apiKey: string;
  source: 'keychain' | 'file';
  provider: 'typesafe' | 'gateway';
}
/** Looks up a stored key once; undefined when none is configured, a tool is missing, or a keychain is locked
 *  (setup/keystore.ts's resolveStoredKey skips to the next source silently on any of those — never here). */
export type ResolveStored = () => StoredKey | undefined;

export interface JevConfig {
  route: JevRoute;
  /** undefined = no key configured (fine for dry-run; `createJevClient` throws). */
  apiKey: string | undefined;
  /** Where apiKey came from; undefined alongside an undefined apiKey. Never set from a bare `resolveJevConfig(env)`
   *  call with no `deps.resolveStored` — only real call sites (the typesafe adapter, doctor) pass one, so no
   *  existing caller starts doing keychain/file I/O just by upgrading. */
  keySource?: 'env' | 'keychain' | 'file';
  baseURL: string;
  /** The pinned model label from JEV_MODEL (e.g. `jev-1.13.0`); recorded on every result. */
  model: string;
  /** What actually goes in the request body's `model` (gateway: `typesafe-ai/jev`). */
  wireModel: string;
  timeoutMs: number;
  /** Plan 2c B1: overridable via config.yaml (deps.fileConfig); undefined only when no bare `resolveJevConfig`
   *  call site passes fileConfig at all (every existing caller keeps working). `createJevClient` falls back to
   *  its own hardcoded defaults (MAX_RETRIES/BASE_BACKOFF_MS) when this is undefined. */
  retries?: number;
  backoffMs?: number;
  /** Plan 2c B2: the effective config's per-model rate table (`.sidewise/config.yaml`'s `pricing:`, merged over
   *  `DEFAULT_CONFIG.pricing` — see resolveJevConfig below), threaded to `createJevClient`/`answers.ts`'s
   *  `costOf` so an estimate uses the project's own rates. `resolveJevConfig` always populates it from a real
   *  config; optional only so a hand-built `JevConfig` fixture (tests) need not supply one — `costOf` already
   *  treats an absent table the same as an empty one (no estimate for any model). */
  pricing?: Record<string, PricingRate>;
}

/** The middle layer between env and the hardcoded defaults below (plan 2c B1: env > config > default) — a
 *  project's `.sidewise/config.yaml`, already resolved by `src/config/load.ts`'s `classifierFileConfig`. Purely
 *  additive: every existing call site that omits this keeps behaving exactly as before. */
export interface JevFileConfig {
  provider?: string;
  baseURL?: string;
  model?: string;
  timeoutMs?: number;
  retries?: number;
  backoffMs?: number;
  pricing?: Record<string, PricingRate>;
}

const DIRECT_BASE_URL = 'https://api.typesafe.ai';
const GATEWAY_BASE_URL = 'https://ai-gateway.vercel.sh/typesafe';
const DEFAULT_PINNED_MODEL = 'jev-1.13.0';
const DEFAULT_GATEWAY_MODEL = 'typesafe-ai/jev';
const DEFAULT_TIMEOUT_MS = 20_000;

type Env = Record<string, string | undefined>;

const clean = (v: string | undefined): string | undefined => {
  const t = v?.trim();
  return t ? t : undefined;
};

/** Aliases that float: refused, because scores must be reproducible (`.env.example`). */
function isFloatingModel(model: string): boolean {
  return /(^|[-/])(latest|preview)$/i.test(model.trim());
}

/** TYPESAFE_API_KEY wins (direct); else AI_GATEWAY_API_KEY (gateway); else `deps.resolveStored` (the OS
 *  keychain, then the user credentials file — that order is resolveStoredKey's own, not this function's); with
 *  none of those, direct is assumed (matches today's "no key configured" default). */
function resolveRoute(env: Env, deps: { resolveStored?: ResolveStored }): { route: JevRoute; apiKey: string | undefined; keySource?: 'env' | 'keychain' | 'file' } {
  const directKey = clean(env.TYPESAFE_API_KEY);
  const gatewayKey = clean(env.AI_GATEWAY_API_KEY);
  if (directKey) return { route: 'direct', apiKey: directKey, keySource: 'env' };
  if (gatewayKey) return { route: 'gateway', apiKey: gatewayKey, keySource: 'env' };
  const stored = deps.resolveStored?.();
  if (stored) return { route: stored.provider === 'gateway' ? 'gateway' : 'direct', apiKey: stored.apiKey, keySource: stored.source };
  return { route: 'direct', apiKey: undefined };
}

function resolveTimeoutMs(env: Env, fileConfig?: JevFileConfig): number {
  const raw = Number(clean(env.JEV_TIMEOUT_MS));
  if (Number.isFinite(raw) && raw > 0) return raw;
  return fileConfig?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

/** SIDEWISE_BASE_URL: a documented escape hatch (a proxy, a self-hosted mirror, tests), replacing the
 *  undocumented JEV_BASE_URL — there is one name, not two. Must parse as a URL; https is required, except
 *  http for localhost/127.0.0.1/[::1] (a local dev proxy). Anything else is a config stop in the
 *  "✖ field: problem → fix" style, at exit 2 (a bad override is a usage mistake to fix, not a runtime
 *  provider failure). */
function resolveBaseURL(env: Env, baseDefault: string, fileConfig?: JevFileConfig): string {
  const raw = clean(env.SIDEWISE_BASE_URL) ?? fileConfig?.baseURL;
  if (raw === undefined) return baseDefault;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new JevConfigError(`✖ SIDEWISE_BASE_URL: "${raw}" is not a valid URL → use an https URL, e.g. https://api.example.com`, 2);
  }
  const local = LOCAL_HOSTS.has(url.hostname);
  if (url.protocol === 'https:' || (url.protocol === 'http:' && local)) return raw.replace(/\/+$/, '');
  throw new JevConfigError(
    `✖ SIDEWISE_BASE_URL: "${raw}" is ${url.protocol.replace(':', '')}, not https → use https, or http only for localhost/127.0.0.1/[::1]`,
    2,
  );
}

/**
 * Resolve config from env. Never throws for a missing key (dry-run needs the model id and route); it does
 * throw for a floating model alias or a bad SIDEWISE_BASE_URL.
 *   JEV_MODEL           pinned model, default `jev-1.13.0`
 *   JEV_GATEWAY_MODEL   gateway model id, default `typesafe-ai/jev` (whether the gateway can pin a version
 *                       is unconfirmed; the server-echoed model is recorded on every result)
 *   SIDEWISE_BASE_URL   override the base URL (proxies, self-hosting, tests) — https required except for
 *                       localhost/127.0.0.1/[::1] (see resolveBaseURL)
 *   JEV_TIMEOUT_MS      per-attempt timeout
 *
 * `deps.resolveStored` (default: none) is an injectable lookup for a key kept outside env — the OS keychain or
 * init's user credentials file (setup/keystore.ts's resolveStoredKey, which real call sites pass explicitly).
 * Omitting it keeps this call exactly as pure as before: no existing caller starts doing keychain/file I/O
 * just by this feature landing.
 *
 * `deps.fileConfig` (plan 2c B1, default: none): a project's `.sidewise/config.yaml`, already resolved to plain
 * fields by `src/config/load.ts`'s `classifierFileConfig`. Purely additive, same discipline as resolveStored —
 * every existing call site that omits it keeps reading env-then-hardcoded-default exactly as before. When
 * given, it's the middle layer: env (JEV_MODEL/SIDEWISE_BASE_URL/JEV_TIMEOUT_MS) still wins over it, and it
 * still wins over the hardcoded defaults above.
 */
export function resolveJevConfig(env: Env = process.env, deps: { resolveStored?: ResolveStored; fileConfig?: JevFileConfig } = {}): JevConfig {
  const model = clean(env.JEV_MODEL) ?? deps.fileConfig?.model ?? DEFAULT_PINNED_MODEL;
  if (isFloatingModel(model)) {
    throw new JevConfigError(
      `JEV_MODEL="${model}" floats. Pin an exact version (e.g. ${DEFAULT_PINNED_MODEL}) so scores are reproducible.`,
    );
  }
  const { route, apiKey, keySource } = resolveRoute(env, deps);
  const baseDefault = route === 'gateway' ? GATEWAY_BASE_URL : DIRECT_BASE_URL;
  return {
    route,
    apiKey,
    ...(keySource ? { keySource } : {}),
    baseURL: resolveBaseURL(env, baseDefault, deps.fileConfig),
    model,
    wireModel: route === 'gateway' ? (clean(env.JEV_GATEWAY_MODEL) ?? DEFAULT_GATEWAY_MODEL) : model,
    timeoutMs: resolveTimeoutMs(env, deps.fileConfig),
    ...(deps.fileConfig?.retries !== undefined ? { retries: deps.fileConfig.retries } : {}),
    ...(deps.fileConfig?.backoffMs !== undefined ? { backoffMs: deps.fileConfig.backoffMs } : {}),
    pricing: deps.fileConfig?.pricing ?? DEFAULT_CONFIG.pricing,
  };
}

export function hasKey(config: JevConfig): boolean {
  return config.apiKey !== undefined;
}

export type ProviderRoute = 'direct' | 'gateway' | 'custom';

/** The route to show/record: 'direct'/'gateway' when the base URL is still that route's own default,
 *  else 'custom' — a SIDEWISE_BASE_URL override changed which endpoint actually answers. */
export function routeLabel(config: JevConfig): ProviderRoute {
  const baseDefault = config.route === 'gateway' ? GATEWAY_BASE_URL : DIRECT_BASE_URL;
  return config.baseURL === baseDefault ? config.route : 'custom';
}
