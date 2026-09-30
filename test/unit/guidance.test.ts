// The one source of the three-beat guidance text (src/help/guidance.ts): short, names every verb an agent must
// reach for at each beat, and points at the per-verb cards. Other surfaces (MCP instructions, SKILL.md, the
// project AGENTS.md block) reuse this string, so their own tests compare against it.
import { readFileSync } from 'node:fs';
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

  // The WordPress journey (run 3 vs runs 1-2): agents mapped the codebase and judged the plan only when told
  // to; the guidance now says it. Know maps first, tagging C4 chains, and ends with the map; Judge checks the
  // plan and its definition of done with MM3 and rechecks before code; every claim cites its run ids.
  it('says to map the codebase before the goal, judge the definition of done, and cite run ids', () => {
    expect(BEAT_GUIDANCE).toMatch(/Know:.*before the goal/u);
    expect(BEAT_GUIDANCE).toMatch(/`mdl\.uses`/u);
    expect(BEAT_GUIDANCE).toMatch(/`mm3 report graph`/u);
    expect(BEAT_GUIDANCE).toMatch(/Judge:.*definition of done.*recheck/u);
    expect(BEAT_GUIDANCE).toMatch(/[Cc]ite the run ids/u);
  });
});

// SKILL.md drift guard: BEAT_GUIDANCE is written to be markdown-safe (a lead line plus "- " bullets, no
// formatting that a renderer would rewrite), so the whole string must appear in SKILL.md byte for byte — no
// line-by-line fuzzing needed — and as the first section of the body, where an agent reads it before anything else.
describe('skills/mm3/SKILL.md carries BEAT_GUIDANCE', () => {
  const body = readFileSync('skills/mm3/SKILL.md', 'utf8').replace(/^---\n[\s\S]*?\n---\n/u, '');

  it('contains BEAT_GUIDANCE verbatim', () => {
    expect(body).toContain(BEAT_GUIDANCE);
  });

  it('puts it in the first section of the body, before any other heading', () => {
    const firstHeading = body.search(/^## /mu);
    expect(body.indexOf(BEAT_GUIDANCE)).toBeGreaterThan(firstHeading);
    const secondHeading = body.slice(firstHeading + 3).search(/^## /mu) + firstHeading + 3;
    expect(body.indexOf(BEAT_GUIDANCE)).toBeLessThan(secondHeading);
    expect(body.slice(0, firstHeading).trim()).toBe('');
  });
});
