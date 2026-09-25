import { describe, expect, it } from 'vitest';
import { generateLog, toJsonl, type SynthOutcome, type SynthRun } from '../gen/synthetic-log.ts';

const isOutcome = (l: SynthRun | SynthOutcome): l is SynthOutcome => 'outcomeOf' in l;

describe('synthetic log generator', () => {
  it('is deterministic for a seed and differs across seeds', () => {
    expect(toJsonl(generateLog({ seed: 'a', runs: 50 }))).toBe(toJsonl(generateLog({ seed: 'a', runs: 50 })));
    expect(toJsonl(generateLog({ seed: 'a', runs: 50 }))).not.toBe(toJsonl(generateLog({ seed: 'b', runs: 50 })));
  });

  it('writes one run per id and outcomes only for runs that exist', () => {
    const lines = generateLog({ runs: 100 });
    const runs = lines.filter((l) => !isOutcome(l)) as SynthRun[];
    const ids = new Set(runs.map((r) => r.id));
    expect(runs).toHaveLength(100);
    expect(ids.size).toBe(100);
    for (const o of lines.filter(isOutcome)) expect(ids.has(o.outcomeOf)).toBe(true);
  });

  it('plants a weak slice with a visibly higher bad-outcome rate', () => {
    const lines = generateLog({ runs: 1000, weak: [{ area: 'auth', tag: 'secrets', badRate: 0.7 }] });
    const runs = new Map((lines.filter((l) => !isOutcome(l)) as SynthRun[]).map((r) => [r.id, r]));
    const rate = (match: (r: SynthRun) => boolean) => {
      const os = lines.filter(isOutcome).filter((o) => match(runs.get(o.outcomeOf)!));
      return os.filter((o) => o.outcome !== 'held').length / os.length;
    };
    const inSlice = (r: SynthRun) => r.where[0]!.area === 'auth' && r.tags[0] === 'secrets';
    expect(rate(inSlice)).toBeGreaterThan(0.5);
    expect(rate((r) => !inSlice(r))).toBeLessThan(0.3);
  });
});
