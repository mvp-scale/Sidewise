// TypeSafe noul (yes/no probability) and choice (named-option distribution): request shapes and response parsing.
import { describe, expect, it } from 'vitest';
import {
  JevApiError,
  choiceQuestion,
  createJevClient,
  noulQuestion,
  parseChoiceResponse,
  parseNoulResponse,
} from '../../src/classifier/typesafe/client.ts';
import type { JevChoiceQuestion, JevChoiceRequest, JevConfig, JevNoulRequest } from '../../src/classifier/typesafe/client.ts';

const config = (over: Partial<JevConfig> = {}): JevConfig => ({
  route: 'direct',
  apiKey: 'k-test',
  baseURL: 'https://api.typesafe.ai',
  model: 'jev-1.13.0',
  wireModel: 'jev-1.13.0',
  timeoutMs: 1000,
  ...over,
});

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });

describe('noulQuestion / parseNoulResponse', () => {
  it('builds the documented shape', () => {
    expect(noulQuestion('Is text from the request placed directly into the SQL query?')).toEqual({
      type: 'noul',
      instructions: 'Is text from the request placed directly into the SQL query?',
    });
  });

  it('reads a probability and the reported confidence', () => {
    const r = parseNoulResponse({ model: 'jev-1.13.0', answers: { p1: { type: 'noul', noul: 0.12, confidence: 0.76 } }, usage: { input_tokens: 10, output_tokens: 2 } }, ['p1']);
    expect(r.answers.p1).toEqual({ probability: 0.12, confidence: 0.76 });
    expect(r.usage).toEqual({ inputTokens: 10, outputTokens: 2 });
  });

  it('falls back to |2p-1| confidence when the server omits it', () => {
    expect(parseNoulResponse({ answers: { a: { noul: 0.9 } } }, ['a']).answers.a!.confidence).toBeCloseTo(0.8, 12);
    expect(parseNoulResponse({ answers: { a: { noul: 0.5 } } }, ['a']).answers.a!.confidence).toBeCloseTo(0, 12);
  });

  it('rejects a missing answer, the wrong type, an out-of-range probability', () => {
    expect(() => parseNoulResponse({ answers: {} }, ['a'])).toThrow(/no answer for question "a"/);
    expect(() => parseNoulResponse({ answers: { a: { type: 'score', score: 2 } } }, ['a'])).toThrow(/expected "noul"/);
    expect(() => parseNoulResponse({ answers: { a: { noul: 1.4 } } }, ['a'])).toThrow(/must be in \[0, 1\]/);
  });

  it('the client POSTs {model,state,questions} and parses the noul answers', async () => {
    const request: JevNoulRequest = { state: { code: 'SELECT * FROM x WHERE id = ' + '"' + '${id}' + '"' }, questions: { p1: noulQuestion('sql injection?') } };
    let seenBody: unknown;
    const client = createJevClient(config(), {
      fetch: async (_url, init) => {
        seenBody = JSON.parse((init as RequestInit).body as string);
        return json({ model: 'jev-1.13.0', answers: { p1: { type: 'noul', noul: 0.91 } }, usage: {} });
      },
    });
    const res = await client.noul(request);
    expect(seenBody).toEqual({ model: 'jev-1.13.0', state: request.state, questions: request.questions });
    expect(res.answers.p1!.probability).toBe(0.91);
  });
});

describe('choiceQuestion / parseChoiceResponse', () => {
  const options = ['ship', 'fix', 'block'];
  const questions: Record<string, JevChoiceQuestion> = { d1: choiceQuestion('Ship the change?', options) };

  it('builds the documented shape and refuses <2 or >255 options', () => {
    expect(choiceQuestion('q', options)).toEqual({ type: 'choice', instructions: 'q', options });
    expect(() => choiceQuestion('q', ['only-one'])).toThrow(RangeError);
    expect(() => choiceQuestion('q', Array.from({ length: 256 }, (_, i) => `o${i}`))).toThrow(RangeError);
  });

  it('reads the top choice, normalises probabilities, and the reported confidence', () => {
    const r = parseChoiceResponse({ model: 'm', answers: { d1: { type: 'choice', choice: 'fix', confidence: 0.81, probabilities: { ship: 0.07, fix: 0.81, block: 0.12 } } } }, questions);
    expect(r.answers.d1).toEqual({ choice: 'fix', confidence: 0.81, probabilities: { ship: 0.07, fix: 0.81, block: 0.12 } });
  });

  it('renormalises, and falls back to argmax choice and a computed confidence', () => {
    const r = parseChoiceResponse({ answers: { d1: { probabilities: { ship: 1, fix: 3, block: 0 } } } }, questions);
    expect(r.answers.d1!.probabilities.fix).toBeCloseTo(0.75, 12);
    expect(r.answers.d1!.choice).toBe('fix');
    expect(r.answers.d1!.confidence).toBeCloseTo((3 * 0.75 - 1) / 2, 12);
  });

  it('rejects a missing answer, the wrong type, an unknown option, an all-zero vector', () => {
    expect(() => parseChoiceResponse({ answers: {} }, questions)).toThrow(/no answer for question "d1"/);
    expect(() => parseChoiceResponse({ answers: { d1: { type: 'noul', probabilities: { ship: 1, fix: 0, block: 0 } } } }, questions)).toThrow(/expected "choice"/);
    expect(() => parseChoiceResponse({ answers: { d1: { probabilities: { ship: 1, fix: 0, wat: 1 } } } }, questions)).toThrow(/not in the request's options/);
    expect(() => parseChoiceResponse({ answers: { d1: { probabilities: { ship: 0, fix: 0, block: 0 } } } }, questions)).toThrow(/sum to zero/);
  });

  it('the client POSTs {model,state,questions} and parses the choice answer', async () => {
    const request: JevChoiceRequest = { state: { transcript: 'x' }, questions };
    let seenBody: unknown;
    const client = createJevClient(config(), {
      fetch: async (_url, init) => {
        seenBody = JSON.parse((init as RequestInit).body as string);
        return json({ model: 'jev-1.13.0', answers: { d1: { choice: 'fix', probabilities: { ship: 0.07, fix: 0.81, block: 0.12 } } }, usage: { input_tokens: 5, output_tokens: 1 } });
      },
    });
    const res = await client.choice(request);
    expect(seenBody).toEqual({ model: 'jev-1.13.0', state: request.state, questions: request.questions });
    expect(res.answers.d1!.choice).toBe('fix');
    expect(res.usage).toEqual({ inputTokens: 5, outputTokens: 1 });
  });

  it('a malformed 200 body is a non-retryable JevApiError from the client too', async () => {
    const client = createJevClient(config(), { fetch: async () => json({ model: 'm', answers: {} }) });
    const err = await client.choice({ state: {}, questions }).then(
      () => null,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(JevApiError);
    expect((err as JevApiError).retryable).toBe(false);
  });
});
