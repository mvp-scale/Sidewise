/**
 * The `typesafe` ClassifierPort adapter, the only place Sidewise talks to a vendor. Every ask is ONE POST:
 * yes/no questions as noul, scales as score (criteria = the levels), choices as choice (criteria =
 * {option: option}), all in one questions map. A question about a sweep item sends structured instructions
 * {item, question}, so the classifier knows which entry of state.items it is about.
 */
import { registerSecret } from '../../ledger/redact.ts';
import type { ClassifierAnswer, ClassifierPort } from '../port.ts';
import { choiceQuestion, createJevClient, hasKey, JevConfigError, noulQuestion, resolveJevConfig, scoreQuestion, type JevQuestion, type JsonValue, type ResolveStored } from './client.ts';

export const NO_TYPESAFE_KEY_MESSAGE =
  '✖ provider: no TypeSafe key → set TYPESAFE_API_KEY or AI_GATEWAY_API_KEY, or SIDEWISE_PROVIDER=fake to try requests';

export function createTypesafeAdapter(
  env: Record<string, string | undefined> = process.env,
  deps: { fetch?: typeof fetch; resolveStored?: ResolveStored } = {},
): ClassifierPort {
  const config = resolveJevConfig(env, { resolveStored: deps.resolveStored });
  if (!hasKey(config)) throw new JevConfigError(NO_TYPESAFE_KEY_MESSAGE);
  registerSecret(config.apiKey); // defense in depth: a key from the keychain/user file never has env's own shape to pattern-match
  const client = createJevClient(config, deps);

  return {
    adapter: 'typesafe',
    model: config.model,
    async ask(questions, state) {
      if (!questions.length) return { answers: {}, costUsd: 0 };
      const wire: Record<string, JevQuestion> = {};
      for (const q of questions) {
        const instructions: JsonValue = q.item === undefined ? q.ask : { item: q.item, question: q.ask };
        wire[q.id] = q.type === 'noul' ? noulQuestion(instructions) : q.type === 'score' ? scoreQuestion(instructions, q.levels) : choiceQuestion(instructions, Object.keys(q.options));
      }
      const res = await client.ask({ state: state as { [key: string]: JsonValue }, questions: wire });
      const answers: Record<string, ClassifierAnswer> = {};
      for (const q of questions) {
        const a = res.answers[q.id]!;
        if (a.type === 'noul') answers[q.id] = { type: 'noul', probability: a.probability };
        else if (a.type === 'score') answers[q.id] = { type: 'score', score: a.score, distribution: a.distribution, confidence: a.confidence };
        else answers[q.id] = { type: 'choice', choice: a.choice, probabilities: a.probabilities, confidence: a.confidence };
      }
      return { answers, costUsd: res.costUsd, costEstimated: res.costEstimated };
    },
  };
}
