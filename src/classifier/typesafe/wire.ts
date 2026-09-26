/**
 * The one `/v1/systemone` HTTP round trip: timeout, abort wiring, HTTP-status and JSON-body error mapping.
 * No parsing of the answer shape — that's noul.ts and choice.ts.
 */
import type { JevConfig } from './config.ts';
import { JevApiError } from './config.ts';

/** JSON-compatible value (state/instructions/criteria may be text or structured JSON). */
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

export function num(v: unknown, what: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new JevApiError(`malformed response: ${what} is not a finite number`, { retryable: false, body: v });
  }
  return v;
}

/** Generic over the question type, so noul/score/choice requests build the identical {model,state,questions} shape. */
export function buildPayload<S, Q>(request: { state: S; questions: Record<string, Q> }, wireModel: string): { model: string; state: S; questions: Record<string, Q> } {
  return { model: wireModel, state: request.state, questions: request.questions };
}

/** usage + gateway cost, read the same way for every answer type. */
export function readUsageAndCost(raw: Record<string, unknown>): { usage: { inputTokens: number; outputTokens: number }; costUsd?: number } {
  const usage = isRecord(raw.usage) ? raw.usage : {};
  const gateway = isRecord(raw.provider_metadata) && isRecord(raw.provider_metadata.gateway) ? raw.provider_metadata.gateway : {};
  const cost = Number(gateway.cost);
  return {
    usage: {
      inputTokens: typeof usage.input_tokens === 'number' ? usage.input_tokens : 0,
      outputTokens: typeof usage.output_tokens === 'number' ? usage.output_tokens : 0,
    },
    ...(gateway.cost !== undefined && Number.isFinite(cost) ? { costUsd: cost } : {}),
  };
}

/** Retry-After (seconds or HTTP date) or retry-after-ms → ms, else undefined. */
export function parseRetryAfterMs(headers: Headers, now = Date.now()): number | undefined {
  const ms = headers.get('retry-after-ms');
  if (ms !== null && Number.isFinite(Number(ms)) && Number(ms) >= 0) return Number(ms);
  const raw = headers.get('retry-after');
  if (raw === null) return undefined;
  if (Number.isFinite(Number(raw))) return Number(raw) >= 0 ? Number(raw) * 1000 : undefined;
  const at = Date.parse(raw);
  return Number.isNaN(at) ? undefined : Math.max(0, at - now);
}

/** 408, 429, 5xx (incl. 529 "overloaded") are transient; everything else is our request's fault. */
export function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || (status >= 500 && status <= 599);
}

/** Wraps `doFetch` with the timeout/abort plumbing; throws JevApiError for a timeout, abort, or network error. */
async function fetchWithTimeout(
  config: JevConfig,
  doFetch: typeof fetch,
  url: string,
  key: string,
  payload: unknown,
  opts: { signal?: AbortSignal },
): Promise<Response> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, config.timeoutMs);
  const onCallerAbort = () => controller.abort();
  opts.signal?.addEventListener('abort', onCallerAbort, { once: true });
  if (opts.signal?.aborted) controller.abort();
  try {
    return await doFetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (cause) {
    if (opts.signal?.aborted) throw new JevApiError('request aborted by caller', { retryable: false, cause });
    throw new JevApiError(
      timedOut ? `request timed out after ${config.timeoutMs}ms` : `connection error: ${(cause as Error).message}`,
      { retryable: true, cause },
    );
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener('abort', onCallerAbort);
  }
}

function detailOf(body: unknown): string {
  return isRecord(body) ? String(body.message ?? body.error ?? JSON.stringify(body)) : String(body).slice(0, 200);
}

/** One `/v1/systemone` round trip: timeout, abort wiring, HTTP-status and JSON-body error mapping. No parsing. */
export async function postSystemOne(
  config: JevConfig,
  doFetch: typeof fetch,
  key: string,
  payload: unknown,
  opts: { signal?: AbortSignal },
): Promise<{ body: unknown; requestId: string | null }> {
  const res = await fetchWithTimeout(config, doFetch, `${config.baseURL}/v1/systemone`, key, payload, opts);
  const text = await res.text().catch(() => '');
  let body: unknown = text;
  try {
    body = text ? JSON.parse(text) : undefined;
  } catch {
    /* leave as text */
  }
  if (!res.ok) {
    const retryAfterMs = parseRetryAfterMs(res.headers);
    throw new JevApiError(`HTTP ${res.status}: ${detailOf(body)}`, {
      status: res.status,
      retryable: isRetryableStatus(res.status),
      ...(retryAfterMs !== undefined ? { retryAfterMs } : {}),
      body,
    });
  }
  return { body, requestId: res.headers.get('x-typesafe-request-id') };
}
