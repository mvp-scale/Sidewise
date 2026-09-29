// Token counts are deterministic (fixed tokenizer, fixed text), so the doc can be checked for an EXACT match
// against a fresh run — unlike a timing bench, there's no run-to-run noise to tolerate here.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { countTokens, loadSamples, renderTokenDoc, runTokenBench } from '../../scripts/bench-tokens.ts';

describe('countTokens', () => {
  it('is deterministic, non-negative, and monotone: more text never counts as fewer tokens', () => {
    const a = countTokens('side:\n  goal: This login handler is safe to merge\n');
    expect(countTokens('side:\n  goal: This login handler is safe to merge\n')).toBe(a);
    expect(a).toBeGreaterThan(0);
    expect(countTokens('side:\n  goal: This login handler is safe to merge\n  depth: quick\n')).toBeGreaterThanOrEqual(a);
    expect(countTokens('')).toBe(0);
  });

  // Measured against the real cl100k_base encoder (not assumed): compact json costs fewer tokens than yaml here,
  // not more — the reverse of the naive chars/4 intuition. Why is an open question this bench can't verify (no
  // visibility into cl100k_base's training data); a guess is that compact json's tightly-packed `":`, `",`, `"}}`
  // sequences happen to match BPE merges cl100k_base already has, in a way yaml's per-line indentation and colons
  // don't. This is one of this bench's own headline findings (docs/evidence/tokens.md), confirmed the same way
  // across every fixture, not a one-off: a real BPE tokenizer, unlike chars/4, can show a counterintuitive result.
  it('is sensitive to structural punctuation, not just length: compact json packs its braces/quotes/colons into fewer merged tokens than yaml\'s per-line indentation does', () => {
    const yaml = 'side:\n  goal: Is it safe\n  where: [src/user.ts]\n';
    const json = JSON.stringify({ side: { goal: 'Is it safe', where: ['src/user.ts'] } });
    expect(countTokens(yaml)).toBeGreaterThan(countTokens(json));
  });
});

describe('loadSamples', () => {
  it('reads every valid/*.yaml fixture verbatim for the yaml row, and derives compact + pretty json from it', () => {
    const samples = loadSamples();
    const classYaml = samples.find((s) => s.verb === 'class' && s.format === 'yaml')!;
    expect(classYaml.text).toBe(readFileSync('test/fixtures/requests/valid/class.yaml', 'utf8'));
    const classJson = samples.find((s) => s.verb === 'class' && s.format === 'json')!;
    expect(JSON.parse(classJson.text)).toEqual(expect.objectContaining({ side: expect.objectContaining({ goal: 'This login handler is safe to merge' }) }));
    const classJsonPretty = samples.find((s) => s.verb === 'class' && s.format === 'jsonPretty')!;
    expect(JSON.parse(classJsonPretty.text)).toEqual(JSON.parse(classJson.text));
    expect(classJsonPretty.text).toContain('\n  ');
  });

  it('plan1 and prose exist only for class and view; every verb gets both json styles', () => {
    const samples = loadSamples();
    for (const verb of ['replay', 'scan', 'drill', 'loop']) {
      expect(samples.filter((s) => s.verb === verb).map((s) => s.format).sort()).toEqual(['json', 'jsonPretty', 'yaml']);
    }
    for (const verb of ['class', 'view']) {
      expect(samples.filter((s) => s.verb === verb).map((s) => s.format).sort()).toEqual(['json', 'jsonPretty', 'plan1', 'prose', 'yaml']);
    }
  });
});

describe('the generated doc matches a fresh run', () => {
  it('docs/evidence/tokens.md is exactly what runTokenBench + renderTokenDoc produce right now', () => {
    const fresh = renderTokenDoc(runTokenBench());
    expect(readFileSync('docs/evidence/tokens.md', 'utf8')).toBe(fresh);
  });
});
