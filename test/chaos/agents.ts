/**
 * Drives claude -p and gemini -p against one disposable scenario project each, with real (bounded) shell
 * access — the whole point is watching a real coding agent react to a faulted Sidewise. checkAgent skips an
 * unavailable or logged-out CLI instead of failing the run. runAgentOnScenario is synchronous (spawnSync with a
 * wall-clock timeout) so test/chaos/run.ts's plain `for` loop never runs two agents, or two scenarios for the
 * same agent, at once (AGENTS.md rule 1: stay light on shared machines).
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { redact } from '../../src/ledger/redact.ts';
import { clip } from '../../src/util/text.ts';
import type { ChaosScenario } from './scenarios.ts';

export type AgentKind = 'claude' | 'gemini';
export type Availability = { ok: true } | { ok: false; reason: string };

export interface AgentRunResult {
  agent: AgentKind;
  scenarioId: string;
  ok: boolean;
  exitCode: number | null;
  durationMs: number;
  costUsd: number | null;
  summary: string;
  /** The exact --model value passed for this run (CLAUDE_MODEL/GEMINI_MODEL below) — the evidence doc must be
   * able to say which model actually ran, not just which agent. */
  model: string;
}

// The one cap that actually works for both CLIs (see task-25-brief.md): a hard wall-clock kill.
const PER_RUN_TIMEOUT_MS = 90_000;
// gemini has no auth-status subcommand; this is the cheapest live call that answers "is it usable right now" —
// outside the 3-scenario budget, a real limitation of the tool, not a shortcut this harness invented.
const PROBE_TIMEOUT_MS = 20_000;
const CLAUDE_BUDGET_USD = '0.20';
const CLAUDE_MODEL = 'sonnet';
const GEMINI_MODEL = 'flash';
const MAX_BUFFER = 10 * 1024 * 1024;

// A path rooted at /home, /Users or the OS temp dir (where every scenario project and the repo itself live) —
// an agent's own final-text answer tends to echo back whatever absolute path the prompt gave it. Neither
// redact() (secrets, emails) nor the ledger's clip() touches paths, so this harness scrubs them itself before
// anything reaches a file this task commits.
const MACHINE_PATH = /\/(?:home|Users)\/[^\s'"]+|\/tmp\/[^\s'"]+/g;
const scrubPaths = (text: string): string => text.replace(MACHINE_PATH, '[path]');

/** One short, redacted excerpt of whatever a CLI wrote — never a raw path or key. */
function short(text: string): string {
  return clip(scrubPaths(redact(text)).split('\n')[0]!.trim(), 200);
}

/** The agent's own final answer, collapsed to a couple of lines and redacted, safe to commit to a fixture. */
function clipSummary(text: string): string {
  const lines = scrubPaths(redact(text.trim()))
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l !== '');
  return clip(lines.slice(0, 2).join(' '), 300);
}

export function checkAgent(kind: AgentKind): Availability {
  return kind === 'claude' ? checkClaude() : checkGemini();
}

function checkClaude(): Availability {
  const ver = spawnSync('claude', ['--version'], { encoding: 'utf8' });
  if (ver.error) return { ok: false, reason: 'claude CLI not found on PATH' };
  const status = spawnSync('claude', ['auth', 'status'], { encoding: 'utf8', timeout: PROBE_TIMEOUT_MS });
  if (status.error || status.status !== 0) return { ok: false, reason: 'claude CLI not logged in' };
  try {
    const parsed = JSON.parse(status.stdout) as { loggedIn?: unknown };
    if (parsed.loggedIn !== true) return { ok: false, reason: 'claude CLI not logged in' };
  } catch {
    return { ok: false, reason: 'claude CLI not logged in' };
  }
  return { ok: true };
}

function checkGemini(): Availability {
  const ver = spawnSync('gemini', ['--version'], { encoding: 'utf8' });
  if (ver.error) return { ok: false, reason: 'gemini CLI not found on PATH' };
  const scratch = mkdtempSync(path.join(os.tmpdir(), 'sidewise-chaos-probe-'));
  try {
    const probe = spawnSync('gemini', ['-p', 'reply with the word ok', '-o', 'json', '--skip-trust'], {
      cwd: scratch,
      timeout: PROBE_TIMEOUT_MS,
      killSignal: 'SIGKILL',
      encoding: 'utf8',
    });
    if (probe.error || probe.status !== 0) {
      return { ok: false, reason: `gemini CLI not available or not authenticated (${short(probe.stderr || String(probe.error ?? 'no output'))})` };
    }
    try {
      const parsed = JSON.parse(probe.stdout) as { response?: unknown };
      if (typeof parsed.response !== 'string') return { ok: false, reason: 'gemini CLI not available or not authenticated (no response field)' };
    } catch {
      return { ok: false, reason: 'gemini CLI not available or not authenticated (unparseable output)' };
    }
    return { ok: true };
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

interface Outcome {
  ok: boolean;
  exitCode: number | null;
  costUsd: number | null;
  summary: string;
}

/** The exact command the prompt tells the agent to use — the absolute path to the built CLI, never a bare
 * `sidewise` (nothing installs it on PATH in this harness). */
function commandFor(repoRoot: string): string {
  return `node ${path.join(repoRoot, 'dist/cli.js')} class request.yaml`;
}

function promptFor(scenario: ChaosScenario, repoRoot: string): string {
  return `You are in a directory that already has a Sidewise request file, request.yaml. Use exactly this command to run Sidewise: \`${commandFor(repoRoot)}\`\n\n${scenario.prompt}`;
}

function runClaude(prompt: string, projectRoot: string, env: NodeJS.ProcessEnv): Outcome {
  const r = spawnSync(
    'claude',
    [
      '-p', prompt,
      '--output-format', 'json',
      '--max-budget-usd', CLAUDE_BUDGET_USD,
      '--permission-mode', 'bypassPermissions',
      '--tools', 'Bash',
      '--add-dir', projectRoot,
      '--model', CLAUDE_MODEL,
    ],
    { cwd: projectRoot, env, timeout: PER_RUN_TIMEOUT_MS, killSignal: 'SIGKILL', encoding: 'utf8', maxBuffer: MAX_BUFFER },
  );
  if (r.error) return { ok: false, exitCode: r.status, costUsd: null, summary: `spawn error: ${short(String(r.error))}` };
  let parsed: { result?: unknown; is_error?: unknown; total_cost_usd?: unknown } | undefined;
  try {
    parsed = JSON.parse(r.stdout) as typeof parsed;
  } catch {
    parsed = undefined;
  }
  const costUsd = typeof parsed?.total_cost_usd === 'number' ? parsed.total_cost_usd : null;
  const text = typeof parsed?.result === 'string' ? parsed.result : r.stdout || r.stderr;
  const ok = r.status === 0 && parsed !== undefined && parsed.is_error !== true;
  return { ok, exitCode: r.status, costUsd, summary: clipSummary(text) };
}

function runGemini(prompt: string, projectRoot: string, env: NodeJS.ProcessEnv): Outcome {
  const r = spawnSync(
    'gemini',
    [
      '-p', prompt,
      '-o', 'json',
      '--skip-trust',
      '--approval-mode', 'yolo',
      '--include-directories', projectRoot,
      '--model', GEMINI_MODEL,
    ],
    { cwd: projectRoot, env, timeout: PER_RUN_TIMEOUT_MS, killSignal: 'SIGKILL', encoding: 'utf8', maxBuffer: MAX_BUFFER },
  );
  if (r.error) return { ok: false, exitCode: r.status, costUsd: null, summary: `spawn error: ${short(String(r.error))}` };
  let parsed: { response?: unknown; error?: unknown } | undefined;
  try {
    parsed = JSON.parse(r.stdout) as typeof parsed;
  } catch {
    parsed = undefined;
  }
  const text = typeof parsed?.response === 'string' ? parsed.response : r.stdout || r.stderr;
  // gemini's -o json carries no dollar figure (docs/cli/headless.md's JsonOutput has no cost field): recorded
  // as null and called out plainly in the generated doc, a real limitation rather than an oversight.
  const ok = r.status === 0 && parsed !== undefined && parsed.error === undefined && typeof parsed.response === 'string';
  return { ok, exitCode: r.status, costUsd: null, summary: clipSummary(text) };
}

/** One bounded, synchronous run of one agent against one scenario. Builds the prompt, sets the chaos env
 * (Sidewise itself never touches the network here), and returns a redacted, file-safe result. */
export function runAgentOnScenario(kind: AgentKind, scenario: ChaosScenario, projectRoot: string, repoRoot: string): AgentRunResult {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    SIDEWISE_HOME: projectRoot,
    SIDEWISE_PROVIDER: 'chaos',
    SIDEWISE_CHAOS: scenario.schedule,
    TYPESAFE_API_KEY: '',
    AI_GATEWAY_API_KEY: '',
  };
  const prompt = promptFor(scenario, repoRoot);
  const start = Date.now();
  const outcome = kind === 'claude' ? runClaude(prompt, projectRoot, env) : runGemini(prompt, projectRoot, env);
  const durationMs = Date.now() - start;
  const model = kind === 'claude' ? CLAUDE_MODEL : GEMINI_MODEL;
  return { agent: kind, scenarioId: scenario.id, durationMs, model, ...outcome };
}
