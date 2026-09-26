// The answer format is a contract (AGENTS.md rule 5): any change here needs this golden updated on purpose.
import { describe, expect, it } from 'vitest';
import { formatAnswer, guidance, MAX_LINES, type AnswerInput } from '../../src/lens/answer.ts';
import { computeConsensus, type ConsensusResult } from '../../src/lens/consensus.ts';

const strongConcern = computeConsensus(
  Array.from({ length: 10 }, (_, i) => ({ pos: i + 1, reverse: (i + 1) % 3 === 0, p: i + 1 === 8 ? 0.2 : (i + 1) % 3 === 0 ? 0.1 : 0.9 })),
);

const input: AnswerInput = {
  id: 'SW-0042',
  verb: 'class',
  level: 1,
  adapter: 'typesafe',
  focus: 'This handler is safe to merge',
  result: strongConcern,
  primitives: [
    { kind: 'scale', text: 'How severe is the worst issue?', top: 'high', p: 0.81 },
    { kind: 'direction', text: 'Where should this go?', top: 'block', p: 0.97 },
  ],
  escalate: false,
  notes: ['2 and 4 open the same way; they may ask the same thing'],
  budget: 'budget 1% used ($0.03 of $5.00 · 4 of 500 runs)',
};

describe('formatAnswer (golden)', () => {
  it('renders the canonical answer', () => {
    expect(formatAnswer(input)).toBe(
      [
        'sidewise SW-0042 · class L1 · consensus STRONG · leans block (.97)',
        'concern 1 2 3 4 5 6 7 9 10 · clear 8 · reversed 3 6 9 ok',
        '~ How severe is the worst issue: high (.81)',
        'guidance: the evidence agrees there are concerns about "This handler is safe to merge"',
        'next: sidewise outcome SW-0042 held|overruled|failed --by <actor>',
        'notes: budget 1% used ($0.03 of $5.00 · 4 of 500 runs); 2 and 4 open the same way; they may ask the same thing',
      ].join('\n'),
    );
  });

  it('labels the fake provider as not evidence, and drops empty lines', () => {
    const text = formatAnswer({ ...input, adapter: 'fake', primitives: [], notes: [], budget: '' });
    expect(text.split('\n')[0]).toBe('sidewise SW-0042 · class L1 · consensus STRONG · adapter fake · not evidence');
    expect(text.split('\n')).toHaveLength(4);
  });

  it('never exceeds 6 lines or 600 bytes, even with 5 primitives and long notes', () => {
    const text = formatAnswer({
      ...input,
      primitives: [
        { kind: 'bool', text: 'Is it covered by a test?', p: 0.4 },
        { kind: 'scale', text: 'How severe is the worst issue?', top: 'high', p: 0.81 },
        { kind: 'scale', text: 'How much code is affected?', top: 'some', p: 0.6 },
        { kind: 'bool', text: 'Is there a rollback path?', p: 0.7 },
        { kind: 'direction', text: 'Where should this go?', top: 'block', p: 0.97 },
      ],
      notes: Array.from({ length: 20 }, (_, i) => `note number ${i} with some words`),
    });
    expect(text.split('\n').length).toBeLessThanOrEqual(MAX_LINES);
    expect(Buffer.byteLength(text)).toBeLessThanOrEqual(600);
  });
});

describe('guidance is evidence, never an order', () => {
  const variants: [string, ConsensusResult][] = [
    ['strong concern', strongConcern],
    ['strong clear', { ...strongConcern, verdict: 'clear' }],
    ['split', { ...strongConcern, consensus: 'SPLIT' }],
    ['weak', { ...strongConcern, consensus: 'WEAK' }],
  ];

  it.each(variants)('%s starts with "the …" and never with an imperative', (_, result) => {
    const g = guidance(result, 'focus', false);
    expect(g).toMatch(/^the /);
    expect(g).not.toMatch(/^(fix|ship|block|merge|deploy|delete|do|run|stop)\b/i);
  });

  it("SPLIT, WEAK and escalated answers say don't act on this alone", () => {
    expect(guidance({ ...strongConcern, consensus: 'SPLIT' }, 'f', false)).toMatch(/don't act on this alone$/);
    expect(guidance({ ...strongConcern, consensus: 'WEAK' }, 'f', false)).toMatch(/don't act on this alone$/);
    expect(guidance(strongConcern, 'f', true)).toMatch(/; don't act on this alone$/);
  });
});
