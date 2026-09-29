/** Run ids: a collision-proof ULID stored on every record, plus MM3-#### assigned in order under the ledger lock. */
import { randomBytes } from 'node:crypto';

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const RUN_ID = /^(?:MM3|SW)-(\d{4,})$/; // SW- is the retired prefix: still read, never minted

export function ulid(now: number = Date.now(), random: (n: number) => Uint8Array = (n) => randomBytes(n)): string {
  let t = now;
  let time = '';
  for (let i = 0; i < 10; i++) {
    time = CROCKFORD.charAt(t % 32) + time;
    t = Math.floor(t / 32);
  }
  const bytes = random(16);
  let rand = '';
  for (let i = 0; i < 16; i++) rand += CROCKFORD.charAt((bytes[i] ?? 0) % 32);
  return time + rand;
}

export function formatRunId(n: number): string {
  return `MM3-${String(n).padStart(4, '0')}`;
}
