// The TypeSafe adapter: sidewise questions → wire calls → sidewise answers (scale folded back from a choice),
// plus provider selection.
import { describe, expect, it } from 'vitest';
import { selectProvider } from '../../src/classifier/select.ts';
import { createTypesafeAdapter } from '../../src/classifier/typesafe/adapter.ts';
import { loadCassette, replay } from './cassette.ts';

const env = { TYPESAFE_API_KEY: 'k-test' };

describe('TypeSafe adapter', () => {
  it('sends yes/no slots as one noul call; the cost is unknown when not reported', async () => {
    const c = loadCassette('noul/ok.json');
    const r = replay(c);
    const res = await createTypesafeAdapter(env, { fetch: r.fetch }).ask(
      [{ type: 'noul', id: 'p1', ask: 'Is request text placed directly into the SQL query?' }],
      { code: 'x' },
    );
    expect(r.sent).toHaveLength(1);
    expect(r.sent[0]).toMatchObject(c.expectRequest!);
    expect(res.answers.p1).toEqual({ type: 'noul', probability: 0.91 });
    expect(res.costUsd).toBeUndefined();
  });

  it('sends scale and direction together as one choice call and folds the scale back into levels', async () => {
    const r = replay({
      name: 'scale + direction',
      response: {
        status: 200,
        body: {
          model: 'jev-1.13.0',
          answers: {
            d1: { type: 'choice', choice: 'high', probabilities: { none: 0.05, low: 0.05, medium: 0.1, high: 0.7, critical: 0.1 } },
            d2: { type: 'choice', choice: 'fix', probabilities: { ship: 0.1, fix: 0.8, block: 0.1 } },
          },
          usage: { input_tokens: 10, output_tokens: 2 },
          provider_metadata: { gateway: { cost: 0.001 } },
        },
      },
    });
    const res = await createTypesafeAdapter(env, { fetch: r.fetch }).ask(
      [
        { type: 'score', id: 'd1', ask: 'How severe?', levels: ['none', 'low', 'medium', 'high', 'critical'] },
        { type: 'choice', id: 'd2', ask: 'Where should this go?', options: { ship: 'ship', fix: 'fix', block: 'block' } },
      ],
      {},
    );
    expect(r.sent).toHaveLength(1);
    const d1 = res.answers.d1!;
    expect(d1.type).toBe('score');
    if (d1.type === 'score') {
      expect(d1.distribution.map((p) => Number(p.toFixed(2)))).toEqual([0.05, 0.05, 0.1, 0.7, 0.1]);
    }
    expect(res.answers.d2).toMatchObject({ type: 'choice', choice: 'fix' });
    expect(res.costUsd).toBeCloseTo(0.001, 10);
  });

  it('refuses to start without a key', () => {
    expect(() => createTypesafeAdapter({})).toThrow(/no TypeSafe key/);
  });
});

describe('selectProvider', () => {
  it('uses fake with no key, and typesafe when a key is set', () => {
    expect(selectProvider({}).adapter).toBe('fake');
    expect(selectProvider(env).adapter).toBe('typesafe');
  });

  it('SIDEWISE_PROVIDER wins, and an unknown name is refused', () => {
    expect(selectProvider({ ...env, SIDEWISE_PROVIDER: 'fake' }).adapter).toBe('fake');
    expect(() => selectProvider({ SIDEWISE_PROVIDER: 'nope' })).toThrow(/not a provider/);
    expect(() => selectProvider({ SIDEWISE_PROVIDER: 'typesafe' })).toThrow(/no TypeSafe key/);
  });
});
