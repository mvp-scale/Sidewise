// Loading a request for one verb: text → Request, or exit 2 with at most 5 stops.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadRequest, stopText } from '../../src/verbs/request.ts';

describe('loadRequest', () => {
  it('reads and validates', () => {
    const r = loadRequest(readFileSync('test/fixtures/requests/valid/class.yaml', 'utf8'), 'class');
    expect(r.ok && r.request.side.goal).toBe('This login handler is safe to merge');
  });

  it('a parse stop or validation stops exit 2 [C-002]', () => {
    expect(loadRequest('', 'class')).toEqual({ ok: false, result: { exit: 2, text: '✖ request: empty → start with "side:" (sidewise template class prints a skeleton)' } });
    const r = loadRequest('side:\n  goal: The handler is safe\n', 'class');
    expect(!r.ok && r.result.exit).toBe(2);
    expect(!r.ok && r.result.text.split('\n')).toHaveLength(3);
  });

  it('at most 5 stops, then one line saying how many more', () => {
    const many = Array.from({ length: 12 }, (_, i) => `✖ q${i}: bad → fix`);
    const lines = stopText(many).split('\n');
    expect(lines).toHaveLength(6);
    expect(lines[5]).toBe('✖ request: 7 more problems → fix the ones above, then run again');
  });
});
