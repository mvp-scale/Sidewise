/**
 * The short block `mm3 init --agents` writes into a project's AGENTS.md: what MM3 is and where the rules live,
 * and nothing about how to sequence a job. A single string so a drift test can pin it. It names no workflow on
 * purpose: one `class` call is often the whole job, and a structured process (map, plan check, replay) is for the
 * journeys we run and publish, not for every user. Plain English, markdown-safe (a lead line, then "- " bullets),
 * no blank lines, so it can be pasted verbatim anywhere.
 */
export const AGENT_POINTER: string = [
  'MM3 turns a short yes/no checklist into a pass/fail/unsure verdict: evidence, never a command.',
  '- Run `mm3 agent` first: it names every command and the rules in one card.',
  '- Run `mm3 agent <verb>` before writing a request. Use the verb that fits the ask; one `class` call is often enough.',
].join('\n');
