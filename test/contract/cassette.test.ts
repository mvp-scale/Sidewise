// Harness self-test: every recorded transaction loads and replays. The client/adapter contract tests
// that consume these land with the TypeSafe provider.
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadCassette, replay } from './cassette.ts';

const WIRE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'wire');
const all = readdirSync(WIRE, { recursive: true, encoding: 'utf8' }).filter((f) => f.endsWith('.json'));

describe('wire cassettes', () => {
  it.each(all)('%s has a response or a timeout', (rel) => {
    const c = loadCassette(rel);
    expect(c.name).toBeTruthy();
    expect(Boolean(c.response) !== Boolean(c.timeout)).toBe(true);
  });

  it('replays in order and records what was sent', async () => {
    const r = replay(loadCassette('errors/429.json'), loadCassette('noul/ok.json'));
    const first = await r.fetch('https://x/v1/systemone', { method: 'POST', body: '{"a":1}' });
    expect(first.status).toBe(429);
    expect(first.headers.get('retry-after')).toBe('1');
    const second = await r.fetch('https://x/v1/systemone', { method: 'POST', body: '{"a":2}' });
    expect(((await second.json()) as { answers: { p1: { noul: number } } }).answers.p1.noul).toBe(0.91);
    expect(r.sent).toEqual([{ a: 1 }, { a: 2 }]);
    await expect(r.fetch('https://x', {})).rejects.toThrow(/no recorded response/);
  });

  it('a timeout cassette rejects only when aborted', async () => {
    const r = replay(loadCassette('errors/timeout.json'));
    const ac = new AbortController();
    const pending = r.fetch('https://x', { signal: ac.signal });
    ac.abort();
    await expect(pending).rejects.toThrow(/aborted/);
  });
});
