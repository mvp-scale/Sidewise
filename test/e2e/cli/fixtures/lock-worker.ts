// For each of `rounds` projects under `root` (each seeded with an old, dead-pid lock), wait for a shared start
// time, then take the lock and write enter/exit lines to trace.log while holding it. Spawned by races.test.ts.
import { appendFileSync } from 'node:fs';
import { withLock } from '../../../../src/ledger/lock.ts';
import { pathsFor } from '../../../../src/ledger/paths.ts';

const [root = '', rounds = '0', startAt = '0'] = process.argv.slice(2);
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
const hold = (ms: number): void => {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
};

for (let k = 0; k < Number(rounds); k++) {
  const at = Number(startAt) + k * 400;
  await sleep(at - Date.now() - 2);
  while (Date.now() < at) {
    /* spin to the shared start */
  }
  const paths = pathsFor(`${root}/p${k}`);
  const trace = `${root}/p${k}/trace.log`;
  withLock(paths.lock, () => {
    appendFileSync(trace, `enter ${process.pid}\n`);
    hold(15);
    appendFileSync(trace, `exit ${process.pid}\n`);
  });
}
