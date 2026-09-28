/**
 * The one place that WRITES `.sidewise/config.yaml` (plan 2c B1). Every other config module is read-only
 * (load.ts/validate.ts/config.ts) — `sidewise budget set`/`reset` and the one-time budget.json migration
 * (src/budget/budget.ts) are the only callers, and they only ever merge a sparse patch into whatever is already
 * there, preserving every other key (and comments, since this goes through the `yaml` package's own Document
 * rather than a plain stringify-the-whole-object round trip — the same idiom src/verbs/template.ts uses for
 * --goal/--where overlays).
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { parseDocument } from 'yaml';
import { ensureDir, type SidewisePaths } from '../ledger/paths.ts';
import type { SidewiseConfig } from './defaults.ts';

/** Every field of `SidewiseConfig`, at any depth, made optional — a `writeConfigOverride` patch only ever
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

/**
 * Merges `patch` into `.sidewise/config.yaml`, creating the file (and `.sidewise/`) if neither exists yet.
 * Every key not named in `patch` is left exactly as it was. Never validates (the caller already knows its own
 * patch is well-formed — `setBudget`'s own positive-number check runs before this, same as before); a config
 * file this then makes momentarily invalid in some OTHER way is caught the next time anything reads it
 * (`resolveConfig`/`sidewise doctor`), same as an agent hand-editing the file badly would be.
 */
export function writeConfigOverride(paths: SidewisePaths, patch: DeepPartial<SidewiseConfig>): void {
  ensureDir(paths);
  const text = existsSync(paths.config) ? readFileSync(paths.config, 'utf8') : '';
  const doc = parseDocument(text, { version: '1.2', schema: 'core' });
  setDeep(doc, [], patch);
  writeFileSync(paths.config, doc.toString());
}
