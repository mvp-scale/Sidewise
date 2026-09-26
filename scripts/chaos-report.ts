/**
 * Turns one recorded chaos run into docs/evidence/chaos-run.md. Pure: no process spawning, no clock reads —
 * test/chaos/run.ts is the only piece of this task that touches a real agent CLI. renderChaosDoc must be a
 * deterministic function of its input; test/unit/chaos-report.test.ts checks the committed doc is byte-for-byte
 * what this file produces from the committed recorded-results fixture, so the doc can never go stale unnoticed.
 */
import { readFileSync } from 'node:fs';
import type { AgentKind, AgentRunResult } from '../test/chaos/agents.ts';

export interface ChaosResults {
  generatedAt: string;
  skipped: { agent: AgentKind; reason: string }[];
  runs: AgentRunResult[];
}

const isAgentKind = (v: unknown): v is AgentKind => v === 'claude' || v === 'gemini';

function bad(field: string): never {
  throw new Error(`recorded-results.json: bad or missing "${field}"`);
}

function asRun(v: unknown): AgentRunResult {
  if (!v || typeof v !== 'object') return bad('runs[]');
  const r = v as Record<string, unknown>;
  if (!isAgentKind(r.agent)) return bad('runs[].agent');
  if (typeof r.scenarioId !== 'string') return bad('runs[].scenarioId');
  if (typeof r.ok !== 'boolean') return bad('runs[].ok');
  if (typeof r.exitCode !== 'number' && r.exitCode !== null) return bad('runs[].exitCode');
  if (typeof r.durationMs !== 'number') return bad('runs[].durationMs');
  if (typeof r.costUsd !== 'number' && r.costUsd !== null) return bad('runs[].costUsd');
  if (typeof r.summary !== 'string') return bad('runs[].summary');
  if (typeof r.model !== 'string') return bad('runs[].model');
  return { agent: r.agent, scenarioId: r.scenarioId, ok: r.ok, exitCode: r.exitCode, durationMs: r.durationMs, costUsd: r.costUsd, summary: r.summary, model: r.model };
}

function asSkipped(v: unknown): { agent: AgentKind; reason: string } {
  if (!v || typeof v !== 'object') return bad('skipped[]');
  const s = v as Record<string, unknown>;
  if (!isAgentKind(s.agent)) return bad('skipped[].agent');
  if (typeof s.reason !== 'string') return bad('skipped[].reason');
  return { agent: s.agent, reason: s.reason };
}

/** Reads + validates the recorded-results JSON shape (never trusts the file blindly: it's hand-editable). */
export function readResults(file: string): ChaosResults {
  const raw = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
  if (typeof raw.generatedAt !== 'string') bad('generatedAt');
  if (!Array.isArray(raw.skipped)) bad('skipped');
  if (!Array.isArray(raw.runs)) bad('runs');
  return { generatedAt: raw.generatedAt as string, skipped: (raw.skipped as unknown[]).map(asSkipped), runs: (raw.runs as unknown[]).map(asRun) };
}

const fmtCost = (v: number | null): string => (v === null ? 'n/a' : `$${v.toFixed(4)}`);
const fmtDuration = (ms: number): string => `${(ms / 1000).toFixed(1)}s`;
const cell = (s: string): string => s.replace(/\|/g, '\\|').replace(/\n/g, ' ');

const CAPS = [
  'Sidewise itself stays offline for this run (`SIDEWISE_PROVIDER=chaos`, no TypeSafe key) — only the agent',
  'CLIs call out, on their own login. Caps: 3 scenarios shared across both agents (not 3 each), one agent at a',
  'time, a 90s wall-clock `SIGKILL` timeout per run. `claude -p` is capped at $0.20/run via `--max-budget-usd`,',
  'the one cap that is both real and enforced. `gemini -p` has no cost or turn cap flag at all — its wall-clock',
  'timeout is the *only* cap, stated here plainly rather than pretending otherwise.',
].join(' ');

const SCOPE = [
  'What this run does not prove: it is 3 scenarios, run once each, against these specific models only — a',
  "different model, prompt, or a second run of the same scenario could behave differently. gemini's cost is",
  "unknown by construction (its JSON output carries no dollar figure), not merely unmeasured this time.",
].join(' ');

/** Which --model value actually ran for each agent, read off the runs themselves (never assumed) — empty when
 * every agent was skipped, so nothing ran with any model. */
function modelsLine(runs: readonly AgentRunResult[]): string {
  const seen = new Map<AgentKind, string>();
  for (const r of runs) if (!seen.has(r.agent)) seen.set(r.agent, r.model);
  if (seen.size === 0) return 'Models: no agent ran, so no model was used.';
  return `Models: ${[...seen.entries()].map(([agent, model]) => `${agent} ran with \`--model ${model}\``).join('; ')}.`;
}

export function renderChaosDoc(results: ChaosResults): string {
  const lines: string[] = [];
  lines.push('# Agent chaos run');
  lines.push('');
  lines.push(`Generated ${results.generatedAt} by \`scripts/chaos-report.ts\` from \`test/fixtures/chaos/recorded-results.json\`.`);
  lines.push('');
  lines.push(CAPS);
  lines.push('');
  lines.push(modelsLine(results.runs));
  lines.push('');
  lines.push(SCOPE);
  lines.push('');
  if (results.skipped.length > 0) {
    lines.push('## Skipped');
    lines.push('');
    for (const s of results.skipped) lines.push(`- **${s.agent}**: ${s.reason}`);
    lines.push('');
  }
  lines.push('## Runs');
  lines.push('');
  if (results.runs.length === 0) {
    lines.push('No agent ran a scenario (every agent was skipped).');
  } else {
    lines.push('| agent | model | scenario | ok | exit | duration | cost | summary |');
    lines.push('|---|---|---|---|---|---|---|---|');
    for (const r of results.runs) {
      lines.push(
        `| ${r.agent} | ${r.model} | ${r.scenarioId} | ${r.ok ? 'yes' : 'no'} | ${r.exitCode ?? 'n/a'} | ${fmtDuration(r.durationMs)} | ${fmtCost(r.costUsd)} | ${cell(r.summary)} |`,
      );
    }
  }
  lines.push('');
  return `${lines.join('\n')}\n`;
}
