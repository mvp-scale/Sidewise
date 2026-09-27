/**
 * template: prints a request an agent can copy, edit and pipe straight into a verb — never a response, and
 * never spending or writing anything. The files under skills/sidewise/templates/ are CONTRACT.md's own worked
 * examples, shipped with the package so they're available from an installed install, not just the repo.
 * template still needs no project to run at all.
 *
 * `--from` means two different things, disambiguated by whether `--parent` is also given (fix #16):
 *   --parent + --from (drill only): --from names an item or category of that parent run — drill.ts's own two
 *     shapes decide which stored sample fits (a sweep parent keeps this file's `over:`; a one-subject parent
 *     has none, so drill-subject.yaml is printed instead; a missing project, an unknown id, or a legacy Plan 1
 *     run all fall back to the sweep sample — findRun's own lookup is read-only, so this stays free).
 *   --from alone, any verb: --from names a request YAML FILE on disk. Its `ask:`/`over:` (the frozen question
 *     set) is reused verbatim; `--where`/`--goal` overlay a new subject on top of it, without sed. Neither the
 *     file's own shape nor its content is validated here — template only prints, same as every other path.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDocument } from 'yaml';
import { VERBS, type Verb } from '../contract/types.ts';
import { findRun, isContractRun } from '../ledger/log.ts';
import type { SidewisePaths } from '../ledger/paths.ts';
import { clip } from '../util/text.ts';
import type { VerbResult } from './types.ts';

export interface TemplateFlags {
  parent?: string;
  from?: string;
  where?: string[];
  goal?: string;
}

/** Re-exported for the CLI's own usage/help text. */
export const TEMPLATE_VERBS: readonly string[] = VERBS;

// Two directories up from src/verbs/ (or dist/verbs/ once built) lands at the repo/package root, so this
// resolves identically before and after tsc. It does NOT resolve correctly once bundled into one flat file
// (bin/sidewise.mjs, P1's plugin packaging) — a bundle has no independent import.meta.url for this module
// anymore, only the bundle's own, one level shallower — so it's only a fallback default here now; the real CLI
// (cli.ts) always passes its own already-correct `packageDir` (PACKAGE_DIR, one hop up from cli.ts's own file,
// which sits at the same depth under the package root in every shape: src/cli.ts, dist/cli.js, bin/sidewise.mjs)
// explicitly instead. Only a direct unit-test call (against unbundled src/) still relies on this default.
const DEFAULT_PACKAGE_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** The sample file name for a drill --parent/--from call: the parent's own shape when the ledger can say (a
 * sweep run has items, a one-subject run doesn't — same split drill.ts itself branches on), else the sweep
 * sample, unchanged from before this looked at the ledger at all. */
function drillSampleFile(parent: string, paths: SidewisePaths | undefined): string {
  const run = paths && findRun(paths, parent);
  if (run && isContractRun(run) && run.items === null) return 'drill-subject.yaml';
  return 'drill.yaml';
}

/** fix #16: --from names a request file, not an item/category — read it, and overlay --where/--goal if given.
 *  Never validated here (same discipline as every other template path: this only prints). */
function fromFile(from: string, flags: TemplateFlags): VerbResult {
  let raw: string;
  try {
    raw = readFileSync(from, 'utf8');
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    const shown = clip(from, 60);
    return { exit: 2, text: `✖ template: --from "${shown}" ${code === 'ENOENT' ? 'not found' : 'cannot be read'} → check the path` };
  }
  let doc: ReturnType<typeof parseDocument>;
  try {
    doc = parseDocument(raw);
  } catch {
    return { exit: 2, text: `✖ template: --from "${clip(from, 60)}" is not valid YAML → point at a Sidewise request file` };
  }
  if (!doc.has('side')) return { exit: 2, text: `✖ template: --from "${clip(from, 60)}" has no side: block → point at a Sidewise request file` };
  if (flags.goal !== undefined) doc.setIn(['side', 'goal'], flags.goal);
  if (flags.where !== undefined) doc.setIn(['side', 'where'], flags.where);
  return { exit: 0, text: doc.toString() };
}

export function runTemplate(target: string, flags: TemplateFlags = {}, paths?: SidewisePaths, packageDir: string = DEFAULT_PACKAGE_DIR): VerbResult {
  if (!VERBS.includes(target as Verb)) return { exit: 2, text: `✖ template: "${clip(target, 30)}" is not a verb → one of ${VERBS.join(', ')}` };

  if (flags.parent !== undefined) {
    if (target !== 'drill') return { exit: 2, text: `✖ template: --parent only applies to drill → sidewise template ${target}` };
    if (flags.from === undefined) {
      return { exit: 2, text: '✖ template drill: needs both --parent and --from, or neither → sidewise template drill --parent SW-#### --from <item or category>' };
    }
    if (flags.where !== undefined || flags.goal !== undefined) {
      return { exit: 2, text: '✖ template: --where/--goal don\'t apply with --parent → they overlay a checklist read from --from <request.yaml> instead' };
    }
    const file = drillSampleFile(flags.parent, paths);
    const raw = readFileSync(path.join(packageDir, 'skills', 'sidewise', 'templates', file), 'utf8');
    const doc = parseDocument(raw);
    doc.setIn(['side', 'parent'], flags.parent);
    doc.setIn(['side', 'from'], flags.from);
    return { exit: 0, text: doc.toString() };
  }

  if (flags.from !== undefined) return fromFile(flags.from, flags);

  if (flags.where !== undefined || flags.goal !== undefined) {
    return { exit: 2, text: `✖ template: --where/--goal need --from → sidewise template ${target} --from <request.yaml>` };
  }

  return { exit: 0, text: readFileSync(path.join(packageDir, 'skills', 'sidewise', 'templates', `${target}.yaml`), 'utf8') };
}
