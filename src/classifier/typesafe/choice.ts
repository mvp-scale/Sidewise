/** A named-option distribution per question — the `choice` primitive. */
import { isRecord, num, readUsageAndCost, type JsonValue } from './wire.ts';
import { JevApiError } from './config.ts';

export interface JevChoiceQuestion {
  type: 'choice';
  instructions: string;
  /** 2-255 option labels (Jev types: choice ≤255 options). */
  options: string[];
}

export function choiceQuestion(instructions: string, options: string[]): JevChoiceQuestion {
  if (options.length < 2 || options.length > 255) {
    throw new RangeError(`a choice question needs 2-255 options, got ${options.length}`);
  }
  return { type: 'choice', instructions, options };
}

export interface JevChoiceRequest {
  state: { [key: string]: JsonValue };
  questions: Record<string, JevChoiceQuestion>;
}

export interface JevChoiceAnswer {
  /** The top option (server-reported if valid, else argmax of `probabilities`). */
  choice: string;
  /** Normalised to sum 1, keyed by option label. */
  probabilities: Record<string, number>;
  /** Concentration confidence, 0..1 (fallback: (K·pmax − 1) / (K − 1), K = option count). */
  confidence: number;
}

export interface JevChoiceResponse {
  model: string;
  answers: Record<string, JevChoiceAnswer>;
  usage: { inputTokens: number; outputTokens: number };
  costUsd?: number;
  requestId?: string;
}

function normalizedProbabilityMap(raw: unknown, id: string): Record<string, number> {
  if (!isRecord(raw)) throw new JevApiError(`malformed response: ${id}.probabilities must be an object`, { retryable: false, body: raw });
  const values: Record<string, number> = {};
  let sum = 0;
  for (const [option, v] of Object.entries(raw)) {
    const n = num(v, `${id}.probabilities.${option}`);
    if (n < 0) throw new JevApiError(`malformed response: ${id}.probabilities.${option} is negative`, { retryable: false, body: raw });
    values[option] = n;
    sum += n;
  }
  if (sum <= 0) throw new JevApiError(`malformed response: ${id}.probabilities sum to zero`, { retryable: false, body: raw });
  for (const option of Object.keys(values)) values[option] = values[option]! / sum;
  return values;
}

function pickChoice(raw: Record<string, unknown>, question: JevChoiceQuestion, probabilities: Record<string, number>): string {
  if (typeof raw.choice === 'string' && question.options.includes(raw.choice)) return raw.choice;
  return question.options.reduce((best, o) => ((probabilities[o] ?? 0) > (probabilities[best] ?? 0) ? o : best), question.options[0]!);
}

function parseOneChoiceAnswer(raw: unknown, id: string, question: JevChoiceQuestion): JevChoiceAnswer {
  if (!isRecord(raw)) throw new JevApiError(`malformed response: no answer for question "${id}"`, { retryable: false, body: raw });
  if (raw.type !== undefined && raw.type !== 'choice') {
    throw new JevApiError(`malformed response: answer "${id}" has type "${String(raw.type)}", expected "choice"`, { retryable: false, body: raw });
  }
  const probabilities = normalizedProbabilityMap(raw.probabilities, id);
  for (const option of Object.keys(probabilities)) {
    if (!question.options.includes(option)) {
      throw new JevApiError(`malformed response: ${id}.probabilities has option "${option}", not in the request's options`, { retryable: false, body: raw });
    }
  }
  const choice = pickChoice(raw, question, probabilities);
  const k = question.options.length;
  const pmax = Math.max(...question.options.map((o) => probabilities[o] ?? 0));
  const confidence = typeof raw.confidence === 'number' && Number.isFinite(raw.confidence) ? raw.confidence : (k * pmax - 1) / (k - 1);
  return { choice, probabilities, confidence };
}

/** Parse a `/v1/systemone` body for choice questions. `questions` (the request) supplies each id's option list. */
export function parseChoiceResponse(raw: unknown, questions: Record<string, JevChoiceQuestion>): JevChoiceResponse {
  if (!isRecord(raw) || !isRecord(raw.answers)) {
    throw new JevApiError('malformed response: missing `answers`', { retryable: false, body: raw });
  }
  const answers: Record<string, JevChoiceAnswer> = {};
  for (const [id, question] of Object.entries(questions)) answers[id] = parseOneChoiceAnswer(raw.answers[id], id, question);
  return { model: typeof raw.model === 'string' ? raw.model : '', answers, ...readUsageAndCost(raw) };
}
