/**
 * template: prints a request an agent can copy, edit and pipe straight into a verb — never a response, and
 * never spending or writing anything. The files under skills/sidewise/templates/ are CONTRACT.md's own worked
 * examples, shipped with the package so they're available from an installed install, not just the repo.
 * Only drill's template takes --parent/--from (its stored sample already has both, so it validates unparameterized
 * too); every other verb's flags are refused outright. template still needs no project to run at all: when
 * --parent is given and a project happens to be reachable, drill.ts's own two shapes decide which sample fits —
 * a sweep parent (scan, loop, an earlier sweep drill) keeps this file's `over:`; a one-subject parent (class,
 * change, an earlier one-subject drill) has no `over:` at all, so drill-subject.yaml is printed instead. A
 * missing project, an id the ledger doesn't have, or a legacy (Plan 1) run all fall back to the sweep sample,
 * same as before this looked at the ledger — findRun's own lookup is read-only and never rebuilds anything
 * onto disk (see log.ts's findRun), so this stays as free as the rest of template.
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

export function runTemplate(target: string, flags: TemplateFlags = {}, paths?: SidewisePaths, packageDir: string = DEFAULT_PACKAGE_DIR): VerbResult {
  if (!VERBS.includes(target as Verb)) return { exit: 2, text: `✖ template: "${clip(target, 30)}" is not a verb → one of ${VERBS.join(', ')}` };
  if (target !== 'drill' && (flags.parent || flags.from)) return { exit: 2, text: `✖ template: --parent/--from only apply to drill → sidewise template ${target}` };
  if (target === 'drill' && !!flags.parent !== !!flags.from)
    return { exit: 2, text: '✖ template drill: needs both --parent and --from, or neither → sidewise template drill --parent SW-#### --from <item or category>' };

  const file = target === 'drill' && flags.parent ? drillSampleFile(flags.parent, paths) : `${target}.yaml`;
  const raw = readFileSync(path.join(packageDir, 'skills', 'sidewise', 'templates', file), 'utf8');
  if (!flags.parent && !flags.from) return { exit: 0, text: raw };

  const doc = parseDocument(raw);
  doc.setIn(['side', 'parent'], flags.parent);
  doc.setIn(['side', 'from'], flags.from);
  return { exit: 0, text: doc.toString() };
}
