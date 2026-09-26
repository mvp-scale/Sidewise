import { describe, expect, it } from 'vitest';
import { parseRequest } from '../../src/lens/parse.ts';
import { validate } from '../../src/lens/validate.ts';
import { classRequest, numberedSlots, RM_SLOTS } from '../helpers/requests.ts';

function check(text: string) {
  const r = parseRequest(text);
  if (!r.ok) throw new Error(r.errors.join('\n'));
  return validate(r.request, ['class']);
}

describe('validate: stops (break comparability)', () => {
  it('passes the canonical example with no stops and no notes', () => {
    expect(check(classRequest())).toEqual({ stops: [], notes: [] });
  });

  it('refuses a verb that is not available yet', () => {
    expect(check(classRequest({ header: 'sidewise scan L1' })).stops).toContain('✖ verb: "scan" is not available yet → use class');
  });

  it('needs focus, problem, 1–5 places and 1–5 kebab-case tags', () => {
    const s = check(classRequest({ fields: { focus: null, problem: null, where: null, tags: 'SQL Injection' } })).stops;
    expect(s).toEqual(expect.arrayContaining([
      '✖ focus: missing → add "focus: <the one thing this run is about>"',
      '✖ problem: missing → add "problem: <one short line>"',
      '✖ where: need 1–5 places, got 0 → add "where: path/to/file.ts"',
      '✖ tags: "SQL Injection" not kebab-case → use lowercase words joined by -',
    ]));
  });

  it('needs exactly 10/20/30 slots for L1/L2/L3', () => {
    expect(check(classRequest({ slots: RM_SLOTS.slice(0, 7) })).stops).toContain('✖ slots: L1 needs 10, got 7 → add 3 questions on the same focus');
    expect(check(classRequest({ slots: numberedSlots(11) })).stops).toContain('✖ slots: L1 needs 10, got 11 → remove 1, or raise the level');
    expect(check(classRequest({ header: 'sidewise class L2', slots: numberedSlots(20) })).stops).toEqual([]);
  });

  it('needs slots numbered 1..N in order and never repeated', () => {
    const skipped = [...RM_SLOTS.slice(0, 2), RM_SLOTS[3]!.replace(' 4 ', ' 3 '), ...RM_SLOTS.slice(3)];
    expect(check(classRequest({ slots: skipped })).stops.some((s) => s.startsWith('✖ slots: slot 4 is numbered 4') || s.includes('repeats'))).toBe(true);
    const renumbered = RM_SLOTS.map((s, i) => (i === 4 ? ' 5  Is request text placed directly into the SQL query?' : s));
    expect(check(classRequest({ slots: renumbered })).stops).toContain('✖ slots: 5 repeats 1 → ask something different');
    const outOfOrder = [RM_SLOTS[1]!, RM_SLOTS[0]!, ...RM_SLOTS.slice(2)];
    expect(check(classRequest({ slots: outOfOrder })).stops).toContain('✖ slots: slot 1 is numbered 2 → number them 1 to 10 in order');
  });

  it('allows at most 5 primitives, with 2–10 scale levels and 2–8 direction options, none repeated', () => {
    const six = Array.from({ length: 6 }, (_, i) => `+ Primitive ${i}?`);
    expect(check(classRequest({ primitives: six })).stops).toContain('✖ primitives: at most 5, got 6 → remove 1');
    expect(check(classRequest({ primitives: ['~ How bad? only'] })).stops).toContain('✖ primitive "How bad?": a scale needs 2–10 levels, got 1 → separate them with |');
    expect(check(classRequest({ primitives: ['? Which? a | b | c | d | e | f | g | h | i'] })).stops).toContain('✖ primitive "Which?": a direction needs 2–8 options, got 9 → separate them with |');
    expect(check(classRequest({ primitives: ['? Which? a | a'] })).stops).toContain('✖ primitive "Which?": repeated options → make each one different');
  });

  it('needs a parent that is a run id', () => {
    expect(check(classRequest({ fields: { parent: 'yesterday' } })).stops).toContain('✖ parent: "yesterday" is not a run id → use SW-####');
  });
});

describe('validate: notes (weaken the answer, never stop it)', () => {
  it('notes too few reversed questions', () => {
    const noReverse = RM_SLOTS.map((s) => s.replace(' !', '  '));
    expect(check(classRequest({ slots: noReverse })).notes).toContain('only 0 reversed (!) questions; 2 catch yes-bias → mark 2 more with !');
  });

  it('notes two slots that open the same way', () => {
    const same = RM_SLOTS.map((s, i) => (i === 3 ? ' 4  Could a caller read another record?' : s));
    expect(check(classRequest({ slots: same })).notes).toContain('2 and 4 open the same way; they may ask the same thing');
  });

  it('notes an irreversible-looking focus below L3, and a missing perspective', () => {
    const v = check(classRequest({ fields: { focus: 'Safe to deploy the migration', perspective: null } }));
    expect(v.stops).toEqual([]);
    expect(v.notes).toEqual(expect.arrayContaining(['no perspective; recorded as "agent"', 'looks irreversible ("deploy"); consider L3 and don\'t act on this alone']));
  });
});
