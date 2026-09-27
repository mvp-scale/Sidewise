/**
 * Errors and env-to-config resolution for the `/v1/systemone` client (client.ts). Route selection, the
 * pinned model and the base URL all come from here; nothing here makes a network call.
 */

export class JevConfigError extends Error {
  /** 1 (default): a provider problem (no key) — bucketed with other provider errors. 2: a config value the
   *  caller must fix before anything runs (a bad SIDEWISE_BASE_URL) — the owner ruling for P3 treats this like
   *  a usage mistake, not a runtime provider failure. */
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

export interface JevConfig {
  route: JevRoute;
  /** undefined = no key configured (fine for dry-run; `createJevClient` throws). */
  apiKey: string | undefined;
  baseURL: string;
  /** The pinned model label from JEV_MODEL (e.g. `jev-1.13.0`); recorded on every result. */
  model: string;
  /** What actually goes in the request body's `model` (gateway: `typesafe-ai/jev`). */
  wireModel: string;
  timeoutMs: number;
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

/** TYPESAFE_API_KEY wins (direct); else AI_GATEWAY_API_KEY (gateway); with neither, direct is assumed. */
function resolveRoute(env: Env): { route: JevRoute; apiKey: string | undefined } {
  const directKey = clean(env.TYPESAFE_API_KEY);
  const gatewayKey = clean(env.AI_GATEWAY_API_KEY);
  const route: JevRoute = directKey || !gatewayKey ? 'direct' : 'gateway';
  return { route, apiKey: route === 'gateway' ? gatewayKey : directKey };
}

function resolveTimeoutMs(env: Env): number {
  const raw = Number(clean(env.JEV_TIMEOUT_MS));
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_TIMEOUT_MS;
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

/** SIDEWISE_BASE_URL (P3): a documented escape hatch (a proxy, a self-hosted mirror, tests), replacing the
 *  undocumented JEV_BASE_URL — no test or script depended on the old name (grepped before dropping it), so
 *  there is one name, not two. Must parse as a URL; https is required, except http for localhost/127.0.0.1/
 *  [::1] (a local dev proxy). Anything else is a config stop in the "✖ field: problem → fix" style, at exit 2
 *  (an owner ruling: a bad override is a usage mistake to fix, not a runtime provider failure). */
function resolveBaseURL(env: Env, baseDefault: string): string {
  const raw = clean(env.SIDEWISE_BASE_URL);
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
 */
export function resolveJevConfig(env: Env = process.env): JevConfig {
  const model = clean(env.JEV_MODEL) ?? DEFAULT_PINNED_MODEL;
  if (isFloatingModel(model)) {
    throw new JevConfigError(
      `JEV_MODEL="${model}" floats. Pin an exact version (e.g. ${DEFAULT_PINNED_MODEL}) so scores are reproducible.`,
    );
  }
  const { route, apiKey } = resolveRoute(env);
  const baseDefault = route === 'gateway' ? GATEWAY_BASE_URL : DIRECT_BASE_URL;
  return {
    route,
    apiKey,
    baseURL: resolveBaseURL(env, baseDefault),
    model,
    wireModel: route === 'gateway' ? (clean(env.JEV_GATEWAY_MODEL) ?? DEFAULT_GATEWAY_MODEL) : model,
    timeoutMs: resolveTimeoutMs(env),
  };
}

export function hasKey(config: JevConfig): boolean {
  return config.apiKey !== undefined;
}

export type ProviderRoute = 'direct' | 'gateway' | 'custom';

/** The route to show/record (P2): 'direct'/'gateway' when the base URL is still that route's own default,
 *  else 'custom' — a SIDEWISE_BASE_URL override changed which endpoint actually answers. */
export function routeLabel(config: JevConfig): ProviderRoute {
  const baseDefault = config.route === 'gateway' ? GATEWAY_BASE_URL : DIRECT_BASE_URL;
  return config.baseURL === baseDefault ? config.route : 'custom';
}
