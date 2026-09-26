/**
 * template: prints a request an agent can copy, edit and pipe straight into a verb — never a response, and
 * never touching the ledger or budget. The six files under skills/sidewise/templates/ are CONTRACT.md's own
 * worked examples, shipped with the package so they're available from an installed install, not just the repo.
 * Only drill's template takes --parent/--from (its stored sample already has both, so it validates unparameterized
 * too); every other verb's flags are refused outright.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDocument } from 'yaml';
import { VERBS, type Verb } from '../contract/types.ts';
import { clip } from '../util/text.ts';
import type { VerbResult } from './types.ts';

export interface TemplateFlags {
  parent?: string;
  from?: string;
}

/** Re-exported for the CLI's own usage/help text. */
export const TEMPLATE_VERBS: readonly string[] = VERBS;

// Two directories up from src/verbs/ (or dist/verbs/ once built) lands at the repo/package root, so this
// resolves identically before and after tsc.
const TEMPLATES_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'skills', 'sidewise', 'templates');

export function runTemplate(target: string, flags: TemplateFlags = {}): VerbResult {
  if (!VERBS.includes(target as Verb)) return { exit: 2, text: `✖ template: "${clip(target, 30)}" is not a verb → one of ${VERBS.join(', ')}` };
  if (target !== 'drill' && (flags.parent || flags.from)) return { exit: 2, text: `✖ template: --parent/--from only apply to drill → sidewise template ${target}` };
  if (target === 'drill' && !!flags.parent !== !!flags.from)
    return { exit: 2, text: '✖ template drill: needs both --parent and --from, or neither → sidewise template drill --parent SW-#### --from <item or category>' };

  const raw = readFileSync(path.join(TEMPLATES_DIR, `${target}.yaml`), 'utf8');
  if (!flags.parent && !flags.from) return { exit: 0, text: raw };

  const doc = parseDocument(raw);
  doc.setIn(['side', 'parent'], flags.parent);
  doc.setIn(['side', 'from'], flags.from);
  return { exit: 0, text: doc.toString() };
}
