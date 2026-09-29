// The skill's body is the one source of truth; GEMINI.md and AGENTS.md's "Using Sidewise" section must carry
// the exact same text, so an edit to one and not the others fails here instead of silently drifting.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function skillBody(): string {
  const raw = readFileSync('skills/sidewise/SKILL.md', 'utf8');
  const end = raw.indexOf('\n---\n', 4); // front matter's closing fence (the first "---" opens it)
  if (end < 0) throw new Error('SKILL.md has no closing front-matter fence');
  return raw.slice(end + 5).trim();
}

describe('skill-docs stay in sync', () => {
  it('SKILL.md has the expected front matter', () => {
    const raw = readFileSync('skills/sidewise/SKILL.md', 'utf8');
    expect(raw).toMatch(/^---\nname: sidewise\ndescription: .+\n---\n/);
  });

  it('GEMINI.md carries the exact SKILL.md body', () => {
    const gemini = readFileSync('GEMINI.md', 'utf8');
    expect(gemini).toContain(skillBody());
  });

  it("AGENTS.md's 'Using Sidewise' section carries the exact SKILL.md body", () => {
    const agents = readFileSync('AGENTS.md', 'utf8');
    const at = agents.indexOf('## Using Sidewise');
    expect(at).toBeGreaterThan(0);
    expect(agents.slice(at)).toContain(skillBody());
  });

  it('the body points at the schema and the templates, not at lab/', () => {
    const body = skillBody();
    expect(body).toMatch(/references\/request\.schema\.json/);
    expect(body).toMatch(/templates\/\*\.yaml|templates\//);
    expect(body).not.toMatch(/lab\//);
  });

  it('[C-188] "Run this first" sends a cold agent to `sidewise agent` (no verb), then `agent <command>`', () => {
    const body = skillBody();
    expect(body).toMatch(/Run `sidewise agent` first/);
    expect(body).toContain('Then run `sidewise agent <command>` before writing a request');
  });
});

describe('the sidewise-probe skill', () => {
  const raw = readFileSync('skills/sidewise-probe/SKILL.md', 'utf8');

  it('has the expected front matter', () => {
    expect(raw).toMatch(/^---\nname: sidewise-probe\ndescription: .+\n---\n/);
  });

  it('never references lab/ (public repo)', () => {
    expect(raw).not.toMatch(/lab\//);
  });

  it('covers the concerns/decisions contract and the three-angle model', () => {
    expect(raw).toMatch(/concerns/);
    expect(raw).toMatch(/decisions/);
    expect(raw).toContain('reach');
    expect(raw).toContain('guard');
    expect(raw).toContain('sink');
  });
});
