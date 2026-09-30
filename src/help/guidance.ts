/**
 * The one source of the three-beat guidance: where an agent is at each decision (Know, Judge, Prove), not just
 * at the start. A single string so every surface says the same thing and a drift test can pin them:
 * the MCP `initialize` instructions (mcp/protocol.ts), the top of skills/mm3/SKILL.md, and the opt-in block
 * `mm3 init --agents` writes into a project's AGENTS.md. Plain English, markdown-safe (a lead line, then "- "
 * bullets), no blank lines, so it can be pasted verbatim anywhere.
 */
export const BEAT_GUIDANCE: string = [
  'MM3 works in three beats; use it in every one.',
  '- Know: `view` first (free, reuses what is known), then `scan` to find where the goal touches the code.',
  '- Judge: `loop` the plan before code, `class` a specific decision, `drill` into anything unsure or failing (follow `next:`).',
  '- Prove: after the change is committed, `replay --parent <id> --compare <before>..HEAD` shows what flipped to pass and what regressed; `class` alone is not proof of a change.',
  '- Run `mm3 agent <verb>` before writing a request.',
].join('\n');
