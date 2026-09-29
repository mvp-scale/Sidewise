/**
 * The fake provider (SIDEWISE_PROVIDER=fake, or no key): deterministic, seeded, free, no network. Its answers
 * are labeled "not evidence" wherever they are shown. A caller can pin an exact answer for one question id
 * under `state.__fake[id]` (a probability for noul, a level index for score, an option key for choice).
 */
import { seededRandom } from '../util/prng.ts';
import type {
  ChoiceAnswer,
  ChoiceQuestionSpec,
  ClassifierAnswer,
  ClassifierPort,
  ClassifierQuestion,
  ClassifierState,
  NoulAnswer,
  ScoreAnswer,
  ScoreQuestionSpec,
} from './port.ts';

export const FAKE_MODEL = 'sidewise-fake-1';

function pinned(state: ClassifierState, id: string): unknown {
  const table = state.__fake;
  return table && typeof table === 'object' ? (table as Record<string, unknown>)[id] : undefined;
}

function answerNoul(question: ClassifierQuestion, state: ClassifierState): NoulAnswer {
  const override = pinned(state, question.id);
  const probability = typeof override === 'number' ? override : seededRandom(`noul:${question.id}:${question.ask}`)();
  return { type: 'noul', probability };
}

function answerScore(question: ScoreQuestionSpec, state: ClassifierState): ScoreAnswer {
  const n = question.levels.length;
  const override = pinned(state, question.id);
  const idx = typeof override === 'number' ? Math.min(n - 1, Math.max(0, Math.round(override))) : Math.floor(seededRandom(`score:${question.id}:${question.ask}`)() * n);
  const peak = typeof override === 'number' ? 1 : 0.7;
  const distribution = Array.from({ length: n }, (_, i) => (i === idx ? peak : (1 - peak) / Math.max(1, n - 1)));
  const score = distribution.reduce((sum, p, i) => sum + p * i, 0);
  const confidence = (n * Math.max(...distribution) - 1) / (n - 1);
  return { type: 'score', score, distribution, confidence };
}

function answerChoice(question: ChoiceQuestionSpec, state: ClassifierState): ChoiceAnswer {
  const options = Object.keys(question.options);
  const override = pinned(state, question.id);
  const chosen = typeof override === 'string' && options.includes(override) ? override : options[Math.floor(seededRandom(`choice:${question.id}:${question.ask}`)() * options.length)]!;
  const probabilities: Record<string, number> = {};
  for (const o of options) probabilities[o] = o === chosen ? 0.7 : 0.3 / Math.max(1, options.length - 1);
  const k = options.length;
  return { type: 'choice', choice: chosen, probabilities, confidence: (k * 0.7 - 1) / (k - 1) };
}

export function createFakeAdapter(): ClassifierPort {
  return {
    adapter: 'fake',
    model: FAKE_MODEL,
    async ask(questions, state) {
      const answers: Record<string, ClassifierAnswer> = {};
      for (const q of questions) {
        answers[q.id] = q.type === 'noul' ? answerNoul(q, state) : q.type === 'score' ? answerScore(q, state) : answerChoice(q, state);
      }
      return { answers, costUsd: 0 };
    },
  };
}
