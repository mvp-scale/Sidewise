/** Request text → a validated Request for one verb, or the exit-2 answer listing what to change (at most 5 stops). */
import { readRequestText } from '../contract/read.ts';
import type { Request, Verb } from '../contract/types.ts';
import { validateRequest } from '../contract/validate.ts';
import type { VerbResult } from './types.ts';

const MAX_STOPS = 5;

/** At most 5 stops, then one line saying how many more (pasted junk must not flood an agent's context), then a
 *  pointer at that verb's own agent card — every stop is a knowledge gap `sidewise agent <verb>` can close, not
 *  just the field it names. A stop is read by an agent, not a person at a terminal, so it points at the terse
 *  agent view (`sidewise agent`), not the prose `sidewise help`. Empty input (never a real call site today —
 *  every caller already guards on its own failure check) stays empty, no bare pointer line. */
export function stopText(stops: readonly string[], verb: Verb): string {
  if (!stops.length) return '';
  const lines = stops.length <= MAX_STOPS ? [...stops] : [...stops.slice(0, MAX_STOPS), `✖ request: ${stops.length - MAX_STOPS} more problems → fix the ones above, then run again`];
  return [...lines, `→ see: sidewise agent ${verb}`].join('\n');
}

export function loadRequest(text: string, verb: Verb): { ok: true; request: Request; notes: string[] } | { ok: false; result: VerbResult } {
  const read = readRequestText(text);
  if (!read.ok) return { ok: false, result: { exit: 2, text: stopText(read.stops, verb) } };
  const v = validateRequest(read.value, verb);
  if (!v.ok) return { ok: false, result: { exit: 2, text: stopText(v.stops.map((s) => s.text), verb) } };
  return { ok: true, request: v.request, notes: v.notes };
}
