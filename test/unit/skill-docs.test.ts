// The skill's body is the one source of truth; AGENTS.md's "Using MM3" section must carry the exact same text
// (Gemini CLI reads AGENTS.md too, via .gemini/settings.json), so an edit to one and not the other fails here.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function skillBody(): string {
  const raw = readFileSync('skills/mm3/SKILL.md', 'utf8');
  const end = raw.indexOf('\n---\n', 4); // front matter's closing fence (the first "---" opens it)
  if (end < 0) throw new Error('SKILL.md has no closing front-matter fence');
  return raw.slice(end + 5).trim();
}

describe('skill-docs stay in sync', () => {
  it('SKILL.md has the expected front matter', () => {
    const raw = readFileSync('skills/mm3/SKILL.md', 'utf8');
    expect(raw).toMatch(/^---\nname: mm3\ndescription: .+\n---\n/);
  });

  it('Gemini CLI reads AGENTS.md as its context file', () => {
    expect(JSON.parse(readFileSync('.gemini/settings.json', 'utf8')).context.fileName).toBe('AGENTS.md');
  });

  it("AGENTS.md's 'Using MM3' section carries the exact SKILL.md body", () => {
    const agents = readFileSync('AGENTS.md', 'utf8');
    const at = agents.indexOf('## Using MM3');
    expect(at).toBeGreaterThan(0);
    expect(agents.slice(at)).toContain(skillBody());
  });

  it('the body points at the schema and the templates, not at lab/', () => {
    const body = skillBody();
    expect(body).toMatch(/references\/request\.schema\.json/);
    expect(body).toMatch(/templates\/\*\.yaml|templates\//);
    expect(body).not.toMatch(/lab\//);
  });

  it('[C-188] "Run this first" sends a cold agent to `mm3 agent` (no verb), then `agent <command>`', () => {
    const body = skillBody();
    expect(body).toMatch(/Run `mm3 agent` first/);
    expect(body).toContain('Then run `mm3 agent <command>` before writing a request');
  });
});

describe('the mm3-probe skill', () => {
  const raw = readFileSync('skills/mm3-probe/SKILL.md', 'utf8');

  it('has the expected front matter', () => {
    expect(raw).toMatch(/^---\nname: mm3-probe\ndescription: .+\n---\n/);
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
