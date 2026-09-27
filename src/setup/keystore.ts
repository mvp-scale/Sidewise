/**
 * Where a TypeSafe/gateway key lives outside env (the owner ruling that replaces AGENTS.md rule 6): the OS
 * keychain first, then a user-only credentials file. Both are written only by `sidewise init` (setup/init.ts)
 * and read by init (to show "already set, replace?"), doctor (to show the source) and, through
 * config.ts's `deps.resolveStored`, a real classifier call.
 *
 * Keychain account "typesafe" is a single fixed slot per platform's own generic-password store — it has no
 * room for a second field saying "this key is for the gateway", so only the TypeSafe-direct provider choice
 * ever goes to the keychain; a gateway key always goes to the credentials file, which can say so
 * (`{"gateway": "<key>"}`). This is this task's own simplification where the spec's literal keychain commands
 * (always `-a typesafe` / `account typesafe`) left the gateway case unaddressed.
 *
 * macOS storage always falls through to the file: `security add-generic-password -w` takes the password only
 * as its own argument or via an interactive Keychain Access GUI prompt — neither stdin nor a non-interactive
 * headless run can supply it without putting the secret on argv, which is refused outright. Lookup has no such
 * problem (`-w` with no value reads the password back on stdout), so it still tries the real keychain first.
 * Windows goes through PowerShell's CredentialManager module, used only when it's already installed (never
 * installed on the user's behalf); this repo has no Windows box to verify it live on, so it is exercised only
 * through the injected runner in tests — see the report for this task for that caveat.
 */
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { StoredKey } from '../classifier/typesafe/config.ts';
import type { Runner } from './runner.ts';

type Env = Record<string, string | undefined>;

const KEYCHAIN_TIMEOUT_MS = 3000;
const clean = (v: string | undefined): string | undefined => {
  const t = v?.trim();
  return t ? t : undefined;
};
/** `security`/`secret-tool` output the secret with a trailing newline; never trim interior whitespace, only the ends. */
const cleanLine = (s: string): string => s.replace(/\r?\n+$/u, '');

/** `~/.config/sidewise` (or `$XDG_CONFIG_HOME/sidewise`) — shared with install-record.ts, which keeps
 *  `install.json` (no secrets) in the same directory as this file's `credentials` (secrets only). */
export function sidewiseConfigDir(env: Env = process.env): string {
  const xdg = clean(env.XDG_CONFIG_HOME);
  return xdg ? path.join(xdg, 'sidewise') : path.join(os.homedir(), '.config', 'sidewise');
}

export function credentialsPath(env: Env = process.env): string {
  return path.join(sidewiseConfigDir(env), 'credentials');
}

export interface FileCredentials {
  typesafe?: string;
  gateway?: string;
  /** The file's own permission bits (e.g. 0o600); doctor warns when this is looser than 0600. */
  mode: number;
}

/** undefined for: no file, unreadable, or not a JSON object — every case "nothing stored" can safely fall
 *  through to (a missing key just means the free fake provider is used). */
export function readCredentialsFile(file: string): FileCredentials | undefined {
  if (!existsSync(file)) return undefined;
  let mode: number;
  let raw: string;
  try {
    mode = statSync(file).mode & 0o777;
    raw = readFileSync(file, 'utf8');
  } catch {
    return undefined;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined;
  const obj = parsed as Record<string, unknown>;
  return {
    ...(typeof obj.typesafe === 'string' ? { typesafe: obj.typesafe } : {}),
    ...(typeof obj.gateway === 'string' ? { gateway: obj.gateway } : {}),
    mode,
  };
}

/** 0700 dir, 0600 file — set explicitly after the write, since mkdir/writeFile's own `mode` option is still
 *  narrowed by umask. */
export function writeCredentialsFile(file: string, data: { typesafe?: string; gateway?: string }): void {
  const dir = path.dirname(file);
  mkdirSync(dir, { recursive: true });
  chmodSync(dir, 0o700);
  writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
  chmodSync(file, 0o600);
}

/** undefined when the mode is already 0600 or tighter; else the exact ✖-style warning doctor and init show. */
export function looseFileModeWarning(file: string, mode: number): string | undefined {
  if ((mode & 0o077) === 0) return undefined;
  return `✖ credentials: ${file} is mode ${mode.toString(8)}, looser than 0600 → chmod 600 ${file}`;
}

function winScript(body: string): readonly string[] {
  return ['-NoProfile', '-NonInteractive', '-Command', body];
}
// Exit 2 is this module's own signal for "the CredentialManager module isn't installed" (distinct from a real
// PowerShell failure), so keychainStore/keychainLookup can tell "fall through" apart from "something broke".
const WIN_STORE_SCRIPT =
  'if (Get-Module -ListAvailable -Name CredentialManager) { $s = [Console]::In.ReadToEnd().TrimEnd("`r","`n"); ' +
  'New-StoredCredential -Target sidewise-typesafe -UserName typesafe -Password $s -Persist LocalMachine | Out-Null } else { exit 2 }';
const WIN_LOOKUP_SCRIPT =
  'if (Get-Module -ListAvailable -Name CredentialManager) { ' +
  '(Get-StoredCredential -Target sidewise-typesafe).GetNetworkCredential().Password } else { exit 2 }';

function keychainLookup(runner: Runner, platform: NodeJS.Platform): string | undefined {
  if (platform === 'darwin') {
    const r = runner('security', ['find-generic-password', '-s', 'sidewise', '-a', 'typesafe', '-w'], { timeoutMs: KEYCHAIN_TIMEOUT_MS });
    return r.status === 0 && r.stdout.trim() ? cleanLine(r.stdout) : undefined;
  }
  if (platform === 'linux') {
    const r = runner('secret-tool', ['lookup', 'service', 'sidewise', 'account', 'typesafe'], { timeoutMs: KEYCHAIN_TIMEOUT_MS });
    return r.status === 0 && r.stdout.trim() ? cleanLine(r.stdout) : undefined;
  }
  if (platform === 'win32') {
    const r = runner('powershell', winScript(WIN_LOOKUP_SCRIPT), { timeoutMs: KEYCHAIN_TIMEOUT_MS });
    return r.status === 0 && r.stdout.trim() ? cleanLine(r.stdout) : undefined;
  }
  return undefined; // an unknown platform never touches a keychain tool it can't identify
}

function keychainStore(runner: Runner, platform: NodeJS.Platform, secret: string): 'stored' | 'unavailable' {
  if (platform === 'darwin') return 'unavailable'; // see the module doc: security add-generic-password can't take this off argv
  if (platform === 'linux') {
    const r = runner('secret-tool', ['store', '--label=Sidewise', 'service', 'sidewise', 'account', 'typesafe'], { input: secret, timeoutMs: KEYCHAIN_TIMEOUT_MS });
    return r.status === 0 ? 'stored' : 'unavailable';
  }
  if (platform === 'win32') {
    const r = runner('powershell', winScript(WIN_STORE_SCRIPT), { input: secret, timeoutMs: KEYCHAIN_TIMEOUT_MS });
    return r.status === 0 ? 'stored' : 'unavailable';
  }
  return 'unavailable';
}

/** Key resolution's second and third sources (config.ts's `deps.resolveStored`; env, the first source, is
 *  config.ts's own job): the OS keychain, then the user credentials file. A missing tool, a locked keychain, or
 *  no file at all all read the same here — undefined — so the caller just moves on to the next source, or to
 *  "no key configured" (the free fake provider). */
export function resolveStoredKey(runner: Runner, platform: NodeJS.Platform, env: Env = process.env): StoredKey | undefined {
  const fromKeychain = keychainLookup(runner, platform);
  if (fromKeychain) return { apiKey: fromKeychain, source: 'keychain', provider: 'typesafe' };
  const file = readCredentialsFile(credentialsPath(env));
  if (file?.typesafe) return { apiKey: file.typesafe, source: 'file', provider: 'typesafe' };
  if (file?.gateway) return { apiKey: file.gateway, source: 'file', provider: 'gateway' };
  return undefined;
}

export interface StoreKeyResult {
  stored: 'keychain' | 'file';
  /** Where it landed, for the "✔ done" line: "OS keychain", or the credentials file's path. */
  detail: string;
}

/** Storage, first that works (init's own step 2): the keychain for a TypeSafe-direct key, else the credentials
 *  file for either provider. Merges into whatever the file already holds, so setting a gateway key doesn't
 *  blank out a previously stored typesafe one (or vice versa). */
export function storeKey(runner: Runner, platform: NodeJS.Platform, env: Env, provider: 'typesafe' | 'gateway', secret: string): StoreKeyResult {
  if (provider === 'typesafe' && keychainStore(runner, platform, secret) === 'stored') {
    return { stored: 'keychain', detail: 'OS keychain' };
  }
  const file = credentialsPath(env);
  const existing = readCredentialsFile(file);
  writeCredentialsFile(file, { typesafe: existing?.typesafe, gateway: existing?.gateway, [provider]: secret });
  return { stored: 'file', detail: file };
}

/** Removes a stored key from wherever it landed (uninstall's "the stored key" step); returns what it actually
 *  removed, so uninstall can say so precisely instead of a generic "done". Never throws for "there was nothing
 *  to remove" — that's `removed: []`, not a stop. */
export function removeStoredKey(runner: Runner, platform: NodeJS.Platform, env: Env): { removed: Array<'keychain' | 'file'> } {
  const removed: Array<'keychain' | 'file'> = [];
  if (platform === 'linux') {
    const r = runner('secret-tool', ['clear', 'service', 'sidewise', 'account', 'typesafe'], { timeoutMs: KEYCHAIN_TIMEOUT_MS });
    if (r.status === 0) removed.push('keychain');
  } else if (platform === 'darwin') {
    const r = runner('security', ['delete-generic-password', '-s', 'sidewise', '-a', 'typesafe'], { timeoutMs: KEYCHAIN_TIMEOUT_MS });
    if (r.status === 0) removed.push('keychain');
  } else if (platform === 'win32') {
    const r = runner(
      'powershell',
      winScript('if (Get-Module -ListAvailable -Name CredentialManager) { Remove-StoredCredential -Target sidewise-typesafe } else { exit 2 }'),
      { timeoutMs: KEYCHAIN_TIMEOUT_MS },
    );
    if (r.status === 0) removed.push('keychain');
  }
  const file = credentialsPath(env);
  if (existsSync(file)) {
    try {
      rmSync(file, { force: true });
      removed.push('file');
    } catch {
      // leave it; uninstall reports what it could confirm
    }
  }
  return { removed };
}
