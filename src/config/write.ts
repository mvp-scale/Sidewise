/**
 * The one place that WRITES `.mm3/config.yaml`. Every other config module is read-only
 * (load.ts/validate.ts/config.ts) — `mm3 budget set`/`reset` and the one-time budget.json migration
 * (src/budget/budget.ts) are the only callers, and they only ever merge a sparse patch into whatever is already
 * there, preserving every other key (and comments, since this goes through the `yaml` package's own Document
 * rather than a plain stringify-the-whole-object round trip — the same idiom src/verbs/template.ts uses for
 * --goal/--where overlays).
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { parseDocument } from 'yaml';
import { onStore } from '../ledger/lock.ts';
import { ensureDir, type Mm3Paths } from '../ledger/paths.ts';
import { fingerprintOf, readActive, writeActive } from './active.ts';
import { hasSettings } from './parse.ts';
import type { Mm3Config } from './defaults.ts';
import { validateConfig } from './validate.ts';

/** Every field of `Mm3Config`, at any depth, made optional — a `writeConfigOverride` patch only ever
 *  names the leaves it wants to change. */
type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };

function setDeep(doc: ReturnType<typeof parseDocument>, prefix: string[], value: unknown): void {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    doc.setIn(prefix, value);
    return;
  }
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (v !== undefined) setDeep(doc, [...prefix, k], v);
  }
}

type Tree = Record<string, unknown>;
const isTree = (v: unknown): v is Tree => typeof v === 'object' && v !== null && !Array.isArray(v);

/** `patch` laid over `base`, leaf by leaf (the same result setDeep gives the YAML file); a new tree. */
function overlay(base: Tree, patch: Tree): Tree {
  const out: Tree = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    out[k] = isTree(v) ? overlay(isTree(out[k]) ? (out[k] as Tree) : {}, v) : v;
  }
  return out;
}

/**
 * Merges `patch` into `.mm3/config.yaml`, creating the file (and `.mm3/`) if neither exists yet.
 * Every key not named in `patch` is left exactly as it was. Never validates (the caller already knows its own
 * patch is well-formed — `setBudget`'s own positive-number check runs before this, same as before); a config
 * file this then makes momentarily invalid in some OTHER way is caught the next time anything reads it
 * (`resolveConfig`/`mm3 doctor`), same as an agent hand-editing the file badly would be.
 */
export function writeConfigOverride(paths: Mm3Paths, patch: DeepPartial<Mm3Config>, now: number = Date.now()): void {
  // Wrapped in onStore, same as every other file this codebase writes (budget.json before it, log.jsonl) — a
  // raw fs error (an unwritable .mm3/, a permissions problem) must surface as the usual clean StoreError,
  // never an unwrapped errno reaching the agent.
  onStore(paths.config, 'write', () => {
    ensureDir(paths);
    const had = existsSync(paths.config);
    const text = had ? readFileSync(paths.config, 'utf8') : '';
    const active = readActive(paths);
    // A reset copy over a file with nothing in it (the starter) is as in step as it can be.
    const wasInSync = active !== undefined && had && (active.fingerprint === fingerprintOf(text) || (active.reset === true && !hasSettings(text)));
    const doc = parseDocument(text, { version: '1.2', schema: 'core' });
    setDeep(doc, [], patch);
    const written = doc.toString();
    writeFileSync(paths.config, written);
    // MM3's own writes (budget set/reset, the legacy-budget migration, `report fields --accept`) go live at once:
    // the same patch is laid over the active copy. The copy's fingerprint follows the file only when the two were
    // in step before (or there was no file and no copy at all: a fresh project); otherwise a pending hand edit
    // stays pending and doctor keeps saying so. A file with no copy yet (never loaded) is left for the first
    // paid run or `--load` to load whole.
    const base = active?.overrides ?? (had ? undefined : {});
    if (base) {
      const checked = validateConfig(overlay(base as Tree, patch as Tree));
      if (!checked.stops.length) writeActive(paths, checked.value, wasInSync || (!had && (!active || active.reset)) ? fingerprintOf(written) : active!.fingerprint, now);
    }
  });
}
