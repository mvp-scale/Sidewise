/**
 * The TypeSafe `/v1/systemone` client: noul (yes/no probability) and choice (named-option distribution),
 * one POST each, with a timeout, abort wiring and HTTP-to-error mapping (wire.ts). Wire format:
 *
 *   POST {baseURL}/v1/systemone          Authorization: Bearer <key>
 *   { model, state, questions: { <id>: { type: 'noul', instructions } | { type: 'choice', instructions, options } } }
 *   → { model, answers: { <id>: { noul, confidence } | { choice, probabilities, confidence } }, usage, provider_metadata? }
 *
 * Routes: direct = https://api.typesafe.ai (TYPESAFE_API_KEY, pinned `jev-<version>`);
 *         gateway = https://ai-gateway.vercel.sh/typesafe (AI_GATEWAY_API_KEY, `typesafe-ai/jev`).
 * Calling fetch directly keeps timeouts, errors and the wire shape under our tests with no dependency.
 */
import { parseChoiceResponse, type JevChoiceRequest, type JevChoiceResponse } from './choice.ts';
import { JevConfigError, type JevConfig } from './config.ts';
import { parseNoulResponse, type JevNoulRequest, type JevNoulResponse } from './noul.ts';
import { buildPayload, postSystemOne } from './wire.ts';

export * from './choice.ts';
export * from './config.ts';
export * from './noul.ts';
export * from './wire.ts';

export interface JevClient {
  readonly config: JevConfig;
  /** A yes/no probability per question. One HTTP round trip; throws JevApiError. */
  noul(request: JevNoulRequest, opts?: { signal?: AbortSignal }): Promise<JevNoulResponse>;
  /** A named-option distribution per question. One HTTP round trip; throws JevApiError. */
  choice(request: JevChoiceRequest, opts?: { signal?: AbortSignal }): Promise<JevChoiceResponse>;
}

const NO_KEY_MESSAGE = '✖ provider: no TypeSafe key → set TYPESAFE_API_KEY (direct) or AI_GATEWAY_API_KEY (gateway), or SIDEWISE_PROVIDER=fake to try requests';

export function createJevClient(config: JevConfig, deps: { fetch?: typeof fetch } = {}): JevClient {
  const key = config.apiKey;
  if (key === undefined) throw new JevConfigError(NO_KEY_MESSAGE);
  const doFetch = deps.fetch ?? globalThis.fetch;
  return {
    config,
    async noul(request, opts = {}) {
      const { body, requestId } = await postSystemOne(config, doFetch, key, buildPayload(request, config.wireModel), opts);
      const parsed = parseNoulResponse(body, Object.keys(request.questions));
      return requestId ? { ...parsed, requestId } : parsed;
    },
    async choice(request, opts = {}) {
      const { body, requestId } = await postSystemOne(config, doFetch, key, buildPayload(request, config.wireModel), opts);
      const parsed = parseChoiceResponse(body, request.questions);
      return requestId ? { ...parsed, requestId } : parsed;
    },
  };
}
