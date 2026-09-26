/**
 * Picks the classifier: SIDEWISE_PROVIDER=fake|chaos|typesafe wins; otherwise typesafe when a key is set, else
 * fake. providerIdentity names the one that would answer without building it (view needs it; it never calls).
 */
import { CHAOS_MODEL, createChaosAdapter, parseSchedule } from './chaos.ts';
import { createFakeAdapter, FAKE_MODEL } from './fake.ts';
import type { ClassifierPort } from './port.ts';
import { createTypesafeAdapter } from './typesafe/adapter.ts';
import { hasKey, resolveJevConfig, routeLabel, type ProviderRoute } from './typesafe/client.ts';

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

/** P2: the route (direct/gateway/custom, or fake/chaos) and base URL (null for fake/chaos) a run would use —
 *  shown in --dry-run and stored on the ledger run record, never the key itself. */
export interface ProviderIdentity {
  adapter: string;
  model: string;
  route: ProviderRoute | 'fake' | 'chaos';
  baseURL: string | null;
}

export function providerIdentity(env: Env = process.env): ProviderIdentity {
  const wanted = env.SIDEWISE_PROVIDER?.trim();
  if (wanted === 'fake') return { adapter: 'fake', model: FAKE_MODEL, route: 'fake', baseURL: null };
  if (wanted === 'chaos') return { adapter: 'chaos', model: CHAOS_MODEL, route: 'chaos', baseURL: null };
  try {
    const config = resolveJevConfig(env);
    if (wanted === 'typesafe' || hasKey(config)) return { adapter: 'typesafe', model: config.model, route: routeLabel(config), baseURL: config.baseURL };
  } catch {
    // A config error (a floating model, a bad SIDEWISE_BASE_URL) leaves the route/base URL unknowable here;
    // `sidewise doctor` (P5) surfaces the real ✖ message instead of this best-effort fallback.
    return { adapter: 'typesafe', model: 'unknown', route: 'custom', baseURL: null };
  }
  return { adapter: 'fake', model: FAKE_MODEL, route: 'fake', baseURL: null };
}
