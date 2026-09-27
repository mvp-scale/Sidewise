// "Good / bad" pairs (src/help/patterns.ts): help's prose and agent's terse card render the exact same list, so
// this is the one proof for both. Every `good` snippet must parse and validate for its own verb; every `bad`
// snippet marked `catchable` must actually be rejected before it reaches the classifier — either outright, by
// the schema/cross validator (view's missing where:, view's/loop's forbidden or misshapen over:), or (the
// oversized-file pattern) schema-valid either way, caught only by the evidence reader's own C-169 stop; every
// other `bad` snippet is confirmed to still validate — a wording/semantic pattern the request validator
// genuinely can't see, honestly marked rather than silently untested. [C-172]
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
  it('[C-184] the oversized-file why no longer claims files get cut (a whole file is refused, not truncated)', () => {
    const p = PATTERNS.find((x) => x.rule.startsWith('A file this size'))!;
    expect(p.why).toBe('Big whole files refused — name the range');
    expect(p.why.toLowerCase()).not.toContain('get cut');
  });

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
        it('the bad snippet is rejected before it ever reaches the classifier (schema/cross validator, or the evidence reader)', () => {
          const goodParsed = parse(p.good, p.verb);
          expect(goodParsed.ok, !goodParsed.ok ? goodParsed.stops.map((s) => s.text).join('\n') : '').toBe(true);

          const badParsed = parse(p.bad, p.verb);
          if (!badParsed.ok) {
            // Rejected outright by the schema/cross validator (e.g. view's missing where:, or over: present/
            // misshapen where a verb forbids or constrains it) — that IS the catch; nothing further to check.
            expect(badParsed.stops.length).toBeGreaterThan(0);
            return;
          }

          // Schema-valid either way (today, only the oversized-file pattern): only reading real files on disk
          // (evidence/code.ts's own C-169 stop) tells bad from good, so build the fixture the snippet's own
          // path names.
          if (!goodParsed.ok) return;
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
