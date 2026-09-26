/** The request model every verb shares: header, envelope fields, numbered yes/no slots and up to 5 primitives. */
export { VERBS, type Verb } from '../contract/types.ts';
import type { Verb } from '../contract/types.ts';
export type Level = 1 | 2 | 3;

export interface Place {
  path: string;
  /** "10" or "10-24", 1-indexed, inclusive. */
  lines?: string;
  area?: string;
}

export interface Slot {
  pos: number;
  text: string;
  /** Reverse-keyed (`!`): "yes" is the good answer. */
  reverse: boolean;
}

export type PrimitiveKind = 'bool' | 'scale' | 'direction';

export interface Primitive {
  kind: PrimitiveKind;
  text: string;
  /** Scale levels (low to high) or direction options; empty for bool. */
  options: string[];
}

export interface Request {
  verb: Verb;
  level: Level;
  perspective: string;
  where: Place[];
  problem: string;
  tags: string[];
  focus: string;
  parent?: string;
  slots: Slot[];
  primitives: Primitive[];
}

export const SLOTS_PER_LEVEL: Record<Level, number> = { 1: 10, 2: 20, 3: 30 };
export const MAX_PRIMITIVES = 5;
