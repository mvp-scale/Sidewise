// The TypeSafe client against recorded transactions (fixtures/wire): request shape, answers, cost, and
// every error class the classifier can return.
import { describe, expect, it } from 'vitest';
import {
  choiceQuestion,
  createJevClient,
  JevApiError,
  JevConfigError,
  noulQuestion,
  resolveJevConfig,
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
const questions = { p1: noulQuestion('Is request text placed directly into the SQL query?') };

async function failure(file: string, over: Partial<JevConfig> = {}): Promise<JevApiError> {
  const r = replay(loadCassette(file));
  const err = await createJevClient(config(over), { fetch: r.fetch })
    .noul({ state: {}, questions })
    .then(() => null, (e: unknown) => e);
  expect(err).toBeInstanceOf(JevApiError);
  return err as JevApiError;
}

describe('TypeSafe client, recorded transactions', () => {
  it('noul ok: sends the recorded request shape and reads the answer and usage', async () => {
    const c = loadCassette('noul/ok.json');
    const r = replay(c);
    const res = await createJevClient(config(), { fetch: r.fetch }).noul({ state: { code: 'x' }, questions });
    expect(r.sent[0]).toMatchObject(c.expectRequest!);
    expect(res.answers.p1).toEqual({ probability: 0.91, confidence: 0.82 });
    expect(res.usage).toEqual({ inputTokens: 120, outputTokens: 4 });
    expect(res.costUsd).toBeUndefined();
  });

  it('noul without a confidence falls back to |2p - 1|', async () => {
    const r = replay(loadCassette('noul/no-confidence.json'));
    const res = await createJevClient(config(), { fetch: r.fetch }).noul({ state: {}, questions });
    expect(res.answers.p1).toEqual({ probability: 0.5, confidence: 0 });
  });

  it('choice through the gateway reports its cost', async () => {
    const r = replay(loadCassette('choice/gateway-cost.json'));
    const res = await createJevClient(config({ route: 'gateway', wireModel: 'typesafe-ai/jev' }), { fetch: r.fetch }).choice({
      state: {},
      questions: { d1: choiceQuestion('Where should this go?', ['ship', 'fix', 'block']) },
    });
    expect(res.answers.d1!.choice).toBe('fix');
    expect(res.costUsd).toBeCloseTo(0.00042, 10);
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
