/**
 * The `typesafe` ClassifierPort adapter, the only place Sidewise talks to a vendor. Yes/no questions go in
 * one noul call; scale and direction questions go together in one choice call (a scale is asked as a choice
 * over its level labels and folded back into a level-ordered distribution). At most two HTTP calls per ask.
 */
import type {
  ChoiceQuestionSpec,
  ClassifierAnswer,
  ClassifierPort,
  ClassifierQuestion,
  NoulQuestion,
  ScoreQuestionSpec,
} from '../port.ts';
import { choiceQuestion, createJevClient, hasKey, JevConfigError, noulQuestion, resolveJevConfig, type JsonValue } from './client.ts';

export const NO_TYPESAFE_KEY_MESSAGE =
  '✖ provider: no TypeSafe key → set TYPESAFE_API_KEY or AI_GATEWAY_API_KEY, or SIDEWISE_PROVIDER=fake to try requests';

const isNoul = (q: ClassifierQuestion): q is NoulQuestion => q.type === 'noul';
const isChoice = (q: ClassifierQuestion): q is ChoiceQuestionSpec => q.type === 'choice';
const isScore = (q: ClassifierQuestion): q is ScoreQuestionSpec => q.type === 'score';
const addCost = (a: number | undefined, b: number | undefined): number | undefined => (a === undefined || b === undefined ? undefined : a + b);

export function createTypesafeAdapter(env: Record<string, string | undefined> = process.env, deps: { fetch?: typeof fetch } = {}): ClassifierPort {
  const config = resolveJevConfig(env);
  if (!hasKey(config)) throw new JevConfigError(NO_TYPESAFE_KEY_MESSAGE);
  const client = createJevClient(config, deps);

  return {
    adapter: 'typesafe',
    model: config.model,
    async ask(questions, state) {
      const wireState = state as unknown as { [key: string]: JsonValue };
      const answers: Record<string, ClassifierAnswer> = {};
      let costUsd: number | undefined = 0;

      const nouls = questions.filter(isNoul);
      if (nouls.length) {
        const res = await client.noul({ state: wireState, questions: Object.fromEntries(nouls.map((q) => [q.id, noulQuestion(q.ask)])) });
        for (const q of nouls) answers[q.id] = { type: 'noul', probability: res.answers[q.id]!.probability };
        costUsd = addCost(costUsd, res.costUsd);
      }

      const choices = questions.filter(isChoice);
      const scores = questions.filter(isScore);
      if (choices.length || scores.length) {
        const wire = Object.fromEntries([
          ...choices.map((q) => [q.id, choiceQuestion(q.ask, Object.keys(q.options))] as const),
          ...scores.map((q) => [q.id, choiceQuestion(q.ask, [...q.levels])] as const),
        ]);
        const res = await client.choice({ state: wireState, questions: wire });
        for (const q of choices) {
          const a = res.answers[q.id]!;
          answers[q.id] = { type: 'choice', choice: a.choice, probabilities: a.probabilities, confidence: a.confidence };
        }
        for (const q of scores) {
          const a = res.answers[q.id]!;
          const distribution = q.levels.map((level) => a.probabilities[level] ?? 0);
          answers[q.id] = { type: 'score', score: distribution.reduce((sum, p, i) => sum + p * i, 0), distribution, confidence: a.confidence };
        }
        costUsd = addCost(costUsd, res.costUsd);
      }

      return { answers, costUsd };
    },
  };
}
