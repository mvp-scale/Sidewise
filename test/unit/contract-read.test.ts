// Reading a request: YAML 1.2 (JSON too), one stop per parse failure, and the contract's YAML traps worded as fixes.
import { describe, expect, it } from 'vitest';
import { readRequestText } from '../../src/contract/read.ts';

const q = (n: number, text: string): string => `side:\n  ask:\n    leaks:\n      pass: no\n      ${n}: ${text}\n`;
const stops = (text: string): string[] => {
  const r = readRequestText(text);
  if (r.ok) throw new Error('expected stops');
  return r.stops;
};
const value = (text: string): unknown => {
  const r = readRequestText(text);
  if (!r.ok) throw new Error(r.stops.join('\n'));
  return r.value;
};

describe('readRequestText', () => {
  it('reads YAML, and JSON (valid YAML 1.2)', () => {
    expect(value('side:\n  goal: The handler is safe\n')).toEqual({ side: { goal: 'The handler is safe' } });
    expect(value('{"side": {"goal": "The handler is safe"}}')).toEqual({ side: { goal: 'The handler is safe' } });
  });

  it('reads CRLF and a BOM like LF', () => {
    expect(value('﻿side:\r\n  goal: abc\r\n')).toEqual(value('side:\n  goal: abc\n'));
  });

  it('keeps no/yes as text (YAML 1.2), numbers question keys as strings', () => {
    expect(value(q(4, 'no'))).toEqual({ side: { ask: { leaks: { pass: 'no', 4: 'no' } } } });
    expect(Object.keys((value(q(1, 'Is it?')) as { side: { ask: { leaks: object } } }).side.ask.leaks)).toContain('1');
  });

  it('a question with ": " unquoted', () => {
    expect(stops(q(4, 'Does it log: an email?'))).toEqual(['✖ question 4 has ": " → put it in quotes']);
    expect(stops(q(4, 'Does it log:'))).toEqual(['✖ question 4 has ": " → put it in quotes']);
  });

  it('a question with " #" unquoted reads as cut short (the validator stops it)', () => {
    expect(value(q(4, 'Is it # really safe?'))).toEqual({ side: { ask: { leaks: { pass: 'no', 4: 'Is it' } } } });
  });

  it('a parse error on a line in { }, including an unclosed one reported past its end', () => {
    expect(stops('side:\n  ask:\n    leaks: {pass: no, 4: Does it log: an email?}\n')).toEqual(['✖ yaml: line 3 puts a category or question in { } → use the indented form']);
    expect(stops('side:\n  ask:\n    leaks: {pass: no, 4: Is it #x safe?}\n')).toEqual(['✖ yaml: line 3 puts a category or question in { } → use the indented form']);
  });

  it('a key or question number given twice, a tab, two documents', () => {
    expect(stops('side:\n  goal: a\n  goal: b\n')).toEqual(['✖ yaml: line 3 repeats the key "goal" → give each key once']);
    expect(stops('side:\n  ask:\n    leaks:\n      pass: no\n      4: Is a?\n      4: Is b?\n')).toEqual(['✖ question 4: numbered twice (line 6) → give each question its own number']);
    expect(stops('side:\n\tgoal: x\n')).toEqual(['✖ yaml: line 2 is indented with a tab → indent with spaces']);
    expect(stops('side: 1\n---\nside: 2\n')).toEqual(['✖ yaml: more than one document (---) → send one request per run']);
  });

  it('anything else that does not parse: one stop with the line', () => {
    expect(stops('side:\n  goal: abc\nThanks! Let me know what you think.\n')).toEqual([
      '✖ yaml: line 3 does not parse → use the indented form, and put any question with ": " or " #" in quotes',
    ]);
  });

  it('empty, comments only, not a mapping, the old text format, an alias bomb', () => {
    const empty = '✖ request: empty → start with "side:" (sidewise template class prints a skeleton)';
    expect(stops('')).toEqual([empty]);
    expect(stops('  \n')).toEqual([empty]);
    expect(stops('# only a comment\n')).toEqual([empty]);
    expect(stops('hello')).toEqual(['✖ request: not a YAML mapping → start with "side:" (sidewise template class prints a skeleton)']);
    expect(stops('- a\n- b\n')).toEqual(['✖ request: not a YAML mapping → start with "side:" (sidewise template class prints a skeleton)']);
    expect(stops('sidewise class L1\nwhere: src/user.ts\n 1  Is it?\n')).toEqual(['✖ request: this is the old text format → send YAML (sidewise template class prints a skeleton)']);
    const bomb = 'a: &a [x,x,x,x,x,x,x,x,x]\nb: &b [*a,*a,*a,*a,*a,*a,*a,*a,*a]\nc: &c [*b,*b,*b,*b,*b,*b,*b,*b,*b]\nd: [*c,*c,*c,*c,*c,*c,*c,*c,*c]\n';
    expect(stops(bomb)).toEqual(['✖ yaml: too many aliases (*) → write the request out in full']);
  });
});
