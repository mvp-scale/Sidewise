import { mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { EVIDENCE_LIMITS, readCodeEvidence } from '../../src/evidence/code.ts';
import { tempProject } from '../helpers/project.ts';

const GH_TOKEN = 'gh' + 'p_' + 'z'.repeat(30);

describe('readCodeEvidence', () => {
  it('reads a file, or just its lines, keyed by the shown path [C-012]', () => {
    const { root } = tempProject({ 'src/a.ts': 'one\ntwo\nthree\nfour\n' });
    const r = readCodeEvidence(root, ['src/a.ts:2-3', './src/a.ts']);
    expect(r).toEqual({ ok: true, evidence: { files: { 'src/a.ts:2-3': 'two\nthree', 'src/a.ts': 'one\ntwo\nthree\nfour\n' }, notes: [] } });
  });

  it('stops on a path outside the project, a folder, or a missing file', () => {
    const { root } = tempProject({ 'src/a.ts': 'x' });
    const r = readCodeEvidence(root, ['../elsewhere.ts', 'src', 'src/missing.ts']);
    expect(r).toEqual({
      ok: false,
      errors: [
        '✖ side.where: "../elsewhere.ts" is outside the project → use a path inside the project',
        '✖ side.where: "src" is a folder → name a file (scan covers folders)',
        '✖ side.where: cannot read "src/missing.ts" → check the path',
      ],
    });
  });

  it('stops on a symlink that points outside the project', (ctx) => {
    const { root } = tempProject({ 'src/a.ts': 'inside' });
    const outside = mkdtempSync(path.join(os.tmpdir(), 'sidewise-outside-'));
    writeFileSync(path.join(outside, 'secret.ts'), 'outside');
    try {
      symlinkSync(path.join(outside, 'secret.ts'), path.join(root, 'src', 'link.ts'));
      symlinkSync(path.join(root, 'src', 'a.ts'), path.join(root, 'src', 'inner.ts'));
    } catch {
      ctx.skip(); // no symlink support here
    }
    expect(readCodeEvidence(root, ['src/link.ts'])).toEqual({
      ok: false,
      errors: ['✖ side.where: "src/link.ts" is outside the project → use a path inside the project'],
    });
    expect(readCodeEvidence(root, ['src/inner.ts'])).toEqual({ ok: true, evidence: { files: { 'src/inner.ts': 'inside' }, notes: [] } });
  });

  it('stops on a bad line range (schema-check.ts already confirmed the digit shape; this is only about it being sane)', () => {
    const { root } = tempProject({ 'src/a.ts': 'one\ntwo\nthree\n' });
    const bad = ['3-2', '0-2', '0'].map((lines) => `src/a.ts:${lines}`);
    const r = readCodeEvidence(root, bad);
    expect(r).toEqual({
      ok: false,
      errors: ['3-2', '0-2', '0'].map((l) => `✖ side.where: "src/a.ts:${l}" has a bad line range → use start-end with 1 ≤ start ≤ end`),
    });
    expect(readCodeEvidence(root, ['src/a.ts:2', 'src/a.ts:2-2']).ok).toBe(true);
  });

  it('redacts secrets in code before it becomes evidence', () => {
    const { root } = tempProject({ 'src/a.ts': `const t = "${GH_TOKEN}";` });
    const r = readCodeEvidence(root, ['src/a.ts']);
    expect(r.ok && r.evidence.files['src/a.ts']).toBe('const t = "[redacted]";');
  });

  // A file with real lines (not one huge single line) so the stop's own line count reads as more than "1 lines".
  const bigFile = (lines = 1000, width = 30): string => Array.from({ length: lines }, () => 'x'.repeat(width)).join('\n');

  describe('oversized where: entries (default: a stop, not a silent cut)', () => {
    it('a whole file (no range) over the per-file limit stops, naming its line count and asking for a range [C-169]', () => {
      const { root } = tempProject({ 'src/pay/validate.ts': bigFile() });
      const r = readCodeEvidence(root, ['src/pay/validate.ts']);
      expect(r).toEqual({
        ok: false,
        errors: ['✖ side.where: "src/pay/validate.ts" is 1,000 lines, too big to send whole → name a range (src/pay/validate.ts:start-end)'],
      });
    });

    it('a named range that is STILL over the per-file limit stops too, asking to narrow it further [C-169]', () => {
      const { root } = tempProject({ 'src/pay/validate.ts': bigFile() });
      const r = readCodeEvidence(root, ['src/pay/validate.ts:1-1000']);
      expect(r).toEqual({
        ok: false,
        errors: ['✖ side.where: "src/pay/validate.ts:1-1000" is 1,000 lines, too big to send → narrow the range'],
      });
    });

    it('a range under the per-file limit still works, even in a file that is otherwise too big to send whole [C-169]', () => {
      const { root } = tempProject({ 'src/pay/validate.ts': bigFile() });
      const r = readCodeEvidence(root, ['src/pay/validate.ts:1-10']);
      expect(r.ok).toBe(true);
      expect(r.ok && Object.keys(r.evidence.files)).toEqual(['src/pay/validate.ts:1-10']);
    });

    it('several where: entries that together cross the total limit stop too, instead of silently dropping one [C-170]', () => {
      const atCap = 'x'.repeat(EVIDENCE_LIMITS.perFileChars); // exactly the per-file cap: no per-file stop on its own
      const { root } = tempProject({ 'a.ts': atCap, 'b.ts': atCap, 'c.ts': atCap, 'd.ts': atCap });
      const r = readCodeEvidence(root, ['a.ts', 'b.ts', 'c.ts', 'd.ts']);
      expect(r).toEqual({
        ok: false,
        errors: [`✖ side.where: "d.ts" doesn't fit — where: is over ${EVIDENCE_LIMITS.totalChars.toLocaleString('en-US')} chars total → send fewer paths or narrower ranges`],
      });
    });

    it('the total-limit stop also fires mid-entry, not just when an entry starts with zero room left [C-170]', () => {
      const chunk = 'x'.repeat(16_000); // under the per-file cap on its own; 4 of these cross the 60,000 total mid-way through the 4th
      const { root } = tempProject({ 'a.ts': chunk, 'b.ts': chunk, 'c.ts': chunk, 'd.ts': chunk });
      const r = readCodeEvidence(root, ['a.ts', 'b.ts', 'c.ts', 'd.ts']);
      expect(r).toEqual({
        ok: false,
        errors: [`✖ side.where: "d.ts" doesn't fit — where: is over ${EVIDENCE_LIMITS.totalChars.toLocaleString('en-US')} chars total → send fewer paths or narrower ranges`],
      });
    });

    it('stopOnOversize: false keeps the old truncate-with-a-note behavior, for a range Sidewise chose itself, not a user-typed where: [C-171]', () => {
      const { root } = tempProject({ 'a.ts': bigFile() });
      const r = readCodeEvidence(root, ['a.ts:1-1000'], { stopOnOversize: false });
      if (!r.ok) throw new Error(r.errors.join('\n'));
      expect(r.evidence.files['a.ts:1-1000']).toHaveLength(EVIDENCE_LIMITS.perFileChars);
      expect(r.evidence.notes).toContain(`a.ts:1-1000 truncated to ${EVIDENCE_LIMITS.perFileChars} chars`);
    });

    it('stopOnOversize: false also keeps the old total-limit truncate/skip behavior [C-171]', () => {
      const big = 'x'.repeat(EVIDENCE_LIMITS.perFileChars + 5000);
      const { root } = tempProject({ 'a.ts': big, 'b.ts': big, 'c.ts': big, 'd.ts': big });
      const r = readCodeEvidence(root, ['a.ts', 'b.ts', 'c.ts', 'd.ts'], { stopOnOversize: false });
      if (!r.ok) throw new Error(r.errors.join('\n'));
      expect(r.evidence.files['a.ts']).toHaveLength(EVIDENCE_LIMITS.perFileChars);
      expect(r.evidence.files['d.ts']).toBeUndefined();
      expect(r.evidence.notes).toContain(`a.ts truncated to ${EVIDENCE_LIMITS.perFileChars} chars`);
      expect(r.evidence.notes).toContain('d.ts skipped: evidence limit reached');
    });
  });
});
