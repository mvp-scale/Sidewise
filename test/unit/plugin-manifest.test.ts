import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Claude Code treats a plugin.json `version` as a pin: an update is skipped until that string changes, and the
// /plugin screen can't tell one nightly from the next. Left out, Claude uses the source commit (12 chars), so
// every build is visible and a marketplace update installs it. Auto-update stays the user's own toggle.
describe('plugin manifest', () => {
  it('pins no version, so the installed build is its commit', () => {
    for (const f of ['.claude-plugin/plugin.json', '.claude-plugin/marketplace.json']) {
      const text = readFileSync(f, 'utf8');
      expect(text, f).not.toMatch(/"version"\s*:/);
    }
  });
});
