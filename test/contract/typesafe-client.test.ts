// The TypeSafe client against recorded transactions (fixtures/wire): the request body for each primitive, one
// POST for a mixed ask, answers, cost, and every error class the classifier can return.
import { describe, expect, it } from 'vitest';
import {
  choiceQuestion,
  createJevClient,
  JevApiError,
  JevConfigError,
  noulQuestion,
  resolveJevConfig,
  scoreQuestion,
  type JevConfig,
} from '../../src/classifier/typesafe/client.ts';
import { loadCassette, replay } from './cassette.ts';

const config = (over: Partial<JevConfig> = {}): JevConfig => ({
  route: 'direct',
  apiKey: 'k-test',
  baseURL: 'https://api.typesafe.ai',
  model: 'jev-1.13.0',
  wireModel: 'jev-1.13.0',
  timeoutMs: 1000,
  ...over,
});
const noul = { p1: noulQuestion('Is request text placed directly into the SQL query?') };
const LEVELS = ['none', 'low', 'medium', 'high', 'critical'];

async function failure(file: string, over: Partial<JevConfig> = {}): Promise<JevApiError> {
  const r = replay(loadCassette(file));
  const err = await createJevClient(config(over), { fetch: r.fetch })
    .ask({ state: {}, questions: noul })
    .then(() => null, (e: unknown) => e);
  expect(err).toBeInstanceOf(JevApiError);
  return err as JevApiError;
}

describe('TypeSafe client, recorded transactions', () => {
  it('noul ok: sends the recorded request shape and reads the answer and usage', async () => {
    const c = loadCassette('noul/ok.json');
    const r = replay(c);
    const res = await createJevClient(config(), { fetch: r.fetch }).ask({ state: { code: 'x' }, questions: noul });
    expect(r.sent[0]).toMatchObject(c.expectRequest!);
    expect(res.answers.p1).toEqual({ type: 'noul', probability: 0.91, confidence: 0.82 });
    expect(res.usage).toEqual({ inputTokens: 120, outputTokens: 4 });
    expect(res.costUsd).toBeUndefined();
  });

  it('noul without a confidence falls back to |2p - 1|', async () => {
    const r = replay(loadCassette('noul/no-confidence.json'));
    const res = await createJevClient(config(), { fetch: r.fetch }).ask({ state: {}, questions: noul });
    expect(res.answers.p1).toEqual({ type: 'noul', probability: 0.5, confidence: 0 });
  });

  it('choice sends criteria {option: option}, never options', async () => {
    const c = loadCassette('choice/ok.json');
    const r = replay(c);
    const res = await createJevClient(config(), { fetch: r.fetch }).ask({ state: {}, questions: { d1: choiceQuestion('Where should this go?', ['ship', 'fix', 'block']) } });
    expect(r.sent[0]).toMatchObject(c.expectRequest!);
    expect((r.sent[0] as { questions: { d1: object } }).questions.d1).not.toHaveProperty('options');
    expect(res.answers.d1).toMatchObject({ type: 'choice', choice: 'block', confidence: 0.95 });
  });

  it('score sends criteria [levels] and reads probabilities keyed by level index', async () => {
    const c = loadCassette('score/ok.json');
    const r = replay(c);
    const res = await createJevClient(config(), { fetch: r.fetch }).ask({ state: {}, questions: { s1: scoreQuestion('How severe is the worst issue?', LEVELS) } });
    expect(r.sent[0]).toMatchObject(c.expectRequest!);
    const s1 = res.answers.s1!;
    expect(s1).toMatchObject({ type: 'score', score: 2.76, confidence: 0.74 });
    if (s1.type === 'score') expect(s1.distribution.map((p) => Number(p.toFixed(2)))).toEqual([0.02, 0.05, 0.1, 0.81, 0.02]);
  });

  it('one POST carries noul, score and choice together', async () => {
    const c = loadCassette('mixed/ok.json');
    const r = replay(c);
    const res = await createJevClient(config(), { fetch: r.fetch }).ask({
      state: { goal: 'This login handler is safe to merge', code: { 'src/user.ts:1-3': 'return db.query(sql)' } },
      questions: {
        goal: noulQuestion('This login handler is safe to merge'),
        1: noulQuestion('Is request text placed directly into the SQL query?'),
        11: scoreQuestion('How severe is the worst issue?', LEVELS),
        12: choiceQuestion('Where should this go?', ['ship', 'fix', 'block']),
      },
    });
    expect(r.sent).toHaveLength(1);
    expect(r.sent[0]).toMatchObject(c.expectRequest!);
    expect(Object.fromEntries(Object.entries(res.answers).map(([k, a]) => [k, a.type]))).toEqual({ goal: 'noul', 1: 'noul', 11: 'score', 12: 'choice' });
  });

  it('choice through the gateway reports its cost', async () => {
    const c = loadCassette('choice/gateway-cost.json');
    const r = replay(c);
    const res = await createJevClient(config({ route: 'gateway', wireModel: 'typesafe-ai/jev' }), { fetch: r.fetch }).ask({
      state: {},
      questions: { d1: choiceQuestion('Where should this go?', ['ship', 'fix', 'block']) },
    });
    expect(r.sent[0]).toMatchObject(c.expectRequest!);
    expect(res.answers.d1).toMatchObject({ choice: 'fix' });
    expect(res.costUsd).toBeCloseTo(0.00042, 10);
  });

  it('refuses to build without a key', () => {
    expect(() => createJevClient(config({ apiKey: undefined }))).toThrow(JevConfigError);
  });

  it.each([
    ['errors/429.json', 429, true],
    ['errors/503.json', 503, true],
    ['errors/529.json', 529, true],
    ['errors/401.json', 401, false],
    ['errors/422.json', 422, false],
    ['errors/not-json.json', 502, true],
  ])('%s → HTTP %i, retryable %s', async (file, status, retryable) => {
    const err = await failure(file);
    expect(err.status).toBe(status);
    expect(err.retryable).toBe(retryable);
  });

  it('429 carries Retry-After in milliseconds', async () => {
    expect((await failure('errors/429.json')).retryAfterMs).toBe(1000);
  });

  it('a request that never answers times out as a retryable error', async () => {
    const err = await failure('errors/timeout.json', { timeoutMs: 20 });
    expect(err.message).toMatch(/timed out after 20ms/);
    expect(err.retryable).toBe(true);
  });

  it('a malformed answer is not retryable', async () => {
    const err = await failure('errors/malformed.json');
    expect(err.message).toMatch(/must be in \[0, 1\]/);
    expect(err.retryable).toBe(false);
  });
});

describe('resolveJevConfig', () => {
  it('with no key: direct route, pinned default model, no key', () => {
    expect(resolveJevConfig({})).toMatchObject({ route: 'direct', apiKey: undefined, model: 'jev-1.13.0' });
  });

  it('TYPESAFE_API_KEY selects direct; AI_GATEWAY_API_KEY alone selects the gateway', () => {
    expect(resolveJevConfig({ TYPESAFE_API_KEY: 'k' })).toMatchObject({ route: 'direct', apiKey: 'k' });
    expect(resolveJevConfig({ AI_GATEWAY_API_KEY: 'g' })).toMatchObject({ route: 'gateway', wireModel: 'typesafe-ai/jev' });
  });

  it('refuses a floating model alias', () => {
    expect(() => resolveJevConfig({ JEV_MODEL: 'jev-latest' })).toThrow(JevConfigError);
  });
});
