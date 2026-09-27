/**
 * The TypeSafe `/v1/systemone` client: one ask() = one or more POSTs, mixing noul (yes/no probability), choice
 * (named-option distribution) and score (level distribution) in one `questions` map, with a timeout, abort
 * wiring and HTTP-to-error mapping (wire.ts). Wire format:
 *
 *   POST {baseURL}/v1/systemone          Authorization: Bearer <key>
 *   { model, state, questions: { <id>: noul | choice (criteria {option: …}) | score (criteria [levels]) } }
 *   → { model, answers: { <id>: { noul } | { choice, probabilities, confidence } | { score, legend, probabilities, confidence } }, usage, provider_metadata? }
 *
 * Routes: direct = https://api.typesafe.ai (TYPESAFE_API_KEY, pinned `jev-<version>`);
 *         gateway = https://ai-gateway.vercel.sh/typesafe (AI_GATEWAY_API_KEY, `typesafe-ai/jev`).
 * Calling fetch directly keeps timeouts, errors and the wire shape under our tests with no dependency.
 *
 * Retry (P8): a retryable failure (wire.ts's JevApiError#retryable — 408/429/5xx and network/timeout errors;
 * never 401/422/other 4xx) gets up to MAX_RETRIES more tries, honouring the server's own Retry-After when it
 * sends one, else exponential backoff with jitter, capped per wait. Every attempt is still exactly one
 * postSystemOne round trip; from pay.ts's side this is still ONE ask() call either way. A failed attempt's
 * body carries no usage/cost field at all (see test/contract/fixtures/wire/errors/*.json: TypeSafe only reports
 * usage/cost on a 2xx body — readUsageAndCost in wire.ts is never reached for an error status), so a retried
 * attempt that ultimately fails adds no spend askAll doesn't already see: ask() still resolves with exactly one
 * costUsd, from whichever attempt actually returned a body, or throws with none at all.
 */
import { parseAnswers, type JevRequest, type JevResponse } from './answers.ts';
import { JevApiError, JevConfigError, type JevConfig } from './config.ts';
import { buildPayload, postSystemOne } from './wire.ts';

export * from './answers.ts';
export * from './config.ts';
export * from './wire.ts';

interface JevClient {
  readonly config: JevConfig;
  /** Every question in one HTTP round trip (noul, choice and score may be mixed), retried per the module
   *  doc's rule; throws JevApiError once retries (if any) are exhausted. */
  ask(request: JevRequest, opts?: { signal?: AbortSignal }): Promise<JevResponse>;
}

const NO_KEY_MESSAGE = '✖ provider: no TypeSafe key → set TYPESAFE_API_KEY (direct) or AI_GATEWAY_API_KEY (gateway), or SIDEWISE_PROVIDER=fake to try requests';

/** Retries beyond the first attempt: 2 more tries, 3 attempts total (the P8 ruling). */
const MAX_RETRIES = 2;
const BASE_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 10_000;
const defaultSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** attempt 1 (the first retry) waits ~1s, attempt 2 ~2s — doubling, capped — plus up to 20% jitter so several
 *  callers backing off at once don't all wake in lockstep. */
function backoffMs(attempt: number): number {
  const base = Math.min(BASE_BACKOFF_MS * 2 ** (attempt - 1), MAX_BACKOFF_MS);
  return Math.min(base + Math.random() * base * 0.2, MAX_BACKOFF_MS);
}

export function createJevClient(config: JevConfig, deps: { fetch?: typeof fetch; sleep?: (ms: number) => Promise<void> } = {}): JevClient {
  const key = config.apiKey;
  if (key === undefined) throw new JevConfigError(NO_KEY_MESSAGE);
  const doFetch = deps.fetch ?? globalThis.fetch;
  const sleep = deps.sleep ?? defaultSleep;
  return {
    config,
    async ask(request, opts = {}) {
      const payload = buildPayload(request, config.wireModel);
      for (let attempt = 1; ; attempt++) {
        try {
          const { body, requestId } = await postSystemOne(config, doFetch, key, payload, opts);
          const parsed = parseAnswers(body, request.questions);
          return requestId ? { ...parsed, requestId } : parsed;
        } catch (e) {
          if (!(e instanceof JevApiError) || !e.retryable || attempt > MAX_RETRIES) throw e;
          const waitMs = e.retryAfterMs !== undefined ? Math.min(e.retryAfterMs, MAX_BACKOFF_MS) : backoffMs(attempt);
          await sleep(waitMs);
        }
      }
    },
  };
}
