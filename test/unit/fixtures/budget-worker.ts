// First use of a budget, raced: for each of `rounds` fresh projects under `root`, wait for a shared start time,
// then load the budget (creating it) and count one run. Spawned several times at once by budget.test.ts.
import { loadBudget, recordSpend } from '../../../src/budget/budget.ts';
import { pathsFor } from '../../../src/ledger/paths.ts';

const [root = '', rounds = '0', startAt = '0'] = process.argv.slice(2);
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));

for (let k = 0; k < Number(rounds); k++) {
  const at = Number(startAt) + k * 40;
  await sleep(at - Date.now() - 2);
  while (Date.now() < at) {
    /* spin to the shared start */
  }
  const paths = pathsFor(`${root}/p${k}`);
  loadBudget(paths);
  recordSpend(paths, 0);
}
