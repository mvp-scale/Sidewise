/**
 * The one resolver: where a TypeSafe/gateway key lives outside env — the OS keychain first (keychain.ts), then
 * the user env file (env-file.ts). Both are written only by `mm3 init` and read by init (to show "already
 * set, replace?"), doctor (to show the source) and, through config.ts's `deps.resolveStored`, a real
 * classifier call.
 *
 * Keychain account "typesafe" is a single fixed slot — it has no room for a second field saying "this key is
 * for the gateway" — so only the TypeSafe-direct provider choice ever goes to the keychain; a gateway key
 * always goes to the env file, which can say so (`export AI_GATEWAY_API_KEY='...'`).
 */
import type { StoredKey } from '../classifier/typesafe/config.ts';
import { envFilePath, readEnvFile, removeEnvFileValue, setEnvFileValue } from './env-file.ts';
import { keychainLookup, keychainRemove, keychainStore } from './keychain.ts';
import type { Runner } from './runner.ts';

type Env = Record<string, string | undefined>;

/** Key resolution's second and third sources (config.ts's `deps.resolveStored`; env, the first source, is
 *  config.ts's own job). A missing tool, a locked keychain, or no file at all all read the same here —
 *  undefined — so the caller just moves on to the next source, or to "no key configured" (the fake provider). */
export function resolveStoredKey(runner: Runner, platform: NodeJS.Platform, env: Env = process.env): StoredKey | undefined {
  const fromKeychain = keychainLookup(runner, platform);
  if (fromKeychain) return { apiKey: fromKeychain, source: 'keychain', provider: 'typesafe' };
  const file = readEnvFile(envFilePath(env));
  if (file?.values.TYPESAFE_API_KEY) return { apiKey: file.values.TYPESAFE_API_KEY, source: 'file', provider: 'typesafe' };
  if (file?.values.AI_GATEWAY_API_KEY) return { apiKey: file.values.AI_GATEWAY_API_KEY, source: 'file', provider: 'gateway' };
  return undefined;
}

export interface StoreKeyResult {
  stored: 'keychain' | 'file';
  /** Where it landed, for the step line: "OS keychain", or the env file's path. */
  detail: string;
}

/** Storage, first that works (init's own key step): the keychain for a TypeSafe-direct key, else the env file
 *  for either provider — updating just that one name's line, in place. */
export function storeKey(runner: Runner, platform: NodeJS.Platform, env: Env, provider: 'typesafe' | 'gateway', secret: string): StoreKeyResult {
  if (provider === 'typesafe' && keychainStore(runner, platform, secret) === 'stored') {
    return { stored: 'keychain', detail: 'OS keychain' };
  }
  const file = envFilePath(env);
  setEnvFileValue(file, provider === 'typesafe' ? 'TYPESAFE_API_KEY' : 'AI_GATEWAY_API_KEY', secret);
  return { stored: 'file', detail: file };
}

/** Removes a stored key from wherever it landed (uninstall's "the stored key" step). Never throws for "there
 *  was nothing to remove" — that's `removed: []`, not a stop. Only ever touches the two key names in the env
 *  file; every other line (comments, TYPESAFE_BASE_URL, ...) is left exactly as the user wrote it. */
export function removeStoredKey(runner: Runner, platform: NodeJS.Platform, env: Env): { removed: Array<'keychain' | 'file'> } {
  const removed: Array<'keychain' | 'file'> = [];
  if (keychainRemove(runner, platform)) removed.push('keychain');
  const file = envFilePath(env);
  const a = removeEnvFileValue(file, 'TYPESAFE_API_KEY');
  const b = removeEnvFileValue(file, 'AI_GATEWAY_API_KEY');
  if (a !== 'absent' || b !== 'absent') removed.push('file');
  return { removed };
}
