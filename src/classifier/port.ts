/**
 * The one port every classifier verb calls through. Question and answer shapes mirror the classifier's
 * three primitives: noul (yes/no probability), score (distribution over ordered levels) and choice
 * (distribution over named options). Nothing here knows about HTTP, keys or any vendor.
 */
export interface NoulQuestion {
  readonly type: 'noul';
  readonly id: string;
  readonly ask: string;
  /** A sweep item's id: the question is about that entry of state.items (sent as {item, question}). */
  readonly item?: string;
}

export interface ScoreQuestionSpec {
  readonly type: 'score';
  readonly id: string;
  readonly ask: string;
  /** Level labels, low to high, 2-10 of them. */
  readonly levels: readonly string[];
  /** A sweep item's id: the question is about that entry of state.items (sent as {item, question}). */
  readonly item?: string;
}

export interface ChoiceQuestionSpec {
  readonly type: 'choice';
  readonly id: string;
  readonly ask: string;
  /** option key -> description, 2-255 of them. */
  readonly options: Record<string, string>;
  /** A sweep item's id: the question is about that entry of state.items (sent as {item, question}). */
  readonly item?: string;
}

export type ClassifierQuestion = NoulQuestion | ScoreQuestionSpec | ChoiceQuestionSpec;

export interface NoulAnswer {
  readonly type: 'noul';
  readonly probability: number;
}

export interface ScoreAnswer {
  readonly type: 'score';
  readonly score: number;
  readonly distribution: readonly number[];
  readonly confidence: number;
}

export interface ChoiceAnswer {
  readonly type: 'choice';
  readonly choice: string;
  readonly probabilities: Record<string, number>;
  readonly confidence: number;
}

export type ClassifierAnswer = NoulAnswer | ScoreAnswer | ChoiceAnswer;

/** Free-form evidence every question is asked against (focus, problem, code excerpts). */
export type ClassifierState = Record<string, unknown>;

export interface ClassifierResult {
  readonly answers: Record<string, ClassifierAnswer>;
  /** Spend reported by the provider for this call in USD; undefined when the provider does not report it. */
  readonly costUsd: number | undefined;
  /** True when `costUsd` was estimated from tokens (a published rate), not reported by the provider. */
  readonly costEstimated?: boolean;
}

export interface ClassifierPort {
  readonly adapter: string;
  readonly model: string;
  ask(questions: readonly ClassifierQuestion[], state: ClassifierState): Promise<ClassifierResult>;
}

/** Providers whose answers are rehearsals, never evidence: labelled in every answer, never reused by a real run. */
export const REHEARSAL_ADAPTERS: readonly string[] = ['fake', 'chaos'];
export const isRehearsal = (adapter: string): boolean => REHEARSAL_ADAPTERS.includes(adapter);
