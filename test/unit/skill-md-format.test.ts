// Claude Code substitutes `$0`/`$ARGUMENTS`-style tokens in skill bodies (e.g. `$0.00` would render as
// something like `doctor.00`), so SKILL.md must never contain a literal `$<digit>` or `$ARGUMENTS` — dollar
// amounts are written some other way instead (e.g. "5.00 USD"). Both plugin skills are checked the same way.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const SKILL_MDS = ['skills/mm3/SKILL.md', 'skills/mm3-probe/SKILL.md'];

describe.each(SKILL_MDS)('%s has no Claude Code substitution tokens', (file) => {
  const text = readFileSync(file, 'utf8');

  it('contains no $<digit> (e.g. $0, $5)', () => {
    expect(text).not.toMatch(/\$\d/u);
  });

  it('contains no literal $ARGUMENTS', () => {
    expect(text).not.toContain('$ARGUMENTS');
  });
});
