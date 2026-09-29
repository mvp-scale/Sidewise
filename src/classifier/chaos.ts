/**
 * The chaos provider (SIDEWISE_PROVIDER=chaos): the fake provider with scheduled faults, for the default tests
 * and the agent chaos run (test/chaos). SIDEWISE_CHAOS="503,malformed,ok" is used one step per call, in order;
 * past the end every call is ok. The position lives in a state file (the CLI uses .sidewise/chaos.json) under
 * its own lock, so separate runs share one schedule; it restarts when the schedule text changes. Offline and
 * deterministic, and its answers are labelled "not evidence" like the fake's.
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { withLock } from '../ledger/lock.ts';
import { clip } from '../util/text.ts';
import { createFakeAdapter } from './fake.ts';
import type { ClassifierAnswer, ClassifierPort } from './port.ts';
import { JevApiError } from './typesafe/config.ts';

export const CHAOS_STEPS = ['ok', '401', '429', '503', '529', 'timeout', 'malformed', 'missing'] as const;
export type ChaosStep = (typeof CHAOS_STEPS)[number];
export const CHAOS_MODEL = 'sidewise-chaos-1';

const HTTP: Partial<Record<ChaosStep, { status: number; text: string; retryable: boolean }>> = {
  '401': { status: 401, text: 'invalid API key', retryable: false },
  '429': { status: 429, text: 'rate limited', retryable: true },
  '503': { status: 503, text: 'service unavailable', retryable: true },
  '529': { status: 529, text: 'overloaded', retryable: true },
};

export function parseSchedule(raw: string | undefined): { steps: ChaosStep[] } | { stop: string } {
  const text = (raw ?? '').trim();
  if (!text) return { steps: [] };
  const steps = text.split(',').map((s) => s.trim());
  const bad = steps.find((s) => !(CHAOS_STEPS as readonly string[]).includes(s));
  if (bad !== undefined) return { stop: `✖ provider: SIDEWISE_CHAOS has "${clip(bad, 20)}" → use a comma list of ${CHAOS_STEPS.join(', ')}` };
  return { steps: steps as ChaosStep[] };
}

/** The next step: from memory, or shared across processes through stateFile. */
function stepper(steps: readonly ChaosStep[], stateFile: string | undefined): () => ChaosStep {
  let next = 0;
  const schedule = steps.join(',');
  return () => {
    if (!stateFile) return steps[next++] ?? 'ok';
    return withLock(`${stateFile}.lock`, () => {
      let at = 0;
      try {
        const s = JSON.parse(readFileSync(stateFile, 'utf8')) as { schedule?: unknown; next?: unknown };
        if (s.schedule === schedule && Number.isInteger(s.next)) at = s.next as number;
      } catch {
        /* missing or unreadable: start the schedule over */
      }
      mkdirSync(path.dirname(stateFile), { recursive: true });
      writeFileSync(`${stateFile}.tmp`, JSON.stringify({ schedule, next: at + 1 }));
      renameSync(`${stateFile}.tmp`, stateFile);
      return steps[at] ?? 'ok';
    });
  };
}

function broken(q: Parameters<ClassifierPort['ask']>[0][number]): ClassifierAnswer {
  if (q.type === 'noul') return { type: 'noul', probability: 1.4 };
  if (q.type === 'score') return { type: 'score', score: 0, distribution: q.levels.map(() => 1.4), confidence: 1 };
  const options = Object.keys(q.options);
  return { type: 'choice', choice: options[0]!, probabilities: Object.fromEntries(options.map((o) => [o, 1.4])), confidence: 1 };
}

export function createChaosAdapter(steps: readonly ChaosStep[], stateFile?: string): ClassifierPort {
  const fake = createFakeAdapter();
  const nextStep = stepper(steps, stateFile);
  return {
    adapter: 'chaos',
    model: CHAOS_MODEL,
    async ask(questions, state) {
      const step = nextStep();
      const http = HTTP[step];
      if (http) throw new JevApiError(`HTTP ${http.status}: ${http.text}`, { status: http.status, retryable: http.retryable });
      if (step === 'timeout') throw new JevApiError('request timed out after 20000ms', { retryable: true });
      const result = await fake.ask(questions, state);
      const first = questions[0];
      if (step === 'ok' || !first) return result;
      const answers = { ...result.answers };
      if (step === 'missing') delete answers[first.id];
      else answers[first.id] = broken(first);
      return { answers, costUsd: 0 };
    },
  };
}
