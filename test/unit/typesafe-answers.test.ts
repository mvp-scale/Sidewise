// The three TypeSafe primitives on the wire: question shapes (docs.typesafe.ai/api) and answer parsing.
import { describe, expect, it } from 'vitest';
import { choiceQuestion, noulQuestion, parseAnswers, scoreQuestion, type JevQuestion } from '../../src/classifier/typesafe/answers.ts';

const LEVELS = ['none', 'low', 'medium', 'high', 'critical'];
const qs: Record<string, JevQuestion> = {
  n: noulQuestion('Is it wrong?'),
  c: choiceQuestion('Where should this go?', ['ship', 'fix', 'block']),
  s: scoreQuestion('How severe?', LEVELS),
};
const one = (id: string, answer: unknown) => parseAnswers({ answers: { [id]: answer } }, { [id]: qs[id]! }).answers[id];

describe('question shapes', () => {
  it('noul, choice (criteria {option: option}) and score (criteria [levels]); instructions may be structured', () => {
    expect(noulQuestion('Is it wrong?')).toEqual({ type: 'noul', instructions: 'Is it wrong?' });
    expect(choiceQuestion('Where?', ['ship', 'fix'])).toEqual({ type: 'choice', instructions: 'Where?', criteria: { ship: 'ship', fix: 'fix' } });
    expect(scoreQuestion('How bad?', ['low', 'high'])).toEqual({ type: 'score', instructions: 'How bad?', criteria: ['low', 'high'] });
    expect(noulQuestion({ item: 'payments', question: 'Is payments one thing?' })).toEqual({ type: 'noul', instructions: { item: 'payments', question: 'Is payments one thing?' } });
  });

  it('refuses a choice with <2, >255 or repeated options, and a score with <2 or >10 levels', () => {
    expect(() => choiceQuestion('q', ['only'])).toThrow(RangeError);
    expect(() => choiceQuestion('q', Array.from({ length: 256 }, (_, i) => `o${i}`))).toThrow(RangeError);
    expect(() => choiceQuestion('q', ['a', 'a'])).toThrow(RangeError);
    expect(() => scoreQuestion('q', ['one'])).toThrow(RangeError);
    expect(() => scoreQuestion('q', Array.from({ length: 11 }, (_, i) => `l${i}`))).toThrow(RangeError);
  });
});

describe('parseAnswers', () => {
  it('noul: the probability and the confidence, or |2p − 1| without one', () => {
    expect(one('n', { type: 'noul', noul: 0.12, confidence: 0.76 })).toEqual({ type: 'noul', probability: 0.12, confidence: 0.76 });
    expect(one('n', { noul: 0.9 })).toMatchObject({ type: 'noul', probability: 0.9 });
    expect((one('n', { noul: 0.9 }) as { confidence: number }).confidence).toBeCloseTo(0.8, 12);
    expect(() => one('n', { noul: 1.4 })).toThrow(/must be in \[0, 1\]/);
  });

  it('choice: normalized; the server choice if valid, else the argmax; a computed confidence as fallback', () => {
    const a = one('c', { probabilities: { ship: 1, fix: 3, block: 0 } }) as { choice: string; probabilities: Record<string, number>; confidence: number };
    expect(a.choice).toBe('fix');
    expect(a.probabilities.fix).toBeCloseTo(0.75, 12);
    expect(a.confidence).toBeCloseTo((3 * 0.75 - 1) / 2, 12);
    expect(one('c', { choice: 'nope', probabilities: { ship: 0.9, fix: 0.1, block: 0 } })).toMatchObject({ choice: 'ship' });
    expect(() => one('c', { probabilities: { ship: 1, wat: 1 } })).toThrow(/not in the request's options/);
    expect(() => one('c', { probabilities: { ship: -1, fix: 2, block: 0 } })).toThrow(/is negative/);
    expect(() => one('c', { probabilities: { ship: 0, fix: 0, block: 0 } })).toThrow(/sum to zero/);
  });

  it('score: probabilities keyed "0".."n-1" become a level-ordered distribution; missing levels are 0', () => {
    const a = one('s', { type: 'score', score: 2.76, legend: {}, probabilities: { 0: 0.02, 1: 0.05, 2: 0.1, 3: 0.81, 4: 0.02 }, confidence: 0.74 }) as { distribution: number[]; score: number; confidence: number };
    expect(a.distribution.map((p) => Number(p.toFixed(2)))).toEqual([0.02, 0.05, 0.1, 0.81, 0.02]);
    expect(a).toMatchObject({ type: 'score', score: 2.76, confidence: 0.74 });
    const b = one('s', { probabilities: { 3: 2, 4: 2 } }) as { distribution: number[]; score: number; confidence: number };
    expect(b.distribution).toEqual([0, 0, 0, 0.5, 0.5]);
    expect(b.score).toBeCloseTo(3.5, 12);
    expect(b.confidence).toBeCloseTo((5 * 0.5 - 1) / 4, 12);
    expect(() => one('s', { probabilities: { 7: 1 } })).toThrow(/has level "7", but the question has 5 levels/);
  });

  it('a missing answer, the wrong type, no answers at all', () => {
    expect(() => parseAnswers({ answers: {} }, { n: qs.n! })).toThrow(/no answer for question "n"/);
    expect(() => one('n', { type: 'score', score: 1 })).toThrow(/expected "noul"/);
    expect(() => parseAnswers({ model: 'm' }, { n: qs.n! })).toThrow(/missing `answers`/);
  });
});

describe('cost estimate (fix #4): the direct route reports no cost, only usage', () => {
  const body = (model: string, inputTokens: number) => ({ model, answers: { n: { noul: 0.5 } }, usage: { input_tokens: inputTokens, output_tokens: 3 } });

  it('jev-1.13.0 gets an estimate from its published rate ($42 per Btok), marked estimated', () => {
    const r = parseAnswers(body('jev-1.13.0', 120), { n: qs.n! });
    expect(r.costUsd).toBeCloseTo(120 * (42 / 1_000_000_000), 12);
    expect(r.costEstimated).toBe(true);
  });

  it('a model with no published rate stays unreported, never guessed', () => {
    const r = parseAnswers(body('some-future-model', 120), { n: qs.n! });
    expect(r.costUsd).toBeUndefined();
    expect(r.costEstimated).toBeUndefined();
  });

  it('a reported gateway cost always wins over the estimate, and is never marked estimated', () => {
    const raw = { ...body('jev-1.13.0', 120), provider_metadata: { gateway: { cost: '0.00042' } } };
    const r = parseAnswers(raw, { n: qs.n! });
    expect(r.costUsd).toBeCloseTo(0.00042, 10);
    expect(r.costEstimated).toBeUndefined();
  });
});
