// The TypeSafe adapter: sidewise questions → wire calls → sidewise answers (scale folded back from a choice),
// plus provider selection.
import { describe, expect, it } from 'vitest';
import { selectProvider } from '../../src/classifier/select.ts';
import { createTypesafeAdapter } from '../../src/classifier/typesafe/adapter.ts';
import { loadCassette, replay } from './cassette.ts';

const env = { TYPESAFE_API_KEY: 'k-test' };

describe('TypeSafe adapter', () => {
  it('one ask is ONE POST: yes/no as noul, a scale as score, a choice as choice', async () => {
    const c = loadCassette('mixed/ok.json');
    const r = replay(c);
    const res = await createTypesafeAdapter(env, { fetch: r.fetch }).ask(
      [
        { type: 'noul', id: 'goal', ask: 'This login handler is safe to merge' },
        { type: 'noul', id: '1', ask: 'Is request text placed directly into the SQL query?' },
        { type: 'score', id: '11', ask: 'How severe is the worst issue?', levels: ['none', 'low', 'medium', 'high', 'critical'] },
        { type: 'choice', id: '12', ask: 'Where should this go?', options: { ship: 'ship', fix: 'fix', block: 'block' } },
      ],
      { goal: 'This login handler is safe to merge', code: { 'src/user.ts:1-3': 'return db.query(sql)' } },
    );
    expect(r.sent).toHaveLength(1);
    expect(r.sent[0]).toMatchObject(c.expectRequest!);
    expect(res.answers['1']).toEqual({ type: 'noul', probability: 0.94 });
    const s = res.answers['11']!;
    expect(s.type).toBe('score');
    if (s.type === 'score') expect(s.distribution.map((p) => Number(p.toFixed(2)))).toEqual([0.02, 0.05, 0.1, 0.81, 0.02]);
    expect(res.answers['12']).toMatchObject({ type: 'choice', choice: 'block' });
    expect(res.costUsd).toBeUndefined();
  });

  it('no questions: no call', async () => {
    const r = replay();
    expect(await createTypesafeAdapter(env, { fetch: r.fetch }).ask([], {})).toEqual({ answers: {}, costUsd: 0 });
    expect(r.sent).toHaveLength(0);
  });

  it('refuses to start without a key', () => {
    expect(() => createTypesafeAdapter({})).toThrow(/no TypeSafe key/);
  });

  it('a sweep item sends instructions {item, question}, answered under "<item id>#<n>"', async () => {
    const c = loadCassette('sweep/ok.json');
    const r = replay(c);
    const res = await createTypesafeAdapter(env, { fetch: r.fetch }).ask(
      [
        { type: 'noul', id: 'payments#1', ask: 'Does payments own one clear responsibility?', item: 'payments' },
        { type: 'noul', id: 'ledger#1', ask: 'Does ledger own one clear responsibility?', item: 'ledger' },
      ],
      { goal: 'The checkout redesign is sound', items: { payments: 'payments', ledger: 'ledger' } },
    );
    expect(r.sent[0]).toMatchObject(c.expectRequest!);
    expect(res.answers['payments#1']).toEqual({ type: 'noul', probability: 0.31 });
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
