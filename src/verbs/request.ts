/** Request text → a validated Request for one verb, or the exit-2 answer listing what to change (at most 5 stops). */
import { readRequestText } from '../contract/read.ts';
import type { Request, Verb } from '../contract/types.ts';
import { validateRequest } from '../contract/validate.ts';
import type { VerbResult } from './types.ts';

export const MAX_STOPS = 5;

/** At most 5 stops, then one line saying how many more: pasted junk must not flood an agent's context. */
export function stopText(stops: readonly string[]): string {
  if (stops.length <= MAX_STOPS) return stops.join('\n');
  return [...stops.slice(0, MAX_STOPS), `✖ request: ${stops.length - MAX_STOPS} more problems → fix the ones above, then run again`].join('\n');
}

export function loadRequest(text: string, verb: Verb): { ok: true; request: Request; notes: string[] } | { ok: false; result: VerbResult } {
  const read = readRequestText(text);
  if (!read.ok) return { ok: false, result: { exit: 2, text: stopText(read.stops) } };
  const v = validateRequest(read.value, verb);
  if (!v.ok) return { ok: false, result: { exit: 2, text: stopText(v.stops.map((s) => s.text)) } };
  return { ok: true, request: v.request, notes: v.notes };
}
