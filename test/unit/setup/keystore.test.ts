// Key storage outside env (the owner ruling that replaces AGENTS.md rule 6): the OS keychain, then a
// 0600-in-0700 user file. No real `security`/`secret-tool`/`powershell` here — every case runs through a stub
// Runner that records the exact command and args it was called with, so these tests can also assert the one
// thing that must never happen: the secret landing in argv.
import { mkdtempSync, readFileSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  credentialsPath,
  type FileCredentials,
  looseFileModeWarning,
  readCredentialsFile,
  removeStoredKey,
  resolveStoredKey,
  storeKey,
  type StoreKeyResult,
  writeCredentialsFile,
} from '../../../src/setup/keystore.ts';
import type { RunResult, Runner } from '../../../src/setup/runner.ts';

interface Call { cmd: string; args: string[]; input: string | undefined }

function fakeRunner(script: (call: Call) => RunResult): { runner: Runner; calls: Call[] } {
  const calls: Call[] = [];
  const runner: Runner = (cmd, args, opts) => {
    const call = { cmd, args: [...args], input: opts?.input };
    calls.push(call);
    return script(call);
  };
  return { runner, calls };
}

const ok = (stdout = ''): RunResult => ({ status: 0, stdout, stderr: '' });
const fail = (status = 1): RunResult => ({ status, stdout: '', stderr: '' });

function tmpEnv(): { env: { XDG_CONFIG_HOME: string } } {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'sidewise-keystore-'));
  return { env: { XDG_CONFIG_HOME: dir } };
}

describe('credentials file', () => {
  it('defaults to ~/.config/sidewise/credentials with no XDG_CONFIG_HOME', () => {
    expect(credentialsPath({})).toBe(path.join(os.homedir(), '.config', 'sidewise', 'credentials'));
  });

  it('honours XDG_CONFIG_HOME', () => {
    const { env } = tmpEnv();
    expect(credentialsPath(env)).toBe(path.join(env.XDG_CONFIG_HOME, 'sidewise', 'credentials'));
  });

  it('write then read round-trips, at 0600 in a 0700 dir', () => {
    const { env } = tmpEnv();
    const file = credentialsPath(env);
    writeCredentialsFile(file, { typesafe: 'k-1' });
    const read: FileCredentials | undefined = readCredentialsFile(file);
    expect(read).toMatchObject({ typesafe: 'k-1' });
    expect(statSync(file).mode & 0o777).toBe(0o600);
    expect(statSync(path.dirname(file)).mode & 0o777).toBe(0o700);
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({ typesafe: 'k-1' });
  });

  it('storing a second provider merges rather than clobbering the first', () => {
    const { env } = tmpEnv();
    const file = credentialsPath(env);
    writeCredentialsFile(file, { typesafe: 'k-1' });
    writeCredentialsFile(file, { ...readCredentialsFile(file), gateway: 'g-1' });
    expect(readCredentialsFile(file)).toMatchObject({ typesafe: 'k-1', gateway: 'g-1' });
  });

  it('no file, an unreadable file, or non-JSON all read as undefined, never a throw', () => {
    const { env } = tmpEnv();
    expect(readCredentialsFile(credentialsPath(env))).toBeUndefined();
  });

  it('looseFileModeWarning: quiet at 0600, a ✖ line when looser', () => {
    expect(looseFileModeWarning('/x/credentials', 0o600)).toBeUndefined();
    expect(looseFileModeWarning('/x/credentials', 0o400)).toBeUndefined(); // tighter than 0600 is fine
    expect(looseFileModeWarning('/x/credentials', 0o644)).toMatch(/^✖ credentials: \/x\/credentials is mode 644, looser than 0600/);
  });
});

describe('resolveStoredKey: keychain wins over the file', () => {
  it('linux: secret-tool lookup found → keychain, provider typesafe', () => {
    const { runner, calls } = fakeRunner(() => ok('secret-value\n'));
    const { env } = tmpEnv();
    expect(resolveStoredKey(runner, 'linux', env)).toEqual({ apiKey: 'secret-value', source: 'keychain', provider: 'typesafe' });
    expect(calls).toEqual([{ cmd: 'secret-tool', args: ['lookup', 'service', 'sidewise', 'account', 'typesafe'], input: undefined }]);
  });

  it('linux: secret-tool missing or empty falls through to the file', () => {
    const { runner } = fakeRunner(() => fail());
    const { env } = tmpEnv();
    writeCredentialsFile(credentialsPath(env), { gateway: 'g-2' });
    expect(resolveStoredKey(runner, 'linux', env)).toEqual({ apiKey: 'g-2', source: 'file', provider: 'gateway' });
  });

  it('neither keychain nor file: undefined, not a throw', () => {
    const { runner } = fakeRunner(() => fail());
    const { env } = tmpEnv();
    expect(resolveStoredKey(runner, 'linux', env)).toBeUndefined();
  });

  it('darwin: security find-generic-password, no secret ever needed as input', () => {
    const { runner, calls } = fakeRunner(() => ok('mac-secret\n'));
    const { env } = tmpEnv();
    expect(resolveStoredKey(runner, 'darwin', env)).toEqual({ apiKey: 'mac-secret', source: 'keychain', provider: 'typesafe' });
    expect(calls[0]).toEqual({ cmd: 'security', args: ['find-generic-password', '-s', 'sidewise', '-a', 'typesafe', '-w'], input: undefined });
  });

  it('an unknown platform never touches a keychain tool it can\'t identify', () => {
    const { runner, calls } = fakeRunner(() => ok('should-not-be-read'));
    const { env } = tmpEnv();
    expect(resolveStoredKey(runner, 'aix' as NodeJS.Platform, env)).toBeUndefined();
    expect(calls).toHaveLength(0);
  });
});

describe('storeKey: the secret is never in argv', () => {
  it('linux typesafe: secret-tool store, secret on stdin only', () => {
    const { runner, calls } = fakeRunner(() => ok());
    const { env } = tmpEnv();
    const r: StoreKeyResult = storeKey(runner, 'linux', env, 'typesafe', 'super-secret-value');
    expect(r).toEqual({ stored: 'keychain', detail: 'OS keychain' });
    expect(calls).toEqual([{ cmd: 'secret-tool', args: ['store', '--label=Sidewise', 'service', 'sidewise', 'account', 'typesafe'], input: 'super-secret-value' }]);
    for (const c of calls) for (const a of c.args) expect(a).not.toContain('super-secret-value');
  });

  it('linux, secret-tool unavailable: falls through to the 0600 file', () => {
    const { runner } = fakeRunner(() => fail());
    const { env } = tmpEnv();
    const r = storeKey(runner, 'linux', env, 'typesafe', 'super-secret-value');
    expect(r.stored).toBe('file');
    expect(readCredentialsFile(r.detail)).toMatchObject({ typesafe: 'super-secret-value' });
    expect(statSync(r.detail).mode & 0o777).toBe(0o600);
  });

  it('darwin always falls straight to the file (security add-generic-password can\'t take this off argv)', () => {
    const { runner, calls } = fakeRunner(() => ok());
    const { env } = tmpEnv();
    const r = storeKey(runner, 'darwin', env, 'typesafe', 'mac-secret-value');
    expect(r.stored).toBe('file');
    expect(calls).toHaveLength(0); // never even asks security to store
    expect(readCredentialsFile(r.detail)).toMatchObject({ typesafe: 'mac-secret-value' });
  });

  it('a gateway key always goes to the file, even where the keychain would accept a typesafe one', () => {
    const { runner, calls } = fakeRunner(() => ok());
    const { env } = tmpEnv();
    const r = storeKey(runner, 'linux', env, 'gateway', 'gateway-secret-value');
    expect(r.stored).toBe('file');
    expect(calls).toHaveLength(0);
    expect(readCredentialsFile(r.detail)).toMatchObject({ gateway: 'gateway-secret-value' });
  });
});

describe('removeStoredKey', () => {
  it('linux: clears the keychain entry and removes the file when both are present', () => {
    const { runner, calls } = fakeRunner(() => ok());
    const { env } = tmpEnv();
    writeCredentialsFile(credentialsPath(env), { typesafe: 'k' });
    const r = removeStoredKey(runner, 'linux', env);
    expect(r.removed.sort()).toEqual(['file', 'keychain']);
    expect(calls[0]).toMatchObject({ cmd: 'secret-tool', args: ['clear', 'service', 'sidewise', 'account', 'typesafe'] });
    expect(readCredentialsFile(credentialsPath(env))).toBeUndefined();
  });

  it('nothing stored anywhere: removed is empty, not a throw', () => {
    const { runner } = fakeRunner(() => fail());
    const { env } = tmpEnv();
    expect(removeStoredKey(runner, 'linux', env)).toEqual({ removed: [] });
  });
});
