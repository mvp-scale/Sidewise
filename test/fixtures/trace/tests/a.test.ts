// Tiny synthetic fixture for scripts/trace.ts's own unit test (test/unit/trace.test.ts) — not a real test:
// it lives under test/fixtures/, which no vitest.config.ts project includes.
import { describe, expect, it } from 'vitest';

describe('fixture a', () => {
  it('[C-991] first rule holds', () => {
    expect(1 + 1).toBe(2);
  });
});
