/**
 * Picks the classifier: MM3_PROVIDER=fake|chaos|typesafe wins; otherwise typesafe when a key is set, else
 * fake. providerIdentity names the one that would answer without building it (view needs it; it never calls).
 */
import { CHAOS_MODEL, createChaosAdapter, parseSchedule } from './chaos.ts';
import { createFakeAdapter, FAKE_MODEL } from './fake.ts';
import type { ClassifierPort } from './port.ts';
import { createTypesafeAdapter } from './typesafe/adapter.ts';
import { hasKey, resolveJevConfig, routeLabel, type JevFileConfig, type ProviderRoute, type ResolveStored } from './typesafe/client.ts';

type Env = Record<string, string | undefined>;

/** plan 2c B1: `MM3_PROVIDER` still wins outright (env > config > default); `deps.fileConfig?.provider`
 *  (config.yaml's `provider:` key) is the fallback when no env var names one at all — same precedence as every
 *  other config-aware field in this codebase. */
function wantedProvider(env: Env, deps: { fileConfig?: JevFileConfig }): string | undefined {
  return env.MM3_PROVIDER?.trim() || deps.fileConfig?.provider;
}

export function selectProvider(env: Env = process.env, deps: { fetch?: typeof fetch; chaosState?: string; resolveStored?: ResolveStored; fileConfig?: JevFileConfig } = {}): ClassifierPort {
  const wanted = wantedProvider(env, deps);
  if (wanted === 'fake') return createFakeAdapter();
  if (wanted === 'chaos') {
    const s = parseSchedule(env.MM3_CHAOS);
    if ('stop' in s) throw new Error(s.stop);
    return createChaosAdapter(s.steps, deps.chaosState);
  }
  if (wanted === 'typesafe') return createTypesafeAdapter(env, deps);
  if (wanted) throw new Error(`✖ provider: "${wanted}" is not a provider → use fake, chaos or typesafe`);
  return hasKey(resolveJevConfig(env, deps)) ? createTypesafeAdapter(env, deps) : createFakeAdapter();
}

/** The route (direct/gateway/custom, or fake/chaos) and base URL (null for fake/chaos) a run would use —
 *  shown in --dry-run and stored on the ledger run record, never the key itself. */
export interface ProviderIdentity {
  adapter: string;
  model: string;
  route: ProviderRoute | 'fake' | 'chaos';
  baseURL: string | null;
}

export function providerIdentity(env: Env = process.env, deps: { resolveStored?: ResolveStored; fileConfig?: JevFileConfig } = {}): ProviderIdentity {
  const wanted = wantedProvider(env, deps);
  if (wanted === 'fake') return { adapter: 'fake', model: FAKE_MODEL, route: 'fake', baseURL: null };
  if (wanted === 'chaos') return { adapter: 'chaos', model: CHAOS_MODEL, route: 'chaos', baseURL: null };
  try {
    const config = resolveJevConfig(env, deps);
    if (wanted === 'typesafe' || hasKey(config)) return { adapter: 'typesafe', model: config.model, route: routeLabel(config), baseURL: config.baseURL };
  } catch {
    // A config error (a floating model, a bad MM3_BASE_URL) leaves the route/base URL unknowable here;
    // `mm3 doctor` surfaces the real ✖ message instead of this best-effort fallback.
    return { adapter: 'typesafe', model: 'unknown', route: 'custom', baseURL: null };
  }
  return { adapter: 'fake', model: FAKE_MODEL, route: 'fake', baseURL: null };
}
