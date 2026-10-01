/**
 * The ACTIVE config: `.mm3/config.active.json`, a validated copy of a project's overrides plus a fingerprint of
 * the config.yaml they were loaded from and when. `mm3 config --load` checks config.yaml and, only if it is
 * clean, replaces this copy; requests then read ONLY this small JSON file (no YAML parse per request), so an
 * edit to config.yaml changes nothing until it is loaded, and a bad edit can never go live. This module owns
 * the file (read, atomic write), the fingerprint, the status doctor/config report, and the one-time automatic
 * load for a project that had a config.yaml before this existed. It reads config.yaml only to hash it or to load it.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { onStore } from '../ledger/lock.ts';
import { ensureDir, type Mm3Paths } from '../ledger/paths.ts';
import type { Mm3Config } from './defaults.ts';
import { checkConfigText, hasSettings } from './parse.ts';
import { validateConfig, type ConfigStop } from './validate.ts';

interface ActiveConfig {
  v: 1;
  /** ISO time the copy was made. */
  loadedAt: string;
  /** sha256 of the config.yaml text these overrides came from. */
  fingerprint: string;
  overrides: Partial<Mm3Config>;
  /** Set by `mm3 config --reset`: the defaults were made active on purpose, whatever config.yaml says. */
  reset?: true;
}

export const fingerprintOf = (text: string): string => createHash('sha256').update(text).digest('hex');

/** The active copy, or undefined when there is none or it can't be trusted (unreadable, wrong shape, or its
 *  overrides no longer validate). Checking the overrides again is a couple of microseconds and means a hand-edited
 *  or damaged copy is ignored rather than applied. */
export function readActive(paths: Mm3Paths | undefined): ActiveConfig | undefined {
  if (!paths || !existsSync(paths.configActive)) return undefined;
  try {
    const v = JSON.parse(readFileSync(paths.configActive, 'utf8')) as Partial<ActiveConfig>;
    if (v.v !== 1 || typeof v.loadedAt !== 'string' || typeof v.fingerprint !== 'string' || typeof v.overrides !== 'object' || v.overrides === null || Array.isArray(v.overrides)) return undefined;
    const checked = validateConfig(v.overrides);
    if (checked.stops.length) return undefined;
    return { v: 1, loadedAt: v.loadedAt, fingerprint: v.fingerprint, overrides: checked.value, ...(v.reset === true ? { reset: true as const } : {}) };
  } catch {
    return undefined;
  }
}

/** Replaces the active copy atomically (tmp file, then rename): a reader sees the old copy or the new one, never half
 *  of one, and two loads racing each leave one whole valid copy. */
export function writeActive(paths: Mm3Paths, overrides: Partial<Mm3Config>, fingerprint: string, now: number = Date.now(), reset = false): void {
  onStore(paths.configActive, 'write', () => {
    ensureDir(paths);
    const body: ActiveConfig = { v: 1, loadedAt: new Date(now).toISOString().replace(/\.\d{3}Z$/, 'Z'), fingerprint, overrides, ...(reset ? { reset: true as const } : {}) };
    const tmp = `${paths.configActive}.${process.pid}.${Math.random().toString(36).slice(2, 8)}.tmp`;
    writeFileSync(tmp, `${JSON.stringify(body)}\n`);
    renameSync(tmp, paths.configActive);
  });
}

type ConfigStatus =
  /** No config.yaml and nothing loaded: every value is a default. */
  | { kind: 'defaults'; fileStops: ConfigStop[] }
  /** The loaded copy matches config.yaml. */
  | { kind: 'active'; loadedAt: string; fileStops: ConfigStop[] }
  /** config.yaml is not what was loaded; requests still run on the loaded copy. */
  | { kind: 'changed'; loadedAt: string; fileStops: ConfigStop[] }
  /** Something was loaded, but config.yaml is gone. */
  | { kind: 'missing'; loadedAt: string; fileStops: ConfigStop[] }
  /** Defaults were made active on purpose (`--reset`), and config.yaml holds settings that are not loaded. */
  | { kind: 'resetPending'; loadedAt: string; fileStops: ConfigStop[] }
  /** config.yaml exists and has never been loaded (a project from before --load): read as-is until a paid run loads it. */
  | { kind: 'unloaded'; fileStops: ConfigStop[] };

/** Where the project stands. Reads and hashes config.yaml (and checks it), so it is for doctor and `mm3 config`,
 *  never the per-request path. Writes nothing. */
export function configStatus(paths: Mm3Paths | undefined): ConfigStatus {
  const active = readActive(paths);
  let text: string | undefined;
  if (paths && existsSync(paths.config)) {
    try {
      text = readFileSync(paths.config, 'utf8');
    } catch {
      text = undefined;
    }
  }
  const fileStops = text === undefined ? [] : checkConfigText(text).stops;
  if (active?.reset) return text !== undefined && hasSettings(text) ? { kind: 'resetPending', loadedAt: active.loadedAt, fileStops } : { kind: 'defaults', fileStops };
  if (text === undefined) return active ? { kind: 'missing', loadedAt: active.loadedAt, fileStops } : { kind: 'defaults', fileStops };
  if (!active) return { kind: 'unloaded', fileStops };
  return { kind: active.fingerprint === fingerprintOf(text) ? 'active' : 'changed', loadedAt: active.loadedAt, fileStops };
}

/** The one line that says where the config stands (doctor's `config:` and `mm3 config`'s notes). `defaults` has
 *  no line of its own: callers keep their existing "defaults" wording. */
export function statusLine(s: ConfigStatus): string | undefined {
  switch (s.kind) {
    case 'defaults':
      return undefined;
    case 'active':
      return `config: active (loaded ${s.loadedAt})`;
    case 'changed':
      return '⚠ config.yaml changed since load → mm3 config --load';
    case 'missing':
      return '⚠ config.yaml is gone but a loaded config is still active → restore the file, or load another with mm3 config --load <file>';
    case 'resetPending':
      return '⚠ defaults are active; config.yaml has settings that are not loaded → mm3 config --load';
    case 'unloaded':
      return '⚠ config.yaml is not loaded yet → mm3 config --load (the first paid run loads it automatically)';
  }
}

const AUTO_LOAD_NOTE = 'config.yaml loaded automatically (first run after upgrade) → mm3 config --load to reload after edits';

/** The one-time migration: a project with a config.yaml and no active copy gets that file loaded, if it is clean.
 *  Returns the note to show, or undefined when there was nothing to do (already active, no file, or the file has
 *  a problem — then nothing is written and the file keeps being read as-is, as before, until it is fixed and
 *  loaded). Writes the active copy, so only commands that already write or spend call it. */
export function autoLoad(paths: Mm3Paths, now: number = Date.now()): string | undefined {
  if (readActive(paths) || !existsSync(paths.config)) return undefined;
  let text: string;
  try {
    text = readFileSync(paths.config, 'utf8');
  } catch {
    return undefined;
  }
  const checked = checkConfigText(text);
  if (checked.stops.length) return undefined;
  writeActive(paths, checked.overrides, fingerprintOf(text), now);
  return AUTO_LOAD_NOTE;
}
