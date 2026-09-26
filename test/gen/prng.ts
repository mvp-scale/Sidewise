/** Seeded PRNG for mock data: the engine's own generator, so the tests and the fake provider share one stream. */
export { fnv1a, seededRandom } from '../../src/util/prng.ts';

export const pick = <T>(rand: () => number, items: readonly T[]): T => items[Math.floor(rand() * items.length)]!;
