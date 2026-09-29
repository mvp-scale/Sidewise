// Request → what the classifier is asked: ids, filled text, the wire question shape, state, and reuse keys.
import { describe, expect, it } from 'vitest';
import type { Item } from '../../src/contract/layers.ts';
import { answerKey, goalQuestion, ITEM_LIMITS, itemQuestions, itemsState, subjectEvidence, subjectQuestions, toClassifierQuestion } from '../../src/contract/translate.ts';
import type { Category } from '../../src/contract/types.ts';

const GH_TOKEN = 'gh' + 'p_' + 'z'.repeat(30);
const cats: Category[] = [
  { name: 'b', section: 'concerns', pass: 'yes', need: 'all', tags: [], questions: [{ n: 2, kind: 'yesno', text: 'Can {part} ship alone?' }] },
  { name: 'a', section: 'concerns', pass: 'no', need: 'all', tags: [], questions: [{ n: 1, kind: 'yesno', text: 'Does {part} mix jobs?' }] },
  { name: 's', section: 'decisions', pass: ['low'], need: 'all', tags: [], questions: [{ n: 3, kind: 'scale', text: 'How risky is {part}?', levels: ['low', 'high'] }] },
  { name: 'c', section: 'decisions', pass: ['ship'], need: 'all', tags: [], questions: [{ n: 4, kind: 'choice', text: 'Where does {part} go?', options: ['ship', 'fix'] }] },
];
const item: Item = { id: 'payments', layer: 'part', name: 'payments', parent: null, fill: { part: 'payments' }, text: 'payments' };

describe('questions', () => {
  it('one subject: the goal, then "1".."N" in number order', () => {
    expect(goalQuestion('It is safe')).toEqual({ id: 'goal', n: null, kind: 'yesno', text: 'It is safe' });
    expect(subjectQuestions(cats).map((q) => [q.id, q.kind])).toEqual([['1', 'yesno'], ['2', 'yesno'], ['3', 'scale'], ['4', 'choice']]);
    expect(subjectQuestions(cats, 'before:').map((q) => q.id)).toEqual(['before:1', 'before:2', 'before:3', 'before:4']);
  });

  it('a sweep item: "<item id>#<n>", blanks filled, the item named', () => {
    const qs = itemQuestions(item, cats);
    expect(qs[0]).toEqual({ id: 'payments#1', n: 1, kind: 'yesno', text: 'Does payments mix jobs?', item: 'payments' });
    expect(qs[2]).toEqual({ id: 'payments#3', n: 3, kind: 'scale', text: 'How risky is payments?', item: 'payments', levels: ['low', 'high'] });
  });

  it('to the port: noul, score with levels, choice with {option: option}; text and item redacted, ids kept [C-037]', () => {
    const [a, , s, c] = itemQuestions({ ...item, id: `x ${GH_TOKEN}`, fill: { part: GH_TOKEN } }, cats);
    expect(toClassifierQuestion(a!)).toEqual({ type: 'noul', id: `x ${GH_TOKEN}#1`, ask: 'Does [redacted] mix jobs?', item: 'x [redacted]' });
    expect(toClassifierQuestion(s!)).toMatchObject({ type: 'score', levels: ['low', 'high'] });
    expect(toClassifierQuestion(c!)).toMatchObject({ type: 'choice', options: { ship: 'ship', fix: 'fix' } });
  });
});

describe('answer keys', () => {
  it('stable for the same question and evidence; different when either changes', () => {
    const q = subjectQuestions(cats)[0]!;
    expect(answerKey('code A', q)).toBe(answerKey('code A', q));
    expect(answerKey('code A', q)).toMatch(/^[0-9a-f]{32}$/);
    expect(answerKey('code B', q)).not.toBe(answerKey('code A', q));
    expect(answerKey('code A', { ...q, text: 'Other?' })).not.toBe(answerKey('code A', q));
    const s = subjectQuestions(cats)[2]!;
    expect(answerKey('x', { ...s, levels: ['low', 'mid', 'high'] })).not.toBe(answerKey('x', s));
    const c = subjectQuestions(cats)[3]!;
    expect(answerKey('x', { ...c, options: ['ship', 'fix', 'hold'] })).not.toBe(answerKey('x', c));
  });

  it('subject evidence does not depend on the order files were listed', () => {
    expect(subjectEvidence({ 'b.ts': '2', 'a.ts': '1' })).toBe(subjectEvidence({ 'a.ts': '1', 'b.ts': '2' }));
  });
});

describe('itemsState', () => {
  it('redacts, caps each item and the total, and says so', () => {
    const notes: string[] = [];
    const big = 'x'.repeat(ITEM_LIMITS.perItemChars + 5);
    const items = [0, 1, 2, 3].map((i) => ({ ...item, id: `i${i}`, text: i === 0 ? `key ${GH_TOKEN}` : big }));
    const state = itemsState(items, notes);
    expect(state.i0).toBe('key [redacted]');
    expect(state.i1).toHaveLength(ITEM_LIMITS.perItemChars);
    expect(Object.values(state).reduce((n, t) => n + t.length, 0)).toBeLessThanOrEqual(ITEM_LIMITS.totalChars);
    expect(notes).toContain(`i1 truncated to ${ITEM_LIMITS.perItemChars} chars`);
    expect(notes.some((n) => /^i3 (truncated|not shown): evidence limit reached$/.test(n))).toBe(true);
  });

  it('redacts the item id in its notes too, not just the state keys', () => {
    const notes: string[] = [];
    const big = 'x'.repeat(ITEM_LIMITS.perItemChars + 5);
    const items = [{ ...item, id: `leaky-${GH_TOKEN}`, text: big }];
    const state = itemsState(items, notes);
    expect(notes.length).toBeGreaterThan(0);
    expect(Object.keys(state).some((k) => k.includes(GH_TOKEN))).toBe(false);
    expect(notes.some((n) => n.includes(GH_TOKEN))).toBe(false);
  });
});
