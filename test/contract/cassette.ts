/**
 * Mock transactions: recorded /v1/systemone request/response pairs ("cassettes") replayed through an
 * injected fetch. A cassette with `timeout: true` never resolves until aborted, to exercise the client's
 * timeout path.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export interface Cassette {
  name: string;
  /** Fields the client must send; compared as a subset of the real request body. */
  expectRequest?: Record<string, unknown>;
  response?: { status: number; headers?: Record<string, string>; body: unknown };
  timeout?: boolean;
}

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'wire');

export function loadCassette(rel: string): Cassette {
  return JSON.parse(readFileSync(path.join(DIR, rel), 'utf8')) as Cassette;
}

export interface Replay {
  fetch: typeof fetch;
  /** Every request body the client sent, parsed. */
  sent: unknown[];
}

/** Replays cassettes in order, one per fetch call; throws if the client calls more times than recorded. */
export function replay(...cassettes: Cassette[]): Replay {
  const queue = [...cassettes];
  const sent: unknown[] = [];
  const fake = (async (_url: string | URL | Request, init?: RequestInit) => {
    sent.push(init?.body ? JSON.parse(String(init.body)) : undefined);
    const next = queue.shift();
    if (!next) throw new Error('cassette: no recorded response left for this request');
    if (next.timeout) {
      return new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
      });
    }
    const r = next.response!;
    const body = typeof r.body === 'string' ? r.body : JSON.stringify(r.body);
    return new Response(body, { status: r.status, headers: { 'content-type': 'application/json', ...r.headers } });
  }) as typeof fetch;
  return { fetch: fake, sent };
}
