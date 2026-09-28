/**
 * `sidewise config`: prints the EFFECTIVE config as valid, copyable YAML (plan 2c B, item 3) — never writes
 * anything. Free, like `doctor`: works with or without a project (no project just means every value is a
 * default, since there's nowhere for config.yaml to live). A broken config.yaml is reported here too (the same
 * stops `sidewise doctor` would show), but this command still prints the rest of the effective table
 * underneath — one bad key never hides everything else.
 *
 * Unlike every other verb's response, this is NOT built through contract/emit.ts's `m()`/`emit()`: that
 * formatter exists for the compact side:/plan: response shape, and its `scalar()` double-quotes any string
 * containing " #" — exactly what a naive "value  # source" row would need, which used to make every single line
 * here a quoted string literal, not a real YAML comment (a config.yaml pasted from that output was garbage:
 * `budget: {usd: "5  # default", ...}`). This instead hand-builds real YAML text, one field per line, so the
 * whole document parses as YAML and can be edited directly:
 *   - an OVERRIDDEN field (source config/env) is a live line with a trailing real comment naming the source;
 *   - a field at its DEFAULT is a commented-out line showing that default value, so uncommenting it reproduces
 *     today's effective value exactly;
 *   - an OPTIONAL field nobody set (no default exists at all — provider, baseURL, model, budget.since,
 *     sweep.maxItems, reuse.maxAgeDays/maxCommits) is a commented EXAMPLE instead, since there's no real value
 *     to show. Either way, uncommenting any single line yields a valid config.yaml fragment.
 */
import { scalar } from '../contract/emit.ts';
import type { SidewisePaths } from '../ledger/paths.ts';
import type { VerbResult } from '../verbs/types.ts';
import type { ConfigSource, PricingRate } from './defaults.ts';
import { resolveConfig, type ResolvedConfig } from './load.ts';

type Prim = string | number | boolean;

// Not emit.ts's own num() (String, not toFixed(2)): that helper caps display at 2 decimal places for
// probabilities, which would round a real pricing rate like $0.042/Mtok down to "0.04" — silently wrong money.
const valueText = (v: Prim): string => (typeof v === 'string' ? scalar(v, false) : String(v));

/** One field's line. `value` is this field's real effective value (config/default), when it has one at all;
 *  `example` is only ever shown when neither an override nor a default value exists. The 4 env-aware fields
 *  (provider/baseURL/model/timeoutMs — see load.ts's own module doc) can be labeled source: 'env' while their
 *  config-layer `value` is still undefined (env only wins at real runtime, never shown as this module's own
 *  `config.<field>`); that combination gets its own line rather than crashing on a missing value. */
function fieldLine(indent: string, key: string, source: ConfigSource | undefined, value: Prim | undefined, example: Prim): string {
  if ((source === 'config' || source === 'env') && value !== undefined) {
    return `${indent}${key}: ${valueText(value)}  # ${source === 'config' ? 'from config.yaml' : 'env'}`;
  }
  if (value !== undefined) return `${indent}# ${key}: ${valueText(value)}  # default`;
  if (source === 'env') return `${indent}# ${key}: (set via env, not config.yaml)`;
  return `${indent}# ${key}: ${valueText(example)}  # example`;
}

const PRICING_FIELDS = ['inputPerMTok', 'outputPerMTok', 'perSecond', 'perCall'] as const;

function pricingLines(resolved: ResolvedConfig): string[] {
  const lines: string[] = ['  pricing:'];
  for (const [model, rate] of Object.entries(resolved.config.pricing)) {
    lines.push(`    ${scalar(model, false)}:`);
    const modelSource = resolved.sources[`pricing.${model}`];
    for (const f of PRICING_FIELDS) {
      const v = (rate as PricingRate)[f];
      if (v === undefined) continue; // this model has no rate at all for this field — nothing to show or example
      lines.push(fieldLine('      ', f, resolved.sources[`pricing.${model}.${f}`] ?? modelSource, v, 0));
    }
  }
  return lines;
}

/** wise overrides have no "default" at all (defaults.ts's DEFAULT_CONFIG.wise is always `{}`) — every field
 *  present came from config.yaml, so each is always a live line; with none configured, one commented example
 *  block shows the shape instead of leaving the section out entirely. */
function wiseLines(resolved: ResolvedConfig): string[] {
  const entries = Object.entries(resolved.config.wise);
  if (!entries.length) return ['  # wise:', '  #   risk: {values: [low, medium, high]}  # example override'];
  const lines: string[] = ['  wise:'];
  for (const [field, override] of entries) {
    lines.push(`    ${scalar(field, false)}:`);
    for (const [k, v] of Object.entries(override)) {
      const text = Array.isArray(v) ? `[${v.map((x) => scalar(String(x), true)).join(', ')}]` : typeof v === 'boolean' ? String(v) : scalar(String(v), false);
      lines.push(`      ${k}: ${text}  # from config.yaml`);
    }
  }
  return lines;
}

export function formatConfig(resolved: ResolvedConfig, projectLine: string): string {
  const c = resolved.config;
  const s = resolved.sources;
  const lines: string[] = [
    'config:',
    `  project: ${scalar(projectLine, false)}`,
    '',
    '  budget:',
    fieldLine('    ', 'usd', s['budget.usd'], c.budget.usd, 5),
    fieldLine('    ', 'runs', s['budget.runs'], c.budget.runs, 500),
    fieldLine('    ', 'per', s['budget.per'], c.budget.per, 'total'),
    fieldLine('    ', 'since', s['budget.since'], c.budget.since, '2026-01-01T00:00:00Z'),
    '',
    fieldLine('  ', 'provider', s.provider, c.provider, 'typesafe'),
    fieldLine('  ', 'baseURL', s.baseURL, c.baseURL, 'https://api.typesafe.ai'),
    fieldLine('  ', 'model', s.model, c.model, 'jev-1.13.0'),
    '',
    ...pricingLines(resolved),
    '',
    fieldLine('  ', 'timeoutMs', s.timeoutMs, c.timeoutMs, 20_000),
    fieldLine('  ', 'retries', s.retries, c.retries, 2),
    fieldLine('  ', 'backoffMs', s.backoffMs, c.backoffMs, 1000),
    '',
    '  sweep:',
    fieldLine('    ', 'maxItems', s['sweep.maxItems'], c.sweep.maxItems, 30),
    fieldLine('    ', 'maxQuestionsPerCall', s['sweep.maxQuestionsPerCall'], c.sweep.maxQuestionsPerCall, 500),
    '',
    fieldLine('  ', 'requestMaxBytes', s.requestMaxBytes, c.requestMaxBytes, 1_048_576),
    '',
    '  reuse:',
    fieldLine('    ', 'maxAgeDays', s['reuse.maxAgeDays'], c.reuse.maxAgeDays, 30),
    fieldLine('    ', 'maxCommits', s['reuse.maxCommits'], c.reuse.maxCommits, 20),
    '',
    ...wiseLines(resolved),
    '',
    'notes:',
    '  - free: never writes, never spends',
    ...(resolved.present ? [] : ['  - no config.yaml here → every value is a default or env var']),
  ];
  return `${lines.join('\n')}\n`;
}

export function runConfig(env: Record<string, string | undefined>, paths: SidewisePaths | undefined, projectLine: string): VerbResult {
  const resolved = resolveConfig(paths, env);
  if (resolved.stops.length) {
    const stopLines = resolved.stops.map((st) => st.text).join('\n');
    return { exit: 2, text: `${stopLines}\n\n${formatConfig(resolved, projectLine)}\n→ see: sidewise agent config` };
  }
  return { exit: 0, text: formatConfig(resolved, projectLine) };
}
