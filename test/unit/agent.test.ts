// sidewise agent [verb]: free, no project needed — help's terse, agent-facing twin. [C-173]
import { describe, expect, it } from 'vitest';
import { VERBS } from '../../src/contract/types.ts';
import { runAgent } from '../../src/help/agent.ts';
import { RULES } from '../../src/help/rules.ts';

describe('runAgent', () => {
  it('with no target: the verb list plus the universal rules, no prose', () => {
    const r = runAgent();
    expect(r.exit).toBe(0);
    expect(r.text).toContain('verbs: ' + VERBS.join(', '));
    expect(r.text).toContain('rules:');
    expect(r.text).not.toContain('##'); // no help-style headings
    expect(r.text).not.toContain('Sharp rules:'); // no help-style prose either
  });

  it.each(VERBS)('agent %s: the verb name, its own enforced rules, no prose', (verb) => {
    const r = runAgent(verb);
    expect(r.exit).toBe(0);
    expect(r.text).toContain(`verb: ${verb}`);
    expect(r.text).toContain('rules:');
    expect(r.text).not.toContain('When:');
    expect(r.text).not.toContain('Example:');
  });

  it('agent class and agent scan carry their own good/bad patterns, why-only', () => {
    expect(runAgent('class').text).toContain('patterns:');
    expect(runAgent('class').text).toContain('why:');
    expect(runAgent('scan').text).toContain('patterns:');
  });

  it('agent drill/loop/change/view carry no patterns section (none tagged for them)', () => {
    for (const verb of ['drill', 'loop', 'change', 'view'] as const) expect(runAgent(verb).text).not.toContain('patterns:');
  });

  it('an unknown target: a clean stop naming every verb', () => {
    const r = runAgent('nope');
    expect(r.exit).toBe(2);
    expect(r.text).toMatch(/^✖ agent: "nope" is not a verb → /);
    for (const verb of VERBS) expect(r.text).toContain(verb);
  });

  it('a target with control characters: a clean stop', () => {
    expect(runAgent('a\u0000b').exit).toBe(2);
  });

  // Same shared rule list `help` uses (rules.ts) — never a second, divergent copy for the terse view.
  it('every validator rule tagged for a verb/card also appears verbatim in the matching agent output', () => {
    for (const rule of RULES) {
      for (const tag of rule.in) {
        if (tag === 'card') {
          expect(runAgent().text).toContain(rule.text);
        } else if ((VERBS as readonly string[]).includes(tag)) {
          expect(runAgent(tag).text, `"${rule.text}" missing from agent ${tag}`).toContain(rule.text);
        }
      }
    }
  });
});
