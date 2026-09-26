/**
 * The ≤ 6-line answer: header (consensus, lean, fake label) · evidence (which slots, clipped to 120) · other
 * primitives (clipped to 120) · guidance (templated evidence, never an order) · next · notes (budget first, clipped
 * to 160). Its wording is a contract pinned by test/golden/answer.test.ts. Total bytes must stay ≤ 600.
 */
import type { ConsensusResult } from './consensus.ts';
import type { Level, Verb } from './request.ts';

export type PrimitiveAnswer =
  | { kind: 'bool'; text: string; p: number }
  | { kind: 'scale' | 'direction'; text: string; top: string; p: number };

export interface AnswerInput {
  id: string;
  verb: Verb;
  level: Level;
  adapter: string;
  focus: string;
  result: ConsensusResult;
  primitives: PrimitiveAnswer[];
  /** L3, or an irreversible-looking request: guidance always ends "don't act on this alone". */
  escalate: boolean;
  notes: string[];
  /** The budget line; shown first in the notes so it is never clipped. */
  budget: string;
}

export const MAX_LINES = 6;
const ALONE = "don't act on this alone";

export const fmtP = (p: number): string => (p >= 1 ? '1.00' : p.toFixed(2).replace(/^0/, ''));
const clip = (s: string, n: number): string => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const label = (text: string): string => clip(text.replace(/\?$/, ''), 40);
const list = (xs: readonly number[]): string => (xs.length ? xs.join(' ') : 'none');

export function guidance(result: ConsensusResult, focus: string, escalate: boolean): string {
  const f = `"${clip(focus, 80)}"`;
  const base =
    result.consensus === 'WEAK'
      ? `the answers sit near the middle on ${f}; ${ALONE}`
      : result.consensus === 'SPLIT'
        ? `the evidence is split on ${f}; ${ALONE}`
        : result.verdict === 'concern'
          ? `the evidence agrees there are concerns about ${f}`
          : `the evidence agrees nothing here stands against ${f}`;
  return escalate && !base.endsWith(ALONE) ? `${base}; ${ALONE}` : base;
}

function primitiveText(p: PrimitiveAnswer): string {
  if (p.kind === 'bool') return `+ ${label(p.text)}: ${fmtP(p.p)}`;
  return `${p.kind === 'scale' ? '~' : '?'} ${label(p.text)}: ${p.top} (${fmtP(p.p)})`;
}

export function formatAnswer(a: AnswerInput): string {
  const lean = a.primitives.find((p) => p.kind === 'direction');
  const head = [`sidewise ${a.id}`, `${a.verb} L${a.level}`, `consensus ${a.result.consensus}`];
  if (lean && lean.kind === 'direction') head.push(`leans ${lean.top} (${fmtP(lean.p)})`);
  if (a.adapter === 'fake') head.push('adapter fake · not evidence');

  const r = a.result;
  let evidence = `concern ${list(r.concernSlots)} · clear ${list(r.clearSlots)}`;
  if (r.reversed.length) evidence += ` · reversed ${r.reversed.join(' ')} ${r.reverseConsistent ? 'ok' : 'disagree'}`;

  const lines = [head.join(' · '), clip(evidence, 120)];
  const others = a.primitives.filter((p) => p !== lean).map(primitiveText);
  if (others.length) lines.push(clip(others.join(' · '), 120));
  lines.push(`guidance: ${guidance(r, a.focus, a.escalate)}`);
  lines.push(`next: sidewise outcome ${a.id} held|overruled|failed --by <actor>`);
  const tail = [a.budget, ...a.notes].filter(Boolean).join('; ');
  if (tail) lines.push(`notes: ${clip(tail, 160)}`);
  return lines.join('\n');
}
