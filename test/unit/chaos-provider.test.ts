// The chaos provider: a fault schedule consumed one step per call, shared across processes through a state file.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CHAOS_MODEL, createChaosAdapter, parseSchedule } from '../../src/classifier/chaos.ts';
import type { ClassifierQuestion } from '../../src/classifier/port.ts';
import { providerIdentity, selectProvider } from '../../src/classifier/select.ts';
import { JevApiError } from '../../src/classifier/typesafe/config.ts';
import { tempProject } from '../helpers/project.ts';

const Q: ClassifierQuestion[] = [
  { type: 'noul', id: '1', ask: 'Is it wrong?' },
  { type: 'noul', id: '2', ask: 'Is it risky?' },
];
const outcome = (p: Promise<unknown>): Promise<string> =>
  p.then(
    (r) => {
      const a = (r as { answers: Record<string, { probability?: number }> }).answers;
      if (!a['1']) return 'missing';
      return a['1'].probability === 1.4 ? 'malformed' : 'ok';
    },
    (e: unknown) => (e instanceof JevApiError ? `${e.status ?? 'timeout'}${e.retryable ? '' : ' final'}` : 'other'),
  );

describe('parseSchedule', () => {
  it('reads a comma list, empty means always ok, and names a bad step', () => {
    expect(parseSchedule('503, malformed,ok')).toEqual({ steps: ['503', 'malformed', 'ok'] });
    expect(parseSchedule(undefined)).toEqual({ steps: [] });
    expect(parseSchedule('5o3')).toEqual({ stop: '✖ provider: SIDEWISE_CHAOS has "5o3" → use a comma list of ok, 401, 429, 503, 529, timeout, malformed, missing' });
  });
});

describe('chaos adapter', () => {
  it('takes one step per call, in order, then ok forever', async () => {
    const chaos = createChaosAdapter(['503', '401', 'timeout', 'malformed', 'missing', '429', '529']);
    expect(chaos).toMatchObject({ adapter: 'chaos', model: CHAOS_MODEL });
    const seen: string[] = [];
    for (let i = 0; i < 9; i++) seen.push(await outcome(chaos.ask(Q, {})));
    expect(seen).toEqual(['503', '401 final', 'timeout', 'malformed', 'missing', '429', '529', 'ok', 'ok']);
  });

  it('a fault message reads like the real client', async () => {
    await expect(createChaosAdapter(['503']).ask(Q, {})).rejects.toThrow('HTTP 503: service unavailable');
  });

  it('with a state file, separate adapters (processes) share one schedule; a new schedule restarts it', async () => {
    const { paths } = tempProject({});
    const state = path.join(paths.dir, 'chaos.json');
    expect(await outcome(createChaosAdapter(['503', 'ok'], state).ask(Q, {}))).toBe('503');
    expect(await outcome(createChaosAdapter(['503', 'ok'], state).ask(Q, {}))).toBe('ok');
    expect(JSON.parse(readFileSync(state, 'utf8'))).toEqual({ schedule: '503,ok', next: 2 });
    expect(await outcome(createChaosAdapter(['malformed'], state).ask(Q, {}))).toBe('malformed');
  });
});

describe('selectProvider and providerIdentity', () => {
  it('SIDEWISE_PROVIDER=chaos uses SIDEWISE_CHAOS; a bad schedule is a clean stop', async () => {
    const p = selectProvider({ SIDEWISE_PROVIDER: 'chaos', SIDEWISE_CHAOS: '503' });
    expect(p.adapter).toBe('chaos');
    await expect(p.ask(Q, {})).rejects.toThrow('HTTP 503');
    expect(() => selectProvider({ SIDEWISE_PROVIDER: 'chaos', SIDEWISE_CHAOS: 'boom' })).toThrow(/SIDEWISE_CHAOS has "boom"/);
    expect(() => selectProvider({ SIDEWISE_PROVIDER: 'nope' })).toThrow('✖ provider: "nope" is not a provider → use fake, chaos or typesafe');
  });

  it('names the provider that would answer, without building it (no key needed)', () => {
    expect(providerIdentity({})).toEqual({ adapter: 'fake', model: 'sidewise-fake-1', route: 'fake', baseURL: null });
    expect(providerIdentity({ SIDEWISE_PROVIDER: 'chaos' })).toEqual({ adapter: 'chaos', model: CHAOS_MODEL, route: 'chaos', baseURL: null });
    expect(providerIdentity({ TYPESAFE_API_KEY: 'k' })).toEqual({ adapter: 'typesafe', model: 'jev-1.13.0', route: 'direct', baseURL: 'https://api.typesafe.ai' });
    expect(providerIdentity({ SIDEWISE_PROVIDER: 'typesafe' })).toEqual({ adapter: 'typesafe', model: 'jev-1.13.0', route: 'direct', baseURL: 'https://api.typesafe.ai' });
  });

  it('names the gateway route, and a custom route when SIDEWISE_BASE_URL overrides the default (P2)', () => {
    expect(providerIdentity({ AI_GATEWAY_API_KEY: 'g' })).toEqual({ adapter: 'typesafe', model: 'jev-1.13.0', route: 'gateway', baseURL: 'https://ai-gateway.vercel.sh/typesafe' });
    expect(providerIdentity({ TYPESAFE_API_KEY: 'k', SIDEWISE_BASE_URL: 'http://localhost:8080' })).toEqual({
      adapter: 'typesafe',
      model: 'jev-1.13.0',
      route: 'custom',
      baseURL: 'http://localhost:8080',
    });
  });
});
