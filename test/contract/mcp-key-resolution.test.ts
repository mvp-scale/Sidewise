// The plugin's userConfig substitutes an empty string into TYPESAFE_API_KEY's env when the user leaves the
// field blank (Claude Code's own substitution behaviour for an unset sensitive value is undocumented — could
// be "" or the key simply omitted — so this pins the defensive, working case). [C-104] AI_GATEWAY_API_KEY is
// env-only for the plugin now (no userConfig field maps it in), but the CLI still reads it directly, and the
// same empty-string handling applies whenever a caller sets it that way. An empty string must count as "no
// key" everywhere key resolution happens, and still fall through to a stored key (the OS keychain or the user
// credentials file) rather than being treated as a real, empty key. [C-105]
import { describe, expect, it } from 'vitest';
import { hasKey, resolveJevConfig, type StoredKey } from '../../src/classifier/typesafe/config.ts';

describe('empty-string key resolution [C-104]', () => {
  it('TYPESAFE_API_KEY="" and AI_GATEWAY_API_KEY="" both resolve to no key (the fake provider)', () => {
    const config = resolveJevConfig({ TYPESAFE_API_KEY: '', AI_GATEWAY_API_KEY: '' });
    expect(hasKey(config)).toBe(false);
    expect(config.apiKey).toBeUndefined();
  });

  it('a whitespace-only key is the same as empty', () => {
    const config = resolveJevConfig({ TYPESAFE_API_KEY: '   ' });
    expect(hasKey(config)).toBe(false);
  });
});

describe('empty-string key resolution falls through to a stored key [C-105]', () => {
  it('TYPESAFE_API_KEY="" does not block falling through to the OS keychain / user file', () => {
    const stored: StoredKey = { apiKey: 'stored-secret', source: 'keychain', provider: 'typesafe' };
    const config = resolveJevConfig({ TYPESAFE_API_KEY: '', AI_GATEWAY_API_KEY: '' }, { resolveStored: () => stored });
    expect(config.apiKey).toBe('stored-secret');
    expect(config.keySource).toBe('keychain');
    expect(hasKey(config)).toBe(true);
  });

  it('AI_GATEWAY_API_KEY="" alongside a real TYPESAFE_API_KEY still uses the real one (env still wins over stored)', () => {
    const stored: StoredKey = { apiKey: 'stored-secret', source: 'file', provider: 'gateway' };
    const config = resolveJevConfig({ TYPESAFE_API_KEY: 'real-key', AI_GATEWAY_API_KEY: '' }, { resolveStored: () => stored });
    expect(config.apiKey).toBe('real-key');
    expect(config.keySource).toBe('env');
    expect(config.route).toBe('direct');
  });
});
