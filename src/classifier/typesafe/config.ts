/**
 * Errors and env-to-config resolution for the `/v1/systemone` client (client.ts). Route selection, the
 * pinned model and the base URL all come from here; nothing here makes a network call.
 */

export class JevConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'JevConfigError';
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

export type JevRoute = 'direct' | 'gateway';

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

export const DIRECT_BASE_URL = 'https://api.typesafe.ai';
export const GATEWAY_BASE_URL = 'https://ai-gateway.vercel.sh/typesafe';
export const DEFAULT_PINNED_MODEL = 'jev-1.13.0';
export const DEFAULT_GATEWAY_MODEL = 'typesafe-ai/jev';
export const DEFAULT_TIMEOUT_MS = 20_000;

type Env = Record<string, string | undefined>;

const clean = (v: string | undefined): string | undefined => {
  const t = v?.trim();
  return t ? t : undefined;
};

/** Aliases that float: refused, because scores must be reproducible (`.env.example`). */
export function isFloatingModel(model: string): boolean {
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

/**
 * Resolve config from env. Never throws for a missing key (dry-run needs the model id and route); it does
 * throw for a floating model alias.
 *   JEV_MODEL          pinned model, default `jev-1.13.0`
 *   JEV_GATEWAY_MODEL  gateway model id, default `typesafe-ai/jev` (whether the gateway can pin a version
 *                      is unconfirmed; the server-echoed model is recorded on every result)
 *   JEV_BASE_URL       override the base URL (tests, proxies)
 *   JEV_TIMEOUT_MS     per-attempt timeout
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
    baseURL: (clean(env.JEV_BASE_URL) ?? baseDefault).replace(/\/+$/, ''),
    model,
    wireModel: route === 'gateway' ? (clean(env.JEV_GATEWAY_MODEL) ?? DEFAULT_GATEWAY_MODEL) : model,
    timeoutMs: resolveTimeoutMs(env),
  };
}

export function hasKey(config: JevConfig): boolean {
  return config.apiKey !== undefined;
}
