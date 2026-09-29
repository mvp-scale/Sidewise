/**
 * The one piece of this task that spawns real processes: checkAgent for both CLIs (skipping cleanly, never
 * failing the run, when one is missing or logged out), then up to SCENARIOS.length * 2 = 6 live agent calls,
 * strictly one at a time (AGENTS.md rule 1). Writes the redacted recorded results and regenerates the evidence
 * doc from them. Not a vitest project — run only by hand via `npm run test:chaos`, never from `npm test` or
 * `npm run test:cli`.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderChaosDoc, type ChaosResults } from '../../scripts/chaos-report.ts';
import { checkAgent, runAgentOnScenario, type AgentKind, type AgentRunResult } from './agents.ts';
import { SCENARIOS } from './scenarios.ts';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const RESULTS_FILE = path.join(REPO_ROOT, 'test/fixtures/chaos/recorded-results.json');
const DOC_FILE = path.join(REPO_ROOT, 'docs/evidence/chaos-run.md');
// Two agents, one at a time; SCENARIOS.length is the per-agent cap — together the hard total of the brief.
const AGENTS: readonly AgentKind[] = ['claude', 'gemini'];

function main(): void {
  const skipped: ChaosResults['skipped'] = [];
  const runs: AgentRunResult[] = [];

  for (const agent of AGENTS) {
    const availability = checkAgent(agent);
    if (!availability.ok) {
      console.log(`skip ${agent}: ${availability.reason}`);
      skipped.push({ agent, reason: availability.reason });
      continue;
    }
    for (const scenario of SCENARIOS) {
      const projectRoot = mkdtempSync(path.join(os.tmpdir(), `sidewise-chaos-${agent}-${scenario.id}-`));
      try {
        scenario.buildProject(projectRoot);
        console.log(`run ${agent} / ${scenario.id}...`);
        const result = runAgentOnScenario(agent, scenario, projectRoot, REPO_ROOT);
        console.log(`  ok=${result.ok} exit=${result.exitCode} ${(result.durationMs / 1000).toFixed(1)}s cost=${result.costUsd ?? 'n/a'}`);
        runs.push(result);
      } finally {
        rmSync(projectRoot, { recursive: true, force: true });
      }
    }
  }

  const results: ChaosResults = { generatedAt: new Date().toISOString(), skipped, runs };
  mkdirSync(path.dirname(RESULTS_FILE), { recursive: true });
  writeFileSync(RESULTS_FILE, `${JSON.stringify(results, null, 2)}\n`);
  mkdirSync(path.dirname(DOC_FILE), { recursive: true });
  writeFileSync(DOC_FILE, renderChaosDoc(results));

  const failed = runs.filter((r) => !r.ok).length;
  console.log(`\n${runs.length} run(s), ${failed} not ok, ${skipped.length} agent(s) skipped.`);
  console.log(`wrote ${path.relative(REPO_ROOT, RESULTS_FILE)} and ${path.relative(REPO_ROOT, DOC_FILE)}`);
}

main();
