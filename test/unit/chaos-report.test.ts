// docs/evidence/chaos-run.md is generated from test/fixtures/chaos/recorded-results.json by scripts/chaos-report.ts.
// This test never spawns claude or gemini — it only proves the committed doc matches the committed results.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { readResults, renderChaosDoc } from '../../scripts/chaos-report.ts';

describe('docs/evidence/chaos-run.md is not stale', () => {
  it('matches scripts/chaos-report.ts run over the recorded results', () => {
    const results = readResults('test/fixtures/chaos/recorded-results.json');
    expect(readFileSync('docs/evidence/chaos-run.md', 'utf8')).toBe(renderChaosDoc(results));
  });

  it('the recorded results carry no machine paths or secret-shaped strings', () => {
    const raw = readFileSync('test/fixtures/chaos/recorded-results.json', 'utf8');
    expect(raw).not.toMatch(/\/home\/[a-z]/);
    expect(raw).not.toMatch(/gh[pousr]_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9_-]{20,}/);
  });
});
