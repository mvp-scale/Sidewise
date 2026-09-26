import { mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { EVIDENCE_LIMITS, readCodeEvidence } from '../../src/evidence/code.ts';
import { tempProject } from '../helpers/project.ts';

const GH_TOKEN = 'gh' + 'p_' + 'z'.repeat(30);

describe('readCodeEvidence', () => {
  it('reads a file, or just its lines, keyed by the shown path', () => {
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

  it('truncates a huge file and stops adding evidence at the total limit, with notes', () => {
    const big = 'x'.repeat(EVIDENCE_LIMITS.perFileChars + 5000);
    const { root } = tempProject({ 'a.ts': big, 'b.ts': big, 'c.ts': big, 'd.ts': big });
    const r = readCodeEvidence(root, ['a.ts', 'b.ts', 'c.ts', 'd.ts']);
    if (!r.ok) throw new Error(r.errors.join('\n'));
    expect(r.evidence.files['a.ts']).toHaveLength(EVIDENCE_LIMITS.perFileChars);
    expect(r.evidence.files['d.ts']).toBeUndefined();
    expect(r.evidence.notes).toContain(`a.ts truncated to ${EVIDENCE_LIMITS.perFileChars} chars`);
    expect(r.evidence.notes).toContain('d.ts skipped: evidence limit reached');
  });
});
