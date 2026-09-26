/**
 * doctor: plumbing, not a verb (owner ruling, P5: the one exception to "no new tools"). Free — no classifier
 * call, no budget touched, no ledger write — so an agent can check what a real call WOULD do before spending
 * anything: which provider/route/base URL would answer, whether a key is set (never its value), the pinned
 * model, whether a project/ledger is reachable from here, and the Node/node:sqlite runtime. A bad config (a
 * floating JEV_MODEL, a bad SIDEWISE_BASE_URL) stops here at exit 2 with the exact same ✖ message a paid verb
 * would give, just without ever risking a spend to find it out.
 */
import path from 'node:path';
import { CHAOS_MODEL } from '../classifier/chaos.ts';
import { FAKE_MODEL } from '../classifier/fake.ts';
import { hasKey, JevConfigError, resolveJevConfig, routeLabel, type JevConfig } from '../classifier/typesafe/client.ts';
import { emit, m, type Value } from '../contract/emit.ts';
import { sqliteAvailable } from '../ledger/index.ts';
import type { SidewisePaths } from '../ledger/paths.ts';
import type { VerbResult } from './types.ts';

interface Identity {
  adapter: string;
  route: string;
  model: string;
  wireModel?: string;
  baseURL: string | null;
}

/** Same key-selection rule as selectProvider (select.ts), but never builds a client — this never calls out. */
function identityFor(env: Record<string, string | undefined>, config: JevConfig): Identity {
  const wanted = env.SIDEWISE_PROVIDER?.trim();
  if (wanted === 'chaos') return { adapter: 'chaos', route: 'chaos', model: CHAOS_MODEL, baseURL: null };
  const usingTypesafe = wanted === 'typesafe' || (wanted !== 'fake' && hasKey(config));
  if (!usingTypesafe) return { adapter: 'fake', route: 'fake', model: FAKE_MODEL, baseURL: null };
  const route = routeLabel(config);
  return {
    adapter: 'typesafe',
    route,
    model: config.model,
    baseURL: config.baseURL,
    ...(config.route === 'gateway' ? { wireModel: config.wireModel } : {}),
  };
}

const yesNo = (v: string | undefined): 'yes' | 'no' => (v?.trim() ? 'yes' : 'no');

export function runDoctor(env: Record<string, string | undefined>, paths: SidewisePaths | undefined, nodeVersion: string = process.version): VerbResult {
  let config: JevConfig;
  try {
    config = resolveJevConfig(env);
  } catch (e) {
    if (e instanceof JevConfigError) return { exit: 2, text: `${e.message}\n` };
    throw e;
  }

  const who = identityFor(env, config);
  const project = paths ? path.relative(process.cwd(), paths.root) || '.' : 'none';
  const notes = paths ? ['free: no call, no spend'] : ['free: no call, no spend', 'no project found here or above → run inside one, or set SIDEWISE_HOME'];

  const doc = m(
    [
      'doctor',
      m(
        ['provider', who.adapter],
        ['route', who.route],
        ...(who.baseURL ? [['baseURL', who.baseURL] as [string, Value]] : []),
        ['model', who.model],
        ...(who.wireModel ? [['wireModel', who.wireModel] as [string, Value]] : []),
        ['keys', m(['TYPESAFE_API_KEY', yesNo(env.TYPESAFE_API_KEY)], ['AI_GATEWAY_API_KEY', yesNo(env.AI_GATEWAY_API_KEY)])],
        ['project', project],
        ['node', nodeVersion],
        ['index', sqliteAvailable() ? 'node:sqlite' : 'linear fallback (Node < 22.13)'],
      ),
    ],
    ['notes', notes],
  );
  return { exit: 0, text: emit(doc) };
}
