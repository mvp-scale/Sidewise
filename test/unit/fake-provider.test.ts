import { describe, expect, it } from 'vitest';
import { createFakeAdapter, FAKE_MODEL } from '../../src/classifier/fake.ts';
import type { ClassifierQuestion } from '../../src/classifier/port.ts';

const questions: ClassifierQuestion[] = [
  { type: 'noul', id: 's1', ask: 'Is request text placed directly into the SQL query?' },
  { type: 'score', id: 'p1', ask: 'How severe?', levels: ['none', 'low', 'high'] },
  { type: 'choice', id: 'p2', ask: 'Where should this go?', options: { ship: 'ship', fix: 'fix', block: 'block' } },
];

describe('fake provider', () => {
  it('is labeled fake, costs nothing, and answers every question with the right shape', async () => {
    const fake = createFakeAdapter();
    expect(fake.adapter).toBe('fake');
    expect(fake.model).toBe(FAKE_MODEL);
    const r = await fake.ask(questions, {});
    expect(r.costUsd).toBe(0);
    expect(r.answers.s1).toMatchObject({ type: 'noul' });
    expect(r.answers.p1).toMatchObject({ type: 'score' });
    expect(r.answers.p2).toMatchObject({ type: 'choice' });
  });

  it('is deterministic for the same question', async () => {
    const a = await createFakeAdapter().ask(questions, {});
    const b = await createFakeAdapter().ask(questions, {});
    expect(a).toEqual(b);
  });

  it('honours pinned answers under state.__fake', async () => {
    const r = await createFakeAdapter().ask(questions, { __fake: { s1: 0.93, p1: 2, p2: 'block' } });
    expect(r.answers.s1).toEqual({ type: 'noul', probability: 0.93 });
    expect(r.answers.p1).toMatchObject({ type: 'score', distribution: [0, 0, 1] });
    expect(r.answers.p2).toMatchObject({ type: 'choice', choice: 'block' });
  });
});
