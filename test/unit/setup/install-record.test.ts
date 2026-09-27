// install.json: how `sidewise init` installed the CLI, read back by doctor and uninstall — separate from
// keystore.ts's credentials file in the same directory, and holds no secrets.
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { clearInstallRecord, installRecordPath, readInstallRecord, writeInstallRecord } from '../../../src/setup/install-record.ts';

function tmpEnv(): { XDG_CONFIG_HOME: string } {
  return { XDG_CONFIG_HOME: mkdtempSync(path.join(os.tmpdir(), 'sidewise-installrec-')) };
}

describe('install-record', () => {
  it('undefined when nothing was ever written', () => {
    expect(readInstallRecord(tmpEnv())).toBeUndefined();
  });

  it('writes then reads back exactly, holding no secret-shaped field', () => {
    const env = tmpEnv();
    const record = { mode: 'user' as const, npmPrefix: path.join(os.homedir(), '.local'), installedAt: '2026-09-27T00:00:00Z' };
    writeInstallRecord(env, record);
    expect(readInstallRecord(env)).toEqual(record);
    expect(JSON.stringify(JSON.parse(readFileSync(installRecordPath(env), 'utf8')))).not.toMatch(/key|secret|token/iu);
  });

  it('a corrupt or unrecognised-shape file reads as undefined, never throws', () => {
    const env = tmpEnv();
    writeInstallRecord(env, { mode: 'local', projectDir: '/proj', installedAt: 'x' });
    const file = installRecordPath(env);
    writeFileSync(file, 'not json');
    expect(readInstallRecord(env)).toBeUndefined();
  });

  it('clearInstallRecord removes it; a no-op when there was none', () => {
    const env = tmpEnv();
    writeInstallRecord(env, { mode: 'global', npmPrefix: '/usr/local', installedAt: 'x' });
    clearInstallRecord(env);
    expect(readInstallRecord(env)).toBeUndefined();
    clearInstallRecord(env); // no throw the second time
  });
});
