// Tiny synthetic fixture for scripts/trace.ts's own unit test (test/unit/trace.test.ts) — not a real test:
// it lives under test/fixtures/, which no vitest.config.ts project includes.
import { describe, expect, it } from 'vitest';

describe('fixture b', () => {
  it('covers the second rule from a comment, not the title', () => {
    // [C-992]
    expect(2 + 2).toBe(4);
    // [C-999] an id that doesn't exist in the fixture contract, to exercise unknownTags
  });
});
