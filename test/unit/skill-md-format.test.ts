// Claude Code substitutes `$0`/`$ARGUMENTS`-style tokens in skill bodies (e.g. `$0.00` would render as
// something like `doctor.00`), so SKILL.md must never contain a literal `$<digit>` or `$ARGUMENTS` — dollar
// amounts are written some other way instead (e.g. "5.00 USD").
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const SKILL_MD = 'skills/sidewise/SKILL.md';

describe('SKILL.md has no Claude Code substitution tokens', () => {
  const text = readFileSync(SKILL_MD, 'utf8');

  it('contains no $<digit> (e.g. $0, $5)', () => {
    expect(text).not.toMatch(/\$\d/u);
  });

  it('contains no literal $ARGUMENTS', () => {
    expect(text).not.toContain('$ARGUMENTS');
  });
});
