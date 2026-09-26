/** A scripted ClassifierPort for verb tests: yes/no by function, scale/direction by picked option, records every call. */
import type { ClassifierAnswer, ClassifierPort, ClassifierQuestion, ClassifierState } from '../../src/classifier/port.ts';

export interface Stub extends ClassifierPort {
  calls: { questions: readonly ClassifierQuestion[]; state: ClassifierState }[];
}

export function stubProvider(
  opts: { yes?: (q: ClassifierQuestion) => number; pick?: Record<string, string>; costUsd?: number | undefined; fail?: string; adapter?: string } = {},
): Stub {
  const calls: Stub['calls'] = [];
  const costUsd = 'costUsd' in opts ? opts.costUsd : 0;
  const spread = (options: readonly string[], chosen: string) => {
    const other = options.length > 1 ? 0.1 / (options.length - 1) : 0;
    return options.map((o) => (o === chosen ? 0.9 : other));
  };
  return {
    adapter: opts.adapter ?? 'stub',
    model: 'stub-1',
    calls,
    async ask(questions, state) {
      calls.push({ questions, state });
      if (opts.fail) throw new Error(opts.fail);
      const answers: Record<string, ClassifierAnswer> = {};
      for (const q of questions) {
        if (q.type === 'noul') {
          answers[q.id] = { type: 'noul', probability: opts.yes?.(q) ?? 0.5 };
        } else if (q.type === 'score') {
          const chosen = opts.pick?.[q.id] ?? q.levels[0]!;
          const distribution = spread(q.levels, chosen);
          answers[q.id] = { type: 'score', score: q.levels.indexOf(chosen), distribution, confidence: 0.9 };
        } else {
          const options = Object.keys(q.options);
          const chosen = opts.pick?.[q.id] ?? options[0]!;
          const probs = spread(options, chosen);
          answers[q.id] = { type: 'choice', choice: chosen, probabilities: Object.fromEntries(options.map((o, i) => [o, probs[i]!])), confidence: 0.9 };
        }
      }
      return { answers, costUsd };
    },
  };
}
