// scripts/trace.ts on a tiny synthetic contract + test tree: claims parse with their line, tags are found
// wherever they appear (title or comment), an untraced claim is reported, an unknown tag doesn't crash.
// Ids 991-999 (never 001-003): this file is itself part of the real corpus scripts/trace.ts scans in CI
// (test/unit/**), so its own literal [C-###] strings must never collide with a real docs/contract.md claim.
import { describe, expect, it } from 'vitest';
import { findTags, parseClaims, renderTraceDoc, trace } from '../../scripts/trace.ts';

const MD = `# Fixture contract\n\n- first rule. [C-991]\n- second rule, two sentences. [C-992]\n- third, never tested. [C-993]\n`;

describe('parseClaims', () => {
  it('finds every [C-###] tag with its line and the text it followed', () => {
    expect(parseClaims(MD)).toEqual([
      { id: 'C-991', text: '- first rule. [C-991]', line: 3 },
      { id: 'C-992', text: '- second rule, two sentences. [C-992]', line: 4 },
      { id: 'C-993', text: '- third, never tested. [C-993]', line: 5 },
    ]);
  });
});

describe('findTags', () => {
  it('finds tags in an it() title and in a nearby comment, one entry per occurrence', () => {
    const tags = findTags('test/fixtures/trace/tests');
    expect(tags).toEqual(
      expect.arrayContaining([
        { id: 'C-991', file: 'test/fixtures/trace/tests/a.test.ts' },
        { id: 'C-992', file: 'test/fixtures/trace/tests/b.test.ts' },
      ]),
    );
    expect(tags.some((t) => t.id === 'C-993')).toBe(false);
  });
});

describe('trace', () => {
  it('reports an untraced claim and ignores an unknown tag rather than crashing', () => {
    const report = trace(MD, 'test/fixtures/trace/tests');
    expect(report.untraced.map((c) => c.id)).toEqual(['C-993']);
    expect(report.covered.has('C-991')).toBe(true);
    expect(report.unknownTags.some((t) => t.id === 'C-999')).toBe(true); // the fixture tree tags a nonexistent claim on purpose
  });

  it('renderTraceDoc lists every claim whole, grouped by section, with the test that proves it and a count', () => {
    const doc = renderTraceDoc(trace(MD, 'test/fixtures/trace/tests'));
    expect(doc).toContain('C-991');
    expect(doc).toContain('C-993');
    expect(doc).toMatch(/2 of 3 claims have a test/);
  });
});
