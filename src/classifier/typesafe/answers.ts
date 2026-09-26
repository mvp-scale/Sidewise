/**
 * The three TypeSafe primitives on the wire (docs.typesafe.ai/api): building questions and reading answers.
 *   noul   → P(yes)
 *   choice → criteria {option: description}; a distribution over the options
 *   score  → criteria [levels]; probabilities keyed "0".."n-1", read back into a level-ordered distribution
 * One request may mix all three in its questions map; answers come back under the same keys. `instructions`
 * may be text or structured JSON ({item, question} for a sweep item).
 */
import { JevApiError } from './config.ts';
import { isRecord, num, readUsageAndCost, type JsonValue } from './wire.ts';

export type JevQuestion =
  | { type: 'noul'; instructions: JsonValue }
  | { type: 'choice'; instructions: JsonValue; criteria: Record<string, JsonValue> }
  | { type: 'score'; instructions: JsonValue; criteria: JsonValue[] };

export function noulQuestion(instructions: JsonValue): JevQuestion {
  return { type: 'noul', instructions };
}

export function choiceQuestion(instructions: JsonValue, options: readonly string[]): JevQuestion {
  if (options.length < 2 || options.length > 255 || new Set(options).size !== options.length) {
    throw new RangeError(`a choice question needs 2-255 distinct options, got ${options.length}`);
  }
  return { type: 'choice', instructions, criteria: Object.fromEntries(options.map((o) => [o, o])) };
}

export function scoreQuestion(instructions: JsonValue, levels: readonly string[]): JevQuestion {
  if (levels.length < 2 || levels.length > 10) throw new RangeError(`a score question needs 2-10 levels, got ${levels.length}`);
  return { type: 'score', instructions, criteria: [...levels] };
}

export type JevAnswer =
  | { type: 'noul'; probability: number; confidence: number }
  | { type: 'choice'; choice: string; probabilities: Record<string, number>; confidence: number }
  | { type: 'score'; score: number; distribution: number[]; confidence: number };

export interface JevRequest {
  state: { [key: string]: JsonValue };
  questions: Record<string, JevQuestion>;
}

export interface JevResponse {
  model: string;
  answers: Record<string, JevAnswer>;
  usage: { inputTokens: number; outputTokens: number };
  costUsd?: number;
  requestId?: string;
}

const malformed = (message: string, body: unknown): JevApiError => new JevApiError(`malformed response: ${message}`, { retryable: false, body });

const confidenceOr = (raw: Record<string, unknown>, fallback: number): number =>
  typeof raw.confidence === 'number' && Number.isFinite(raw.confidence) ? raw.confidence : fallback;

/** Non-negative finite values, normalized to sum 1. */
function normalized(values: number[], id: string, body: unknown): number[] {
  const sum = values.reduce((s, v) => s + v, 0);
  if (sum <= 0) throw malformed(`${id}.probabilities sum to zero`, body);
  return values.map((v) => v / sum);
}

function probabilityAt(raw: Record<string, unknown>, key: string, id: string): number {
  const probs = raw.probabilities as Record<string, unknown>;
  if (probs[key] === undefined) return 0;
  const v = num(probs[key], `${id}.probabilities.${key}`);
  if (v < 0) throw malformed(`${id}.probabilities.${key} is negative`, raw);
  return v;
}

function readNoul(raw: Record<string, unknown>, id: string): JevAnswer {
  const probability = num(raw.noul, `${id}.noul`);
  if (probability < 0 || probability > 1) throw malformed(`${id}.noul must be in [0, 1], got ${probability}`, raw);
  return { type: 'noul', probability, confidence: confidenceOr(raw, Math.abs(2 * probability - 1)) };
}

function readChoice(raw: Record<string, unknown>, id: string, options: string[]): JevAnswer {
  if (!isRecord(raw.probabilities)) throw malformed(`${id}.probabilities must be an object`, raw);
  for (const o of Object.keys(raw.probabilities)) {
    if (!options.includes(o)) throw malformed(`${id}.probabilities has option "${o}", not in the request's options`, raw);
  }
  const dist = normalized(options.map((o) => probabilityAt(raw, o, id)), id, raw);
  const probabilities = Object.fromEntries(options.map((o, i) => [o, dist[i]!]));
  const choice =
    typeof raw.choice === 'string' && options.includes(raw.choice) ? raw.choice : options.reduce((best, o) => (probabilities[o]! > probabilities[best]! ? o : best), options[0]!);
  const k = options.length;
  return { type: 'choice', choice, probabilities, confidence: confidenceOr(raw, (k * Math.max(...dist) - 1) / (k - 1)) };
}

function readScore(raw: Record<string, unknown>, id: string, n: number): JevAnswer {
  if (!isRecord(raw.probabilities)) throw malformed(`${id}.probabilities must be an object`, raw);
  for (const key of Object.keys(raw.probabilities)) {
    if (!/^\d+$/u.test(key) || Number(key) >= n) throw malformed(`${id}.probabilities has level "${key}", but the question has ${n} levels`, raw);
  }
  const distribution = normalized(Array.from({ length: n }, (_, i) => probabilityAt(raw, String(i), id)), id, raw);
  const score = typeof raw.score === 'number' && Number.isFinite(raw.score) ? raw.score : distribution.reduce((s, p, i) => s + p * i, 0);
  return { type: 'score', score, distribution, confidence: confidenceOr(raw, (n * Math.max(...distribution) - 1) / (n - 1)) };
}

/** Parse a /v1/systemone body against the questions that were sent. Throws JevApiError (non-retryable) if malformed. */
export function parseAnswers(raw: unknown, questions: Record<string, JevQuestion>): Omit<JevResponse, 'requestId'> {
  if (!isRecord(raw) || !isRecord(raw.answers)) throw malformed('missing `answers`', raw);
  const answers: Record<string, JevAnswer> = {};
  for (const [id, q] of Object.entries(questions)) {
    const a = raw.answers[id];
    if (!isRecord(a)) throw malformed(`no answer for question "${id}"`, a);
    if (a.type !== undefined && a.type !== q.type) throw malformed(`answer "${id}" has type "${String(a.type)}", expected "${q.type}"`, a);
    answers[id] = q.type === 'noul' ? readNoul(a, id) : q.type === 'choice' ? readChoice(a, id, Object.keys(q.criteria)) : readScore(a, id, q.criteria.length);
  }
  return { model: typeof raw.model === 'string' ? raw.model : '', answers, ...readUsageAndCost(raw) };
}
