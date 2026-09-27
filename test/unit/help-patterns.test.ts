// "Good / bad" pairs (src/help/patterns.ts): help's prose and agent's terse card render the exact same list, so
// this is the one proof for both. Every `good` snippet must parse and validate for its own verb; every `bad`
// snippet marked `catchable` must actually be rejected before it reaches the classifier (today, only the
// oversized-file pattern, by evidence/code.ts's own C-169 stop); every other `bad` snippet is confirmed to
// still validate — a wording/semantic pattern the request validator genuinely can't see, honestly marked
// rather than silently untested. [C-172]
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { readRequestText } from '../../src/contract/read.ts';
import { validateRequest, type Validated } from '../../src/contract/validate.ts';
import type { Verb } from '../../src/contract/types.ts';
import { readCodeEvidence } from '../../src/evidence/code.ts';
import { runAgent } from '../../src/help/agent.ts';
import { runHelp } from '../../src/help/index.ts';
import { PATTERNS } from '../../src/help/patterns.ts';

function parse(text: string, verb: Verb): Validated {
  const read = readRequestText(text);
  if (!read.ok) return { ok: false, stops: read.stops.map((s) => ({ cls: 'schema', text: s })) };
  return validateRequest(read.value, verb);
}

describe('help/patterns.ts: good/bad pairs shared by help and agent', () => {
  for (const p of PATTERNS) {
    describe(p.rule, () => {
      it('the why is terse: at most 8 words', () => {
        expect(p.why.trim().split(/\s+/u).length).toBeLessThanOrEqual(8);
      });

      it('the good snippet parses and validates', () => {
        const v = parse(p.good, p.verb);
        expect(v.ok, !v.ok ? v.stops.map((s) => s.text).join('\n') : '').toBe(true);
      });

      if (p.catchable) {
        it('the bad snippet is rejected by the evidence reader (not the schema/cross validator)', () => {
          // Both good and bad are schema-valid where: shapes on their own — only reading real files on disk
          // (part 1's own C-169 stop) tells them apart, so build the fixture the snippet's own path names.
          const goodParsed = parse(p.good, p.verb);
          const badParsed = parse(p.bad, p.verb);
          expect(goodParsed.ok).toBe(true);
          expect(badParsed.ok).toBe(true);
          if (!goodParsed.ok || !badParsed.ok) return;

          const root = mkdtempSync(path.join(os.tmpdir(), 'sidewise-patterns-'));
          const big = Array.from({ length: 1000 }, () => 'x'.repeat(30)).join('\n'); // well over the per-file limit
          for (const w of [...goodParsed.request.side.where, ...badParsed.request.side.where]) {
            const rel = w.replace(/:\d+(-\d+)?$/u, '');
            mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
            writeFileSync(path.join(root, rel), big);
          }
          const badEvidence = readCodeEvidence(root, badParsed.request.side.where);
          const goodEvidence = readCodeEvidence(root, goodParsed.request.side.where);
          expect(goodEvidence.ok).toBe(true);
          expect(badEvidence.ok).toBe(false);
          expect(!badEvidence.ok && badEvidence.errors.join('\n')).toContain('too big to send');
        });
      } else {
        it('the bad snippet still validates: a wording/semantic pattern no validator can catch, marked as such, not skipped', () => {
          const v = parse(p.bad, p.verb);
          expect(v.ok, !v.ok ? v.stops.map((s) => s.text).join('\n') : '').toBe(true);
        });
      }

      it('shows up in every help/agent page it names', () => {
        for (const tag of p.in) {
          expect(runHelp(tag).text).toContain(p.rule);
          if (tag !== 'authoring') expect(runAgent(tag).text).toContain(p.why);
        }
      });
    });
  }
});
