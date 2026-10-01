// The block `mm3 init --agents` writes (src/help/guidance.ts): short, points at the command cards, and names no
// sequence of steps. Keeping workflow out of it is deliberate: MM3's default surfaces describe the tool; a
// structured process (map, plan check, replay) is for the journeys, in its own skill, not for every user.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AGENT_POINTER } from '../../src/help/guidance.ts';

describe('AGENT_POINTER', () => {
  const lines = AGENT_POINTER.split('\n');

  it('is at most 6 short lines with no blank lines or trailing newline', () => {
    expect(lines.length).toBeLessThanOrEqual(6);
    expect(lines.every((l) => l.trim() !== '' && l.length <= 200)).toBe(true);
  });

  it('points at the cards and does not prescribe a workflow', () => {
    expect(AGENT_POINTER).toMatch(/mm3 agent`/u);
    expect(AGENT_POINTER).toMatch(/mm3 agent <verb>/u);
    expect(AGENT_POINTER).toMatch(/one `class` call is often enough/u);
    expect(AGENT_POINTER).not.toMatch(/beat|every one|before code|Know|Judge|Prove/iu);
  });
});

// The always-on surfaces must stay free of the beat workflow too: the MCP `initialize` reply carries no
// instructions field, and the shipped skill and the project guide open by describing MM3, not sequencing a job.
describe('default surfaces carry no workflow instructions', () => {
  for (const file of ['skills/mm3/SKILL.md', 'AGENTS.md']) {
    it(`${file} has no "every beat" workflow section`, () => {
      const text = readFileSync(file, 'utf8');
      expect(text).not.toMatch(/Use MM3 in every beat/u);
      expect(text).not.toMatch(/use it in every one/u);
    });
  }
});
