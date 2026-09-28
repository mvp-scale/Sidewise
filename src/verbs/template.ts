/**
 * template: prints a request an agent can copy, edit and pipe straight into a verb — never a response, and
 * never spending or writing anything. The files under skills/sidewise/templates/ are docs/contract.md's own worked
 * examples, shipped with the package so they're available from an installed install, not just the repo.
 * template still needs no project to run at all.
 *
 * `--from` means two different things, disambiguated by whether `--parent` is also given:
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
import { parseDocument, stringify } from 'yaml';
import type { Category, Question } from '../contract/types.ts';
import { VERBS, type Verb } from '../contract/types.ts';
import { findRun, isContractRun, type ContractRun } from '../ledger/log.ts';
import { RUN_ID } from '../ledger/ids.ts';
import type { SidewisePaths } from '../ledger/paths.ts';
import { clip } from '../util/text.ts';
import { stopText } from './request.ts';
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
// (bin/sidewise.mjs, the plugin's own packaging) — a bundle has no independent import.meta.url for this module
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

/** The wire shape a question was parsed FROM (contract/validate.ts's toQuestion), rebuilt from the stored,
 *  already-parsed `Question` — the inverse of that same function. */
function questionToWire(q: Question): unknown {
  if (q.kind === 'yesno') return q.text;
  if (q.kind === 'scale') return { scale: q.text, levels: q.levels };
  return { choice: q.text, options: q.options };
}

/** The wire shape a category was parsed FROM (contract/validate.ts's toCategory), rebuilt from the stored
 *  `Category` — `need`/`tags` are only written back when they carry non-default content, matching how an agent
 *  would actually have typed the request (need: all and an empty tags: are never required on the wire). */
function categoryToWire(c: Category): Record<string, unknown> {
  const out: Record<string, unknown> = { pass: c.pass };
  if (c.need !== 'all') out.need = c.need;
  if (c.tags.length) out.tags = c.tags;
  for (const q of c.questions) out[String(q.n)] = questionToWire(q);
  return out;
}

/** side.ask, rebuilt from the run's stored `ask.categories` (one subject) or `ask.layers` (a sweep) — never
 *  both: a contract run is one shape or the other (validate.ts's checkCross builds it the same way). */
function askToWire(run: ContractRun): Record<string, unknown> {
  if (run.ask.layers.length) {
    const out: Record<string, unknown> = {};
    for (const layer of run.ask.layers) {
      const cats: Record<string, unknown> = {};
      for (const c of layer.categories) cats[c.name] = categoryToWire(c);
      out[layer.name] = cats;
    }
    return out;
  }
  const out: Record<string, unknown> = {};
  for (const c of run.ask.categories) out[c.name] = categoryToWire(c);
  return out;
}

/** --from SW-####: the exact request a logged run was actually sent with, rebuilt from what the ledger kept —
 *  goal/depth/where/parent/from/compare/over/ask/wise. This is a faithful rebuild of the NORMALIZED request
 *  (what validateRequest produced), not necessarily byte-identical to whatever YAML the agent originally typed
 *  (e.g. `pass: true` on the wire vs the stored `pass: 'yes'` both mean the same thing, and comments never
 *  survive) — it validates and replays identically either way, which is what makes a request reusable at all.
 *  Read-only and free, like every other template path: never validated here either. */
function fromRunId(id: string, flags: TemplateFlags, paths: SidewisePaths | undefined): VerbResult {
  if (!paths) return { exit: 2, text: stopText([`✖ template: --from "${id}" needs a project to look up the ledger → run inside one, or point --from at a request file`], 'template') };
  const run = findRun(paths, id);
  if (!run) return { exit: 2, text: stopText([`✖ template: --from "${id}" is not in the ledger → check the id, or point --from at a request file`], 'template') };
  if (!isContractRun(run)) return { exit: 2, text: stopText([`✖ template: --from "${id}" predates the YAML contract → point --from at a request file instead`], 'template') };

  // `change` is the one verb where the stored fields aren't a faithful copy of the original request: a change
  // run stores its PARENT's `where`/`ask.categories` too (change.ts), so it can grade before/after answers
  // against the same categories — but a real change request never carries `where`/`ask`/`depth`/`over` at all
  // (contract/validate.ts's NEVER list forbids every one of them for change). Every other verb stores exactly
  // `request.side.*` on its own run (scan.ts/loop.ts/drill.ts/class.ts all copy their own request's fields
  // straight across), so the generic rebuild below is faithful for them.
  const side: Record<string, unknown> =
    run.verb === 'change'
      ? { verb: run.verb, goal: run.goal, parent: run.parent, compare: run.compare }
      : {
          verb: run.verb,
          goal: run.goal,
          ...(run.depth ? { depth: run.depth } : {}),
          ...(run.where.length ? { where: run.where } : {}),
          ...(run.parent ? { parent: run.parent } : {}),
          ...(run.from ? { from: run.from } : {}),
          ...(run.compare ? { compare: run.compare } : {}),
          ...(run.over ? { over: run.over } : {}),
          ask: askToWire(run),
        };
  const doc = parseDocument(stringify({ side, ...(run.wise ? { wise: run.wise } : {}) }));
  if (flags.goal !== undefined) doc.setIn(['side', 'goal'], flags.goal);
  if (flags.where !== undefined) doc.setIn(['side', 'where'], flags.where);
  return { exit: 0, text: doc.toString() };
}

/** --from names a request file, not an item/category — read it, and overlay --where/--goal if given.
 *  Never validated here (same discipline as every other template path: this only prints). */
function fromFile(from: string, flags: TemplateFlags): VerbResult {
  let raw: string;
  try {
    raw = readFileSync(from, 'utf8');
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    const shown = clip(from, 60);
    return { exit: 2, text: stopText([`✖ template: --from "${shown}" ${code === 'ENOENT' ? 'not found' : 'cannot be read'} → check the path`], 'template') };
  }
  let doc: ReturnType<typeof parseDocument>;
  try {
    doc = parseDocument(raw);
  } catch {
    return { exit: 2, text: stopText([`✖ template: --from "${clip(from, 60)}" is not valid YAML → point at a Sidewise request file`], 'template') };
  }
  if (!doc.has('side')) return { exit: 2, text: stopText([`✖ template: --from "${clip(from, 60)}" has no side: block → point at a Sidewise request file`], 'template') };
  if (flags.goal !== undefined) doc.setIn(['side', 'goal'], flags.goal);
  if (flags.where !== undefined) doc.setIn(['side', 'where'], flags.where);
  return { exit: 0, text: doc.toString() };
}

export function runTemplate(target: string, flags: TemplateFlags = {}, paths?: SidewisePaths, packageDir: string = DEFAULT_PACKAGE_DIR): VerbResult {
  if (!VERBS.includes(target as Verb)) return { exit: 2, text: stopText([`✖ template: "${clip(target, 30)}" is not a verb → one of ${VERBS.join(', ')}`], 'template') };

  if (flags.parent !== undefined) {
    if (target !== 'drill') return { exit: 2, text: stopText([`✖ template: --parent only applies to drill → sidewise template ${target}`], 'template') };
    if (flags.from === undefined) {
      return {
        exit: 2,
        text: stopText(['✖ template drill: needs both --parent and --from, or neither → sidewise template drill --parent SW-#### --from <item or category>'], 'template'),
      };
    }
    if (flags.where !== undefined || flags.goal !== undefined) {
      return {
        exit: 2,
        text: stopText(['✖ template: --where/--goal don\'t apply with --parent → they overlay a checklist read from --from <request.yaml> instead'], 'template'),
      };
    }
    const file = drillSampleFile(flags.parent, paths);
    const raw = readFileSync(path.join(packageDir, 'skills', 'sidewise', 'templates', file), 'utf8');
    const doc = parseDocument(raw);
    doc.setIn(['side', 'parent'], flags.parent);
    doc.setIn(['side', 'from'], flags.from);
    return { exit: 0, text: doc.toString() };
  }

  if (flags.from !== undefined) return RUN_ID.test(flags.from) ? fromRunId(flags.from, flags, paths) : fromFile(flags.from, flags);

  if (flags.where !== undefined || flags.goal !== undefined) {
    return { exit: 2, text: stopText([`✖ template: --where/--goal need --from → sidewise template ${target} --from <request.yaml>`], 'template') };
  }

  return { exit: 0, text: readFileSync(path.join(packageDir, 'skills', 'sidewise', 'templates', `${target}.yaml`), 'utf8') };
}
