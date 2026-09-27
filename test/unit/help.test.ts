// sidewise help [verb|topic]: free, no project needed. The rule-sharing test below is the one that matters
// most: every fact RULES claims the validator enforces must appear verbatim in the help output it names, so
// the validator and help can never quietly drift apart (lessons-2026-09-27.md §3).
import { describe, expect, it } from 'vitest';
import { VERBS } from '../../src/contract/types.ts';
import { runHelp } from '../../src/help/index.ts';
import { RULES } from '../../src/help/rules.ts';
import { TOPICS } from '../../src/help/topics.ts';

describe('runHelp', () => {
  it('[C-113] with no target: the one-screen contract card', () => {
    const r = runHelp();
    expect(r.exit).toBe(0);
    expect(r.text).toContain('## Invoke it');
    expect(r.text).toContain('sidewise');
    expect(r.text).toContain('## Pick your verb');
    for (const verb of VERBS) expect(r.text).toContain(verb);
    expect(r.text).toContain('## Read the verdict');
  });

  it.each(VERBS)('[C-114] help %s: purpose, when, an example, and its own sharp rules', (verb) => {
    const r = runHelp(verb);
    expect(r.exit).toBe(0);
    expect(r.text).toContain(`## ${verb}`);
    expect(r.text).toContain('When:');
    expect(r.text).toContain('Example:');
    expect(r.text).toContain('Sharp rules:');
  });

  it('[C-115] help drill: says to follow next:, not hand-author parent/from', () => {
    expect(runHelp('drill').text).toContain('next:');
  });

  it('[C-115] help change: needs the files committed at the ref', () => {
    expect(runHelp('change').text.toLowerCase()).toContain('committed');
  });

  it('[C-115] help scan: a scale ranks findings, and scan by file', () => {
    const text = runHelp('scan').text;
    expect(text).toContain('scale');
    expect(text.toLowerCase()).toContain('scan by file');
  });

  it('[C-115] help loop: sibling blocks, name limits, every story is asked', () => {
    const text = runHelp('loop').text;
    expect(text.toLowerCase()).toContain('sibling');
    expect(text).toContain('20 characters');
    expect(text.toLowerCase()).toContain('every item at that layer');
  });

  it.each(TOPICS)('[C-116] help %s: a real topic page', (topic) => {
    const r = runHelp(topic);
    expect(r.exit).toBe(0);
    expect(r.text).toContain(`## ${topic}`);
  });

  it('[C-117] help wise: the full catalog, closed values and what you get back', () => {
    const text = runHelp('wise').text;
    for (const field of ['why', 'area', 'stage', 'change', 'risk']) expect(text).toContain(field);
    expect(text).toContain('what you get back');
  });

  it('[C-118] an unknown target: a clean stop naming every verb and topic', () => {
    const r = runHelp('nope');
    expect(r.exit).toBe(2);
    expect(r.text).toMatch(/^✖ help: "nope" is not a verb or topic → /);
    for (const verb of VERBS) expect(r.text).toContain(verb);
    for (const topic of TOPICS) expect(r.text).toContain(topic);
  });

  it('[C-161] help report: not a seventh verb, but its own recognized target', () => {
    const r = runHelp('report');
    expect(r.exit).toBe(0);
    expect(r.text).toContain('## report');
    expect(r.text).toContain('sidewise report');
    expect(r.text).toContain('hits');
    expect(r.text).toContain('patterns');
    expect(r.text).toContain('history');
    expect(r.text.toLowerCase()).toContain('no options beyond the view name');
  });

  it('a target with control characters: a clean stop', () => {
    expect(runHelp('a\u0000b').exit).toBe(2);
  });

  // [C-119] the shared rule list: every fact RULES says the validator enforces shows up verbatim in the help
  // output(s) it names — this is what keeps help and the validator from drifting apart.
  it('[C-119] every validator rule appears verbatim in the help output(s) it names', () => {
    for (const rule of RULES) {
      for (const tag of rule.in) {
        const text = tag === 'card' ? runHelp().text : runHelp(tag).text;
        expect(text, `"${rule.text}" missing from help ${tag}`).toContain(rule.text);
      }
    }
  });
});
