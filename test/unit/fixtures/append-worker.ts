// Appends `count` runs to the ledger under `root`; spawned several times at once by ledger.test.ts.
import { appendRun } from '../../../src/ledger/log.ts';
import { pathsFor } from '../../../src/ledger/paths.ts';
import { sampleRun } from '../../helpers/runs.ts';

const [root = '', count = '0'] = process.argv.slice(2);
const paths = pathsFor(root);
for (let i = 0; i < Number(count); i++) appendRun(paths, sampleRun({ focus: `worker ${process.pid} run ${i}` }));
