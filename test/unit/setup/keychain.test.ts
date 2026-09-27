// The OS keychain: macOS (security) and Linux (secret-tool) only — Windows always falls through (this task's
// own scope decision; see the report). Every case runs through a stub Runner; no real tool is ever spawned.
import { describe, expect, it } from 'vitest';
import { keychainLookup, keychainRemove, keychainStore } from '../../../src/setup/keychain.ts';
import type { RunResult, Runner } from '../../../src/setup/runner.ts';

interface Call { cmd: string; args: string[]; input?: string }
function recorder(script: (call: Call) => RunResult): { runner: Runner; calls: Call[] } {
  const calls: Call[] = [];
  const runner: Runner = (cmd, args, opts) => {
    const call = { cmd, args: [...args], input: opts?.input };
    calls.push(call);
    return script(call);
  };
  return { runner, calls };
}

describe('keychainLookup', () => {
  it('linux: secret-tool lookup, no secret needed as input', () => {
    const { runner, calls } = recorder(() => ({ status: 0, stdout: 'the-secret\n', stderr: '' }));
    expect(keychainLookup(runner, 'linux')).toBe('the-secret');
    expect(calls).toEqual([{ cmd: 'secret-tool', args: ['lookup', 'service', 'sidewise', 'account', 'typesafe'], input: undefined }]);
  });

  it('darwin: security find-generic-password', () => {
    const { runner, calls } = recorder(() => ({ status: 0, stdout: 'mac-secret\n', stderr: '' }));
    expect(keychainLookup(runner, 'darwin')).toBe('mac-secret');
    expect(calls[0]).toEqual({ cmd: 'security', args: ['find-generic-password', '-s', 'sidewise', '-a', 'typesafe', '-w'], input: undefined });
  });

  it('windows and anything else: undefined, never spawns anything', () => {
    const { runner, calls } = recorder(() => ({ status: 0, stdout: 'should-not-be-read', stderr: '' }));
    expect(keychainLookup(runner, 'win32')).toBeUndefined();
    expect(keychainLookup(runner, 'aix' as NodeJS.Platform)).toBeUndefined();
    expect(calls).toHaveLength(0);
  });

  it('a missing tool or empty output: undefined, not a throw', () => {
    const { runner } = recorder(() => ({ status: 1, stdout: '', stderr: 'not found' }));
    expect(keychainLookup(runner, 'linux')).toBeUndefined();
  });
});

describe('keychainStore: the secret is only ever on stdin', () => {
  it('linux: secret-tool store', () => {
    const { runner, calls } = recorder(() => ({ status: 0, stdout: '', stderr: '' }));
    expect(keychainStore(runner, 'linux', 'super-secret')).toBe('stored');
    expect(calls).toEqual([{ cmd: 'secret-tool', args: ['store', '--label=Sidewise', 'service', 'sidewise', 'account', 'typesafe'], input: 'super-secret' }]);
  });

  it('darwin always "unavailable": security add-generic-password can\'t take this off argv', () => {
    const { runner, calls } = recorder(() => ({ status: 0, stdout: '', stderr: '' }));
    expect(keychainStore(runner, 'darwin', 'super-secret')).toBe('unavailable');
    expect(calls).toHaveLength(0);
  });

  it('windows: "unavailable" (falls through to the env file)', () => {
    const { runner, calls } = recorder(() => ({ status: 0, stdout: '', stderr: '' }));
    expect(keychainStore(runner, 'win32', 'super-secret')).toBe('unavailable');
    expect(calls).toHaveLength(0);
  });
});

describe('keychainRemove', () => {
  it('linux clears, darwin deletes, windows is always false', () => {
    const { runner: linuxRunner, calls: linuxCalls } = recorder(() => ({ status: 0, stdout: '', stderr: '' }));
    expect(keychainRemove(linuxRunner, 'linux')).toBe(true);
    expect(linuxCalls[0]).toMatchObject({ cmd: 'secret-tool', args: ['clear', 'service', 'sidewise', 'account', 'typesafe'] });

    const { runner: macRunner, calls: macCalls } = recorder(() => ({ status: 0, stdout: '', stderr: '' }));
    expect(keychainRemove(macRunner, 'darwin')).toBe(true);
    expect(macCalls[0]).toMatchObject({ cmd: 'security', args: ['delete-generic-password', '-s', 'sidewise', '-a', 'typesafe'] });

    expect(keychainRemove(() => ({ status: 0, stdout: '', stderr: '' }), 'win32')).toBe(false);
  });
});
