/**
 * Picks the classifier: SIDEWISE_PROVIDER=fake|chaos|typesafe wins; otherwise typesafe when a key is set, else
 * fake. providerIdentity names the one that would answer without building it (view needs it; it never calls).
 */
import { CHAOS_MODEL, createChaosAdapter, parseSchedule } from './chaos.ts';
import { createFakeAdapter, FAKE_MODEL } from './fake.ts';
import type { ClassifierPort } from './port.ts';
import { createTypesafeAdapter } from './typesafe/adapter.ts';
import { hasKey, resolveJevConfig } from './typesafe/client.ts';

type Env = Record<string, string | undefined>;

export function selectProvider(env: Env = process.env, deps: { fetch?: typeof fetch; chaosState?: string } = {}): ClassifierPort {
  const wanted = env.SIDEWISE_PROVIDER?.trim();
  if (wanted === 'fake') return createFakeAdapter();
  if (wanted === 'chaos') {
    const s = parseSchedule(env.SIDEWISE_CHAOS);
    if ('stop' in s) throw new Error(s.stop);
    return createChaosAdapter(s.steps, deps.chaosState);
  }
  if (wanted === 'typesafe') return createTypesafeAdapter(env, deps);
  if (wanted) throw new Error(`✖ provider: "${wanted}" is not a provider → use fake, chaos or typesafe`);
  return hasKey(resolveJevConfig(env)) ? createTypesafeAdapter(env, deps) : createFakeAdapter();
}

export function providerIdentity(env: Env = process.env): { adapter: string; model: string } {
  const wanted = env.SIDEWISE_PROVIDER?.trim();
  if (wanted === 'fake') return { adapter: 'fake', model: FAKE_MODEL };
  if (wanted === 'chaos') return { adapter: 'chaos', model: CHAOS_MODEL };
  try {
    const config = resolveJevConfig(env);
    if (wanted === 'typesafe' || hasKey(config)) return { adapter: 'typesafe', model: config.model };
  } catch {
    return { adapter: 'typesafe', model: 'unknown' };
  }
  return { adapter: 'fake', model: FAKE_MODEL };
}
