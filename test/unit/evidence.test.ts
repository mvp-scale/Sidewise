import { describe, expect, it } from 'vitest';
import { EVIDENCE_LIMITS, readCodeEvidence } from '../../src/evidence/code.ts';
import { tempProject } from '../helpers/project.ts';

const GH_TOKEN = 'gh' + 'p_' + 'z'.repeat(30);

describe('readCodeEvidence', () => {
  it('reads a file, or just its lines, keyed by path', () => {
    const { root } = tempProject({ 'src/a.ts': 'one\ntwo\nthree\nfour\n' });
    const r = readCodeEvidence(root, [{ path: 'src/a.ts', lines: '2-3' }, { path: './src/a.ts' }]);
    expect(r).toEqual({ ok: true, evidence: { state: { 'code:src/a.ts:2-3': 'two\nthree', 'code:src/a.ts': 'one\ntwo\nthree\nfour\n' }, notes: [] } });
  });

  it('stops on a path outside the project, a folder, or a missing file', () => {
    const { root } = tempProject({ 'src/a.ts': 'x' });
    const r = readCodeEvidence(root, [{ path: '../elsewhere.ts' }, { path: 'src' }, { path: 'src/missing.ts' }]);
    expect(r).toEqual({
      ok: false,
      errors: [
        '✖ where: "../elsewhere.ts" is outside the project → use a path inside the project',
        '✖ where: "src" is a folder → name a file (scan covers folders)',
        '✖ where: cannot read "src/missing.ts" → check the path',
      ],
    });
  });

  it('redacts secrets in code before it becomes evidence', () => {
    const { root } = tempProject({ 'src/a.ts': `const t = "${GH_TOKEN}";` });
    const r = readCodeEvidence(root, [{ path: 'src/a.ts' }]);
    expect(r.ok && r.evidence.state['code:src/a.ts']).toBe('const t = "[redacted]";');
  });

  it('truncates a huge file and stops adding evidence at the total limit, with notes', () => {
    const big = 'x'.repeat(EVIDENCE_LIMITS.perFileChars + 5000);
    const { root } = tempProject({ 'a.ts': big, 'b.ts': big, 'c.ts': big, 'd.ts': big });
    const r = readCodeEvidence(root, ['a.ts', 'b.ts', 'c.ts', 'd.ts'].map((path) => ({ path })));
    if (!r.ok) throw new Error(r.errors.join('\n'));
    expect(r.evidence.state['code:a.ts']).toHaveLength(EVIDENCE_LIMITS.perFileChars);
    expect(r.evidence.state['code:d.ts']).toBeUndefined();
    expect(r.evidence.notes).toContain(`a.ts truncated to ${EVIDENCE_LIMITS.perFileChars} chars`);
    expect(r.evidence.notes).toContain('d.ts skipped: evidence limit reached');
  });
});
