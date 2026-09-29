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

/** No real waiting: a retryable status keeps retrying (P8), so this repeats the SAME cassette enough times
 *  (default 3: one attempt plus the 2 retries the client allows) that the FINAL attempt still fails with the
 *  status/body under test — a non-retryable status (401, 422, a malformed 200) never gets past attempt 1, so
 *  the extra copies are simply unused there. */
async function failure(file: string, over: Partial<JevConfig> = {}, copies = 3): Promise<JevApiError> {
  const c = loadCassette(file);
  const r = replay(...Array<typeof c>(copies).fill(c));
  const err = await createJevClient(config(over), { fetch: r.fetch, sleep: async () => {} })
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
    // fix #4: the direct route reports no cost at all, so jev-1.13.0's published rate estimates one instead.
    expect(res.costUsd).toBeCloseTo(120 * (42 / 1_000_000_000), 12);
    expect(res.costEstimated).toBe(true);
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

  it('reads TypeSafe\'s real error shape {error: {type, message}}, not [object Object] (P7)', async () => {
    expect((await failure('errors/401.json')).message).toBe('HTTP 401: invalid api key');
    expect((await failure('errors/422.json')).message).toBe('HTTP 422: questions must not be empty');
  });
});

describe('bounded retry on 429/529 (P8)', () => {
  it('429 then 200: succeeds after one retry, honouring the server\'s Retry-After [C-096]', async () => {
    const r = replay(loadCassette('errors/429.json'), loadCassette('noul/ok.json'));
    const waits: number[] = [];
    const res = await createJevClient(config(), { fetch: r.fetch, sleep: async (ms) => void waits.push(ms) }).ask({ state: {}, questions: noul });
    expect(res.answers.p1).toEqual({ type: 'noul', probability: 0.91, confidence: 0.82 });
    expect(r.sent).toHaveLength(2); // one retry: the first 429, then the successful attempt
    expect(waits).toEqual([1000]); // errors/429.json's own Retry-After: 1 (seconds), not the backoff default
  });

  it('529 three times: fails after 3 attempts (1 + 2 retries), backing off between them [C-096]', async () => {
    const c = loadCassette('errors/529.json');
    const r = replay(c, c, c);
    const waits: number[] = [];
    const err = await createJevClient(config(), { fetch: r.fetch, sleep: async (ms) => void waits.push(ms) })
      .ask({ state: {}, questions: noul })
      .then(() => null, (e: unknown) => e);
    expect(err).toBeInstanceOf(JevApiError);
    expect((err as JevApiError).status).toBe(529);
    expect(r.sent).toHaveLength(3); // never a 4th attempt: 2 retries is the cap
    expect(waits).toHaveLength(2); // one wait between attempt 1→2 and another between 2→3
    expect(waits.every((ms) => ms > 0 && ms <= 10_000)).toBe(true); // capped per the P8 ruling
  });

  it('401 never retries: one attempt, no wait [C-096]', async () => {
    const r = replay(loadCassette('errors/401.json'));
    const waits: number[] = [];
    const err = await createJevClient(config(), { fetch: r.fetch, sleep: async (ms) => void waits.push(ms) })
      .ask({ state: {}, questions: noul })
      .then(() => null, (e: unknown) => e);
    expect(err).toBeInstanceOf(JevApiError);
    expect(r.sent).toHaveLength(1);
    expect(waits).toHaveLength(0);
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

  it('with no deps.resolveStored at all, stays exactly as pure as before: no key, no keySource', () => {
    const cfg = resolveJevConfig({});
    expect(cfg.apiKey).toBeUndefined();
    expect(cfg.keySource).toBeUndefined();
  });

  it('an env key wins over a stored one, and keySource says "env" [C-097]', () => {
    const cfg = resolveJevConfig({ TYPESAFE_API_KEY: 'k' }, { resolveStored: () => ({ apiKey: 'stored-k', source: 'keychain', provider: 'typesafe' }) });
    expect(cfg).toMatchObject({ route: 'direct', apiKey: 'k', keySource: 'env' });
  });

  it('with no env key, deps.resolveStored supplies the key and its source [C-097]', () => {
    const fromKeychain = resolveJevConfig({}, { resolveStored: () => ({ apiKey: 'kc-key', source: 'keychain', provider: 'typesafe' }) });
    expect(fromKeychain).toMatchObject({ route: 'direct', apiKey: 'kc-key', keySource: 'keychain' });

    const fromFile = resolveJevConfig({}, { resolveStored: () => ({ apiKey: 'file-key', source: 'file', provider: 'gateway' }) });
    expect(fromFile).toMatchObject({ route: 'gateway', apiKey: 'file-key', keySource: 'file', wireModel: 'typesafe-ai/jev' });
  });

  it('deps.resolveStored returning undefined behaves exactly like no deps at all', () => {
    expect(resolveJevConfig({}, { resolveStored: () => undefined })).toMatchObject({ route: 'direct', apiKey: undefined });
  });
});

describe('MM3_BASE_URL (P3)', () => {
  it('an https override wins over the route default, trailing slashes stripped [C-094]', () => {
    expect(resolveJevConfig({ MM3_BASE_URL: 'https://proxy.example.com/' })).toMatchObject({ baseURL: 'https://proxy.example.com' });
  });

  it('http is allowed for localhost, 127.0.0.1 and [::1], nowhere else [C-094]', () => {
    expect(resolveJevConfig({ MM3_BASE_URL: 'http://localhost:8080' })).toMatchObject({ baseURL: 'http://localhost:8080' });
    expect(resolveJevConfig({ MM3_BASE_URL: 'http://127.0.0.1:8080' })).toMatchObject({ baseURL: 'http://127.0.0.1:8080' });
    expect(resolveJevConfig({ MM3_BASE_URL: 'http://[::1]:8080' })).toMatchObject({ baseURL: 'http://[::1]:8080' });
  });

  it('http to a non-local host is a stop: ✖ MM3_BASE_URL, exit 2 [C-094]', () => {
    let err: unknown;
    try {
      resolveJevConfig({ MM3_BASE_URL: 'http://example.com' });
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(JevConfigError);
    expect((err as JevConfigError).message).toMatch(/^✖ MM3_BASE_URL:/);
    expect((err as JevConfigError).exit).toBe(2);
  });

  it('a string that is not a URL at all is the same stop', () => {
    expect(() => resolveJevConfig({ MM3_BASE_URL: 'not a url' })).toThrow(/^✖ MM3_BASE_URL:/);
  });

  it('the retired JEV_BASE_URL is no longer read: the route default wins', () => {
    expect(resolveJevConfig({ JEV_BASE_URL: 'https://old-escape-hatch.example.com', TYPESAFE_API_KEY: 'k' })).toMatchObject({ baseURL: 'https://api.typesafe.ai' });
  });
});
