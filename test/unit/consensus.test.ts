import { describe, expect, it } from 'vitest';
import { computeConsensus, type SlotAnswer } from '../../src/lens/consensus.ts';

/** 10 slots, 3/6/9 reversed. `fwd` = p(yes) for forward slots, `rev` = p(yes) for reversed slots. */
const tenSlots = (fwd: number, rev: number, override: Record<number, number> = {}): SlotAnswer[] =>
  Array.from({ length: 10 }, (_, i) => {
    const pos = i + 1;
    const reverse = pos % 3 === 0;
    return { pos, reverse, p: override[pos] ?? (reverse ? rev : fwd) };
  });

describe('computeConsensus', () => {
  it('STRONG concern when forward slots say yes and reversed slots say no [C-033]', () => {
    const r = computeConsensus(tenSlots(0.9, 0.1));
    expect(r).toMatchObject({ consensus: 'STRONG', verdict: 'concern', reverseConsistent: true });
    expect(r.agreement).toBe(1);
    expect(r.decisiveness).toBeCloseTo(0.8, 10);
    expect(r.reversed).toEqual([3, 6, 9]);
  });

  it('STRONG clear when forward slots say no and reversed slots say yes', () => {
    expect(computeConsensus(tenSlots(0.1, 0.9))).toMatchObject({ consensus: 'STRONG', verdict: 'clear' });
  });

  it('SPLIT when half the slots point each way', () => {
    const r = computeConsensus(tenSlots(0.9, 0.1, { 1: 0.1, 2: 0.1, 4: 0.1, 5: 0.1, 3: 0.9 }));
    expect(r.consensus).toBe('SPLIT');
    expect(r.agreement).toBe(0.5);
  });

  it('SPLIT when agreement is high but reversed slots contradict the forward ones', () => {
    const slots: SlotAnswer[] = [
      ...Array.from({ length: 8 }, (_, i) => ({ pos: i + 1, reverse: false, p: 0.9 })),
      { pos: 9, reverse: true, p: 0.9 },
      { pos: 10, reverse: true, p: 0.9 },
    ];
    const r = computeConsensus(slots);
    expect(r.agreement).toBeCloseTo(0.8, 10);
    expect(r.reverseConsistent).toBe(false);
    expect(r.consensus).toBe('SPLIT');
  });

  it('WEAK when answers sit near the middle', () => {
    expect(computeConsensus(tenSlots(0.55, 0.45)).consensus).toBe('WEAK');
  });

  it('a tie is read as concern (the conservative mak)', () => {
    const r = computeConsensus([{ pos: 1, reverse: false, p: 0.9 }, { pos: 2, reverse: false, p: 0.1 }]);
    expect(r.verdict).toBe('concern');
  });

  it('refuses zero slots', () => {
    expect(() => computeConsensus([])).toThrow(RangeError);
  });
});
