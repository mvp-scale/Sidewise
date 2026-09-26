/**
 * The TypeSafe `/v1/systemone` client: one POST per ask, mixing noul (yes/no probability), choice
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
 */
import { parseAnswers, type JevRequest, type JevResponse } from './answers.ts';
import { JevConfigError, type JevConfig } from './config.ts';
import { buildPayload, postSystemOne } from './wire.ts';

export * from './answers.ts';
export * from './config.ts';
export * from './wire.ts';

export interface JevClient {
  readonly config: JevConfig;
  /** Every question in one HTTP round trip (noul, choice and score may be mixed); throws JevApiError. */
  ask(request: JevRequest, opts?: { signal?: AbortSignal }): Promise<JevResponse>;
}

const NO_KEY_MESSAGE = '✖ provider: no TypeSafe key → set TYPESAFE_API_KEY (direct) or AI_GATEWAY_API_KEY (gateway), or SIDEWISE_PROVIDER=fake to try requests';

export function createJevClient(config: JevConfig, deps: { fetch?: typeof fetch } = {}): JevClient {
  const key = config.apiKey;
  if (key === undefined) throw new JevConfigError(NO_KEY_MESSAGE);
  const doFetch = deps.fetch ?? globalThis.fetch;
  return {
    config,
    async ask(request, opts = {}) {
      const { body, requestId } = await postSystemOne(config, doFetch, key, buildPayload(request, config.wireModel), opts);
      const parsed = parseAnswers(body, request.questions);
      return requestId ? { ...parsed, requestId } : parsed;
    },
  };
}
