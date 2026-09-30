import { defineConfig } from 'vitest/config';

// Test tiers. `npm test` runs unit + contract + golden: no network, no build. cli spawns dist/cli.js;
// install and live run only from test/docker/test.sh or by hand.
const project = (name: string, include: string[]) => ({ test: { name, environment: 'node' as const, include } });

export default defineConfig({
  test: {
    maxWorkers: 4, // shared machine
    passWithNoTests: true,
    projects: [
      project('unit', ['test/unit/**/*.test.ts', 'src/**/*.test.ts']),
      project('contract', ['test/contract/**/*.test.ts']),
      project('golden', ['test/golden/**/*.test.ts']),
      project('cli', ['test/e2e/cli/**/*.test.ts']),
      project('install', ['test/e2e/install/**/*.test.ts']),
      project('live', ['test/live/**/*.test.ts']),
    ],
  },
});
