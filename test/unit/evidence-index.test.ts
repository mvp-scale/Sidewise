// docs/evidence/README.md is generated from the other files in docs/evidence/; this proves it's not stale.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { listEvidenceDocs, renderEvidenceIndex } from '../../scripts/evidence-index.ts';

describe('docs/evidence/README.md is not stale', () => {
  it('matches a fresh run of scripts/evidence-index.ts over the real docs/evidence folder', () => {
    expect(readFileSync('docs/evidence/README.md', 'utf8')).toBe(renderEvidenceIndex(listEvidenceDocs()));
  });

  it('lists every evidence doc this plan actually produced', () => {
    const files = listEvidenceDocs().map((d) => d.file);
    expect(files).toEqual(expect.arrayContaining(['chaos-run.md', 'tokens.md', 'ledger-scale.md', 'trace.md']));
  });
});
