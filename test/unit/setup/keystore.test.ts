// The resolver: composes keychain.ts + env-file.ts into resolveStoredKey/storeKey/removeStoredKey. Platform and
// tool behaviour are keychain.ts's own tests; this file is about the composition (keychain wins, else file;
// a gateway key always goes to the file; storing/removing touches only the one relevant name).
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { envFilePath, readEnvFile } from '../../../src/setup/env-file.ts';
import { removeStoredKey, resolveStoredKey, storeKey, type StoreKeyResult } from '../../../src/setup/keystore.ts';
import type { RunResult, Runner } from '../../../src/setup/runner.ts';

function tmpEnv(): { XDG_CONFIG_HOME: string } {
  return { XDG_CONFIG_HOME: mkdtempSync(path.join(os.tmpdir(), 'sidewise-keystore-')) };
}

const ok = (stdout = ''): RunResult => ({ status: 0, stdout, stderr: '' });
const fail = (): RunResult => ({ status: 1, stdout: '', stderr: 'not found' });

describe('resolveStoredKey: keychain wins over the file', () => {
  it('a keychain hit short-circuits the file entirely', () => {
    const env = tmpEnv();
    storeKey(() => fail(), 'linux', env, 'typesafe', 'file-key'); // secret-tool fails → lands in the file
    const runner: Runner = () => ok('keychain-key\n');
    expect(resolveStoredKey(runner, 'linux', env)).toEqual({ apiKey: 'keychain-key', source: 'keychain', provider: 'typesafe' });
  });

  it('no keychain hit: the env file, typesafe before gateway', () => {
    const env = tmpEnv();
    storeKey(() => fail(), 'linux', env, 'gateway', 'g-1');
    expect(resolveStoredKey(() => fail(), 'linux', env)).toEqual({ apiKey: 'g-1', source: 'file', provider: 'gateway' });
    storeKey(() => fail(), 'linux', env, 'typesafe', 't-1');
    expect(resolveStoredKey(() => fail(), 'linux', env)).toEqual({ apiKey: 't-1', source: 'file', provider: 'typesafe' });
  });

  it('neither: undefined', () => {
    expect(resolveStoredKey(() => fail(), 'linux', tmpEnv())).toBeUndefined();
  });
});

describe('storeKey', () => {
  it('linux typesafe: the keychain when it works', () => {
    const env = tmpEnv();
    const r: StoreKeyResult = storeKey(() => ok(), 'linux', env, 'typesafe', 'k');
    expect(r).toEqual({ stored: 'keychain', detail: 'OS keychain' });
  });

  it('a gateway key always goes to the file, even when the keychain would accept a typesafe one', () => {
    const env = tmpEnv();
    const r = storeKey(() => ok(), 'linux', env, 'gateway', 'g');
    expect(r.stored).toBe('file');
    expect(readEnvFile(envFilePath(env))).toMatchObject({ values: { AI_GATEWAY_API_KEY: 'g' } });
  });

  it('darwin always falls straight to the file', () => {
    const env = tmpEnv();
    const r = storeKey(() => ok(), 'darwin', env, 'typesafe', 'k');
    expect(r.stored).toBe('file');
    expect(readEnvFile(envFilePath(env))).toMatchObject({ values: { TYPESAFE_API_KEY: 'k' } });
  });
});

describe('removeStoredKey', () => {
  it('clears the keychain and both key names in the file, reporting what it actually found', () => {
    const env = tmpEnv();
    storeKey(() => fail(), 'linux', env, 'typesafe', 'k');
    const { removed } = removeStoredKey(() => ok(), 'linux', env);
    expect(removed.sort()).toEqual(['file', 'keychain']);
    expect(readEnvFile(envFilePath(env))).toBeUndefined();
  });

  it('nothing stored anywhere: removed is empty', () => {
    expect(removeStoredKey(() => fail(), 'linux', tmpEnv())).toEqual({ removed: [] });
  });
});
