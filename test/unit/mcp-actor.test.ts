// The actor recorded for an MCP-driven run when MM3_ACTOR isn't already set: always "claude", never a git
// identity — see src/mcp/actor.ts for why. cli.ts's mcp wiring calls this per tools/call, only when
// MM3_ACTOR isn't already set — an explicit value always wins over this default. [C-143]
import { describe, expect, it } from 'vitest';
import { resolveMcpActor } from '../../src/mcp/actor.ts';

describe('resolveMcpActor', () => {
  it('always returns "claude" — no git lookup, no other fallback', () => {
    expect(resolveMcpActor()).toBe('claude');
  });
});
