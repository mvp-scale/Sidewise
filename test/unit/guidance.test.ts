// The one source of the three-beat guidance text (src/help/guidance.ts): short, names every verb an agent must
// reach for at each beat, and points at the per-verb cards. Other surfaces (MCP instructions, SKILL.md, the
// project AGENTS.md block) reuse this string, so their own tests compare against it.
import { describe, expect, it } from 'vitest';
import { BEAT_GUIDANCE } from '../../src/help/guidance.ts';

describe('BEAT_GUIDANCE', () => {
  const lines = BEAT_GUIDANCE.split('\n');

  it('is at most 12 short lines with no blank lines or trailing newline', () => {
    expect(lines.length).toBeLessThanOrEqual(12);
    expect(lines.every((l) => l.trim() !== '' && l.length <= 200)).toBe(true);
  });

  it('names the three beats and the verb to reach for in each', () => {
    expect(BEAT_GUIDANCE).toMatch(/three beats/u);
    expect(BEAT_GUIDANCE).toMatch(/Know:.*`view`.*`scan`/u);
    expect(BEAT_GUIDANCE).toMatch(/Judge:.*`loop`.*`class`.*`drill`/u);
    expect(BEAT_GUIDANCE).toMatch(/Prove:.*`replay --parent <id> --compare <before>\.\.HEAD`/u);
    expect(BEAT_GUIDANCE).toMatch(/`class` alone is not proof/u);
    expect(BEAT_GUIDANCE).toMatch(/mm3 agent <verb>/u);
  });
});
