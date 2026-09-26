/** A yes/no probability per question — the `noul` primitive. */
import { isRecord, num, readUsageAndCost, type JsonValue } from './wire.ts';
import { JevApiError } from './config.ts';

export interface JevNoulQuestion {
  type: 'noul';
  instructions: string;
}

export function noulQuestion(instructions: string): JevNoulQuestion {
  return { type: 'noul', instructions };
}

export interface JevNoulRequest {
  state: { [key: string]: JsonValue };
  questions: Record<string, JevNoulQuestion>;
}

export interface JevNoulAnswer {
  /** Probability of "yes", 0..1. */
  probability: number;
  /** Concentration confidence, 0..1 (fallback: |2p - 1|, the K=2 case of the score confidence formula). */
  confidence: number;
}

export interface JevNoulResponse {
  model: string;
  answers: Record<string, JevNoulAnswer>;
  usage: { inputTokens: number; outputTokens: number };
  costUsd?: number;
  requestId?: string;
}

function parseOneNoulAnswer(raw: unknown, id: string): JevNoulAnswer {
  if (!isRecord(raw)) throw new JevApiError(`malformed response: no answer for question "${id}"`, { retryable: false, body: raw });
  if (raw.type !== undefined && raw.type !== 'noul') {
    throw new JevApiError(`malformed response: answer "${id}" has type "${String(raw.type)}", expected "noul"`, { retryable: false, body: raw });
  }
  const probability = num(raw.noul, `${id}.noul`);
  if (probability < 0 || probability > 1) {
    throw new JevApiError(`malformed response: ${id}.noul must be in [0, 1], got ${probability}`, { retryable: false, body: raw });
  }
  const confidence = typeof raw.confidence === 'number' && Number.isFinite(raw.confidence) ? raw.confidence : Math.abs(2 * probability - 1);
  return { probability, confidence };
}

/** Parse a `/v1/systemone` body for noul questions. Throws JevApiError (non-retryable) if malformed. */
export function parseNoulResponse(raw: unknown, questionIds: readonly string[]): JevNoulResponse {
  if (!isRecord(raw) || !isRecord(raw.answers)) {
    throw new JevApiError('malformed response: missing `answers`', { retryable: false, body: raw });
  }
  const answers: Record<string, JevNoulAnswer> = {};
  for (const id of questionIds) answers[id] = parseOneNoulAnswer(raw.answers[id], id);
  return { model: typeof raw.model === 'string' ? raw.model : '', answers, ...readUsageAndCost(raw) };
}
