/**
 * Deterministic synthetic mm3.jsonl: N runs across areas/tags/perspectives, with outcome lines.
 * Feeds the hot-cache, weak-spot and budget tests. `weak` plants known problem slices (a higher
 * overruled/failed rate) so detection can be asserted, not eyeballed.
 * Shapes match the engine log entries (runs and outcome lines).
 */
import { pick, seededRandom } from './prng.ts';

export type Outcome = 'held' | 'overruled' | 'failed';
export type Consensus = 'STRONG' | 'SPLIT' | 'WEAK';

export interface SynthRun {
  id: string;
  ts: string;
  mode: string;
  level: 1 | 2 | 3;
  perspective: string;
  where: { path: string; area: string }[];
  problem: string;
  tags: string[];
  adapter: 'fake';
  model: 'fake-1';
  body: { consensus: Consensus; lean: string; costUsd: number; tokens: number };
}

export interface SynthOutcome {
  id: string;
  ts: string;
  outcomeOf: string;
  outcome: Outcome;
}

export interface WeakSlice {
  area: string;
  tag: string;
  /** Probability a run in this slice ends overruled or failed. */
  badRate: number;
}

export interface SynthOptions {
  seed?: string;
  runs?: number;
  /** Share of runs that get an outcome line. */
  outcomeRate?: number;
  /** Baseline probability of overruled/failed outside planted slices. */
  baseBadRate?: number;
  weak?: WeakSlice[];
  start?: string;
}

export const AREAS = ['api', 'auth', 'db', 'ui', 'build', 'infra', 'docs'] as const;
export const TAGS = ['sql', 'tokens', 'migration', 'cache', 'deps', 'tests', 'perf', 'secrets'] as const;
export const PERSPECTIVES = ['builder', 'reviewer', 'planner', 'owner'] as const;
export const MODES = ['class', 'scan', 'drill', 'loop', 'view', 'trace'] as const;

export function generateLog(opts: SynthOptions = {}): (SynthRun | SynthOutcome)[] {
  const rand = seededRandom(opts.seed ?? 'mm3');
  const n = opts.runs ?? 200;
  const outcomeRate = opts.outcomeRate ?? 0.6;
  const baseBad = opts.baseBadRate ?? 0.15;
  const weak = opts.weak ?? [];
  const t0 = Date.parse(opts.start ?? '2026-09-01T00:00:00Z');
  const lines: (SynthRun | SynthOutcome)[] = [];

  for (let i = 1; i <= n; i++) {
    const planted = weak.length && rand() < 0.3 ? pick(rand, weak) : undefined;
    const area = planted?.area ?? pick(rand, AREAS);
    const tag = planted?.tag ?? pick(rand, TAGS);
    const level = (1 + Math.floor(rand() * 3)) as 1 | 2 | 3;
    const id = `MM3-${String(i).padStart(4, '0')}`;
    const ts = new Date(t0 + i * 37 * 60_000).toISOString().replace(/\.\d{3}Z$/, 'Z');
    const r = rand();
    const consensus: Consensus = r < 0.6 ? 'STRONG' : r < 0.85 ? 'SPLIT' : 'WEAK';
    lines.push({
      id,
      ts,
      mode: pick(rand, MODES),
      level,
      perspective: pick(rand, PERSPECTIVES),
      where: [{ path: `src/${area}/file${Math.floor(rand() * 5)}.ts`, area }],
      problem: `synthetic ${area}/${tag} problem ${i}`,
      tags: [tag],
      adapter: 'fake',
      model: 'fake-1',
      body: { consensus, lean: pick(rand, ['ship', 'fix', 'block']), costUsd: 0.0004 * level * 10, tokens: 300 * level },
    });
    if (rand() < outcomeRate) {
      const bad = rand() < (planted?.badRate ?? baseBad);
      const outcome: Outcome = bad ? (rand() < 0.5 ? 'overruled' : 'failed') : 'held';
      const ots = new Date(Date.parse(ts) + 20 * 60_000).toISOString().replace(/\.\d{3}Z$/, 'Z');
      lines.push({ id: `${id}-outcome`, ts: ots, outcomeOf: id, outcome });
    }
  }
  return lines;
}

export const toJsonl = (lines: readonly unknown[]): string => lines.map((l) => JSON.stringify(l)).join('\n') + '\n';
