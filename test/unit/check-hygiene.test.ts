import { describe, expect, it } from 'vitest';
import { findMissingHeaders, findUnusedExports, hasHeaderComment } from '../../scripts/check-hygiene.ts';

describe('hasHeaderComment', () => {
  it('accepts /** or // as the first non-blank line, and skips a shebang first', () => {
    expect(hasHeaderComment('/** why */\nimport x from "y";\n')).toBe(true);
    expect(hasHeaderComment('// why\nimport x from "y";\n')).toBe(true);
    expect(hasHeaderComment('#!/usr/bin/env node\n/** why */\n')).toBe(true);
    expect(hasHeaderComment('import x from "y";\n')).toBe(false);
  });
});

describe('findMissingHeaders / findUnusedExports', () => {
  it('flags test/fixtures/hygiene/no-header.ts and nothing else in the fixture set', () => {
    const files = ['test/fixtures/hygiene/good.ts', 'test/fixtures/hygiene/no-header.ts', 'test/fixtures/hygiene/unused-export.ts', 'test/fixtures/hygiene/barrel-index.ts'];
    expect(findMissingHeaders(files)).toEqual(['test/fixtures/hygiene/no-header.ts']);
  });

  it('flags an export nothing imports, but not one re-exported from the "public surface" file', () => {
    const files = ['test/fixtures/hygiene/good.ts', 'test/fixtures/hygiene/unused-export.ts', 'test/fixtures/hygiene/barrel-index.ts'];
    const unused = findUnusedExports(files, 'test/fixtures/hygiene/barrel-index.ts');
    expect(unused.map((e) => e.name)).toEqual(['neverImported']);
  });
});
