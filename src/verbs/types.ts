/** What every verb receives and returns. Exit: 0 ok · 1 provider or ledger error · 2 invalid request · 3 budget blocked. */
import type { ClassifierPort } from '../classifier/port.ts';
import type { RunRecord } from '../ledger/log.ts';
import type { SidewisePaths } from '../ledger/paths.ts';

export interface VerbContext {
  paths: SidewisePaths;
  provider: ClassifierPort;
  env: Record<string, string | undefined>;
  now?: () => number;
}

export interface VerbResult {
  exit: 0 | 1 | 2 | 3;
  text: string;
  run?: RunRecord;
}
