/**
 * The three chaos scenarios the agent harness runs, shared across both agent CLIs (not three each — see
 * test/chaos/run.ts). Each seeds the same src/user.ts fixture plus the contract's own `class` example, and asks
 * a real coding agent to run the built CLI against it under a SIDEWISE_CHAOS schedule and report back honestly.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { USER_TS } from '../helpers/project.ts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLASS_REQUEST = readFileSync(path.join(HERE, '../fixtures/requests/valid/class.yaml'), 'utf8');

export interface ChaosScenario {
  id: string;
  description: string;
  schedule: string;
  buildProject: (root: string) => void;
  prompt: string;
}

/** src/user.ts (the shared fixture) plus request.yaml (the contract's own class example), into an existing root. */
function seedProject(root: string): void {
  mkdirSync(path.join(root, 'src'), { recursive: true });
  writeFileSync(path.join(root, 'src/user.ts'), USER_TS);
  writeFileSync(path.join(root, 'request.yaml'), CLASS_REQUEST);
}

export const SCENARIOS: readonly ChaosScenario[] = [
  {
    id: 'clean',
    description: 'a normal run: SIDEWISE_CHAOS is empty, so every call falls through to the fake\'s answers',
    schedule: '',
    buildProject: seedProject,
    prompt: 'Run it once. In one sentence, say what the `gate` came back as and what the `next:` line tells you to do.',
  },
  {
    id: 'retry-after-503',
    description: 'the first call fails with a retryable 503; the retry (same command, run again) succeeds',
    schedule: '503,ok',
    buildProject: seedProject,
    prompt:
      "Run it once. If it stops with a `✖` line that tells you to retry, run the exact same command again, exactly once more. " +
      'Report both exit codes and whether the second attempt succeeded. Do not run it a third time.',
  },
  {
    id: 'malformed-answer',
    description: 'the provider answers with an out-of-range probability; the CLI must reject it, not guess',
    schedule: 'malformed',
    buildProject: seedProject,
    prompt: 'Run it once. Report the exit code and the exact `✖` line, verbatim. Do not guess at a `gate` value — the tool never printed one.',
  },
];
