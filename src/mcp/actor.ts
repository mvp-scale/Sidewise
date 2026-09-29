/**
 * The actor recorded for an MCP-driven run when SIDEWISE_ACTOR isn't already set: always `claude`. An MCP call
 * comes from Claude, through the plugin's tool — not from whoever's git identity happens to be configured in
 * the project directory. Reading `git config user.name` there (this module's old behavior) misattributed every
 * such run to that identity, which is usually the human owner, not the agent making the call: an MCP run got
 * recorded under the owner's own name, so the owner's own `sidewise outcome <id> held --by <their name>` was
 * refused by the self-held rule (ledger/log.ts's appendOutcome — an actor can't mark its own run held). cli.ts's
 * mcp wiring calls this once per tools/call, only when the env doesn't already carry SIDEWISE_ACTOR (an
 * explicit value always wins), and injects the result before dispatching. [C-143]
 */
export function resolveMcpActor(): string {
  return 'claude';
}
