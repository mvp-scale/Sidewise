import { describe, expect, it } from 'vitest';
import { parseRequest } from '../../src/lens/parse.ts';
import { classRequest } from '../helpers/requests.ts';

function ok(text: string) {
  const r = parseRequest(text);
  if (!r.ok) throw new Error(r.errors.join('\n'));
  return r.request;
}

function errors(text: string): string[] {
  const r = parseRequest(text);
  if (r.ok) throw new Error('expected errors');
  return r.errors;
}

describe('parseRequest', () => {
  it('parses the canonical L1 example', () => {
    const r = ok(classRequest());
    expect(r).toMatchObject({ verb: 'class', level: 1, perspective: 'reviewer', problem: 'login lookup builds SQL from the request', focus: 'This handler is safe to merge', tags: ['sql', 'auth'] });
    expect(r.where).toEqual([{ path: 'src/user.ts', lines: '1-3', area: 'api' }]);
    expect(r.slots).toHaveLength(10);
    expect(r.slots.filter((s) => s.reverse).map((s) => s.pos)).toEqual([3, 6, 9]);
    expect(r.slots[0]).toEqual({ pos: 1, reverse: false, text: 'Is request text placed directly into the SQL query?' });
    expect(r.primitives).toEqual([
      { kind: 'scale', text: 'How severe is the worst issue?', options: ['none', 'low', 'medium', 'high', 'critical'] },
      { kind: 'direction', text: 'Where should this go?', options: ['ship', 'fix', 'block'] },
    ]);
  });

  it('reads CRLF line endings and a byte-order mark the same way', () => {
    const text = classRequest();
    expect(ok(`﻿${text.replace(/\n/g, '\r\n')}`)).toEqual(ok(text));
  });

  it('ignores blank lines and # comments, and collects several where lines and a parent', () => {
    const r = ok(classRequest({ fields: { where: 'src/a.ts\nwhere: src/b.ts:10', parent: 'SW-0041' } }).replace('sidewise class L1', 'sidewise class L1\n# a comment'));
    expect(r.where).toEqual([{ path: 'src/a.ts' }, { path: 'src/b.ts', lines: '10' }]);
    expect(r.parent).toBe('SW-0041');
  });

  it('ends a primitive question at its last "?" and reads + as a yes/no primitive', () => {
    const r = ok(classRequest({ primitives: ['~ Is a?b risky? low | high', '+ Is it covered by a test?'] }));
    expect(r.primitives).toEqual([
      { kind: 'scale', text: 'Is a?b risky?', options: ['low', 'high'] },
      { kind: 'bool', text: 'Is it covered by a test?', options: [] },
    ]);
  });

  it('reports a bad header, an unknown verb and a bad level on line 1', () => {
    expect(errors('hello\n')[0]).toMatch(/line 1: expected the header "sidewise <verb> L<1-3>"/);
    expect(errors('sidewise judge L1\n')[0]).toMatch(/"judge" is not a verb/);
    expect(errors('sidewise class L4\n')[0]).toMatch(/level "L4" → use L1, L2 or L3/);
  });

  it('reports a repeated field, a line that is nothing, and a primitive without options, with line numbers', () => {
    const text = classRequest({ fields: { focus: 'a\nfocus: b' }, primitives: ['~ How severe', 'what is this'] });
    const errs = errors(text);
    expect(errs.some((e) => /line 7: "focus" appears twice/.test(e))).toBe(true);
    expect(errs.some((e) => /line \d+: "~ How severe" → write "~ <question>\? option \| option"/.test(e))).toBe(true);
    expect(errs.some((e) => /line \d+: "what is this" is not a field, slot or primitive/.test(e))).toBe(true);
  });

  it('refuses empty text', () => {
    expect(errors('')[0]).toMatch(/empty/);
  });
});
