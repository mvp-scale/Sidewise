/**
 * `sidewise config`: prints the EFFECTIVE config — every setting, its current value, and which of
 * default/config/env it came from — never writes anything (plan 2c B1). Free, like `doctor`: works with or
 * without a project (no project just means every value is a default, since there's nowhere for config.yaml to
 * live). A broken config.yaml is reported here too (the same stops `sidewise doctor` would show), but this
 * command still prints the rest of the effective table underneath — one bad key never hides everything else.
 */
import { emit, m, type Value } from '../contract/emit.ts';
import type { SidewisePaths } from '../ledger/paths.ts';
import type { VerbResult } from '../verbs/types.ts';
import type { ConfigSource } from './defaults.ts';
import { resolveConfig, type ResolvedConfig } from './load.ts';

const show = (v: unknown): string => (v === undefined ? '(unset)' : typeof v === 'string' ? v : JSON.stringify(v));

/** One printed row: `value  # source`, source shown only when it's worth knowing (an override or an env var —
 *  a bare `default` is still shown, since "which of these came from where" is the whole point of this command). */
function row(value: unknown, source: ConfigSource | undefined): string {
  return `${show(value)}  # ${source ?? 'default'}`;
}

function pricingEntries(resolved: ResolvedConfig): Array<[string, Value]> {
  return Object.entries(resolved.config.pricing).map(([model, rate]) => [
    model,
    m(...Object.entries(rate).map(([k, v]) => [k, row(v, resolved.sources[`pricing.${model}.${k}`] ?? resolved.sources[`pricing.${model}`])] as [string, Value])),
  ]);
}

function wiseEntries(resolved: ResolvedConfig): Array<[string, Value]> {
  return Object.entries(resolved.config.wise).map(([field, override]) => [
    field,
    m(...Object.entries(override).map(([k, v]) => [k, row(v, 'config')] as [string, Value])),
  ]);
}

export function formatConfig(resolved: ResolvedConfig, projectLine: string): string {
  const s = resolved.sources;
  const doc = m(
    [
      'config',
      m(
        ['project', projectLine],
        [
          'budget',
          m(['usd', row(resolved.config.budget.usd, s['budget.usd'])], ['runs', row(resolved.config.budget.runs, s['budget.runs'])], ['per', row(resolved.config.budget.per, s['budget.per'])]),
        ],
        ['provider', row(resolved.config.provider, s.provider)],
        ['baseURL', row(resolved.config.baseURL, s.baseURL)],
        ['model', row(resolved.config.model, s.model)],
        ['pricing', m(...pricingEntries(resolved))],
        ['timeoutMs', row(resolved.config.timeoutMs, s.timeoutMs)],
        ['retries', row(resolved.config.retries, s.retries)],
        ['backoffMs', row(resolved.config.backoffMs, s.backoffMs)],
        [
          'sweep',
          m(
            ['maxItems', row(resolved.config.sweep.maxItems, s['sweep.maxItems'])],
            ['maxQuestionsPerCall', row(resolved.config.sweep.maxQuestionsPerCall, s['sweep.maxQuestionsPerCall'])],
          ),
        ],
        ['requestMaxBytes', row(resolved.config.requestMaxBytes, s.requestMaxBytes)],
        [
          'reuse',
          m(['maxAgeDays', row(resolved.config.reuse.maxAgeDays, s['reuse.maxAgeDays'])], ['maxCommits', row(resolved.config.reuse.maxCommits, s['reuse.maxCommits'])]),
        ],
        ...(Object.keys(resolved.config.wise).length ? [['wise', m(...wiseEntries(resolved))] as [string, Value]] : []),
      ),
    ],
    ['notes', ['free: never writes, never spends', ...(resolved.present ? [] : ['no config.yaml here → every value is a default or env var'])]],
  );
  return emit(doc);
}

export function runConfig(env: Record<string, string | undefined>, paths: SidewisePaths | undefined, projectLine: string): VerbResult {
  const resolved = resolveConfig(paths, env);
  if (resolved.stops.length) {
    const stopLines = resolved.stops.map((st) => st.text).join('\n');
    return { exit: 2, text: `${stopLines}\n\n${formatConfig(resolved, projectLine)}\n→ see: sidewise agent config` };
  }
  return { exit: 0, text: formatConfig(resolved, projectLine) };
}
