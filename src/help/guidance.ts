/**
 * The one source of the three-beat guidance: where an agent is at each decision (Know, Judge, Prove), not just
 * at the start. A single string so every surface says the same thing and a drift test can pin them:
 * the MCP `initialize` instructions (mcp/protocol.ts), the top of skills/mm3/SKILL.md, and the opt-in block
 * `mm3 init --agents` writes into a project's AGENTS.md. Plain English, markdown-safe (a lead line, then "- "
 * bullets), no blank lines, so it can be pasted verbatim anywhere.
 */
export const BEAT_GUIDANCE: string = [
  'MM3 works in three beats; use it in every one. The ledger is the record of what you learned and proved.',
  '- Know: map the codebase before the goal. `view` first (free), then `scan` or `class` its layers, tagging each request with its C4 chain (`mdl.uses`).',
  '- Know ends with `mm3 report graph`: the map, and where the goal touches it.',
  '- Judge: check the plan and a yes/no definition of done with MM3 before code: `loop` the plan, `class` the checks, `drill` anything unsure or failing (follow `next:`), fix, recheck.',
  '- Prove: after the change is committed, `replay --parent <id> --compare <before>..HEAD` shows what flipped to pass and what regressed; `class` alone is not proof of a change.',
  '- Cite the run ids behind each claim. Run `mm3 agent <verb>` before writing a request.',
].join('\n');
