/** Picks the classifier: SIDEWISE_PROVIDER=fake|typesafe wins; otherwise typesafe when a key is set, else fake. */
import { createFakeAdapter } from './fake.ts';
import type { ClassifierPort } from './port.ts';
import { createTypesafeAdapter } from './typesafe/adapter.ts';
import { hasKey, resolveJevConfig } from './typesafe/client.ts';

export function selectProvider(env: Record<string, string | undefined> = process.env, deps: { fetch?: typeof fetch } = {}): ClassifierPort {
  const wanted = env.SIDEWISE_PROVIDER?.trim();
  if (wanted === 'fake') return createFakeAdapter();
  if (wanted === 'typesafe') return createTypesafeAdapter(env, deps);
  if (wanted) throw new Error(`✖ provider: "${wanted}" is not a provider → use fake or typesafe`);
  return hasKey(resolveJevConfig(env)) ? createTypesafeAdapter(env, deps) : createFakeAdapter();
}
