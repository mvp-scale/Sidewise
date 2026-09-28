/**
 * The compact YAML response (contract "Every response"). Top-level keys are block. Inside side: (and plan:)
 * each entry is one line (a scalar, or a one-line flow map or list), except a map of maps (failing:,
 * categories:), which gets one line per entry. Counts print as integers and probabilities to 2 places.
 * Response maps are Maps, not objects: an object would move the keys "1", "2" ahead of "gate".
 * Every output parses back (YAML 1.2 core) to the same data; test/golden/emit.test.ts pins both.
 */
export type Value = string | number | boolean | null | Value[] | Map<string, Value>;

/** An ordered map: m(['gate', 'fail'], ['1', 0.94]). */
export const m = (...entries: Array<[string, Value]>): Map<string, Value> => new Map(entries);

const RESERVED = /^(?:true|false|null|~|yes|no|on|off|y|n)$/iu;
/** Strings the YAML 1.2 core schema would read as a number. */
const NUMBER_LIKE = /^(?:[-+]?(?:\d+|\d*\.\d+|\d+\.\d*)(?:[eE][-+]?\d+)?|0x[0-9a-fA-F]+|0o[0-7]+|[-+]?\.(?:inf|Inf|INF)|\.(?:nan|NaN|NAN))$/u;
const INDICATOR = /^[-?:,[\]{}#&*!|>'"%@`]/u;
const BLOCK_TOP = new Set(['side', 'plan', 'doctor', 'config']);

/** A string as a plain scalar when that is safe in this context, else double-quoted (JSON is valid YAML). */
export function scalar(s: string, flow: boolean): string {
  const plain =
    s !== '' &&
    s === s.trim() &&
    !RESERVED.test(s) &&
    !NUMBER_LIKE.test(s) &&
    !INDICATOR.test(s) &&
    !/: |:$| #|[\n\r\t]/u.test(s) &&
    !(flow && /[,[\]{}]/u.test(s));
  return plain ? s : JSON.stringify(s);
}

export const num = (n: number): string => (Number.isInteger(n) ? String(n) : n.toFixed(2));
const key = (k: string, flow: boolean): string => (/^[1-9]\d*$/u.test(k) ? k : scalar(k, flow));

function flow(v: Value): string {
  if (v instanceof Map) return `{${[...v].map(([k, x]) => `${key(k, true)}: ${flow(x)}`).join(', ')}}`;
  if (Array.isArray(v)) return `[${v.map(flow).join(', ')}]`;
  if (typeof v === 'number') return num(v);
  if (typeof v === 'boolean') return String(v);
  if (v === null) return 'null';
  return scalar(v, true);
}

/** A value on the right of a block key: strings as block scalars, everything else one flow line. */
function inline(v: Value): string {
  return typeof v === 'string' ? scalar(v, false) : flow(v);
}

const isMapOfMaps = (v: Value): v is Map<string, Map<string, Value>> => v instanceof Map && v.size > 0 && [...v.values()].every((x) => x instanceof Map);

export function emit(doc: Map<string, Value>): string {
  const lines: string[] = [];
  for (const [k, v] of doc) {
    if (!(BLOCK_TOP.has(k) && v instanceof Map)) {
      lines.push(`${key(k, false)}: ${inline(v)}`);
      continue;
    }
    lines.push(`${key(k, false)}:`);
    for (const [k2, v2] of v) {
      if (isMapOfMaps(v2)) {
        lines.push(`  ${key(k2, false)}:`);
        for (const [k3, v3] of v2) lines.push(`    ${key(k3, false)}: ${flow(v3)}`);
      } else {
        lines.push(`  ${key(k2, false)}: ${inline(v2)}`);
      }
    }
  }
  return `${lines.join('\n')}\n`;
}
