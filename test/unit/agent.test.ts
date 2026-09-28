// sidewise agent [verb]: free, no project needed — help's terse, agent-facing twin. [C-173]
import { describe, expect, it } from 'vitest';
import { VERBS } from '../../src/contract/types.ts';
import { runAgent } from '../../src/help/agent.ts';
import { PROBE_RULES, RULES } from '../../src/help/rules.ts';

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

  it('[C-183] agent view and agent loop now carry their own good/bad patterns too', () => {
    expect(runAgent('view').text).toContain('patterns:');
    expect(runAgent('loop').text).toContain('patterns:');
  });

  it('agent drill/change carry no patterns section (none tagged for them)', () => {
    for (const verb of ['drill', 'change'] as const) expect(runAgent(verb).text).not.toContain('patterns:');
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

  it('[C-181] agent with no target points explicitly at "sidewise agent probe", not just a verb', () => {
    expect(runAgent().text).toContain('sidewise agent probe');
  });

  it('[C-181] agent probe: the 8 probe rules, bare — no citations, no headings', () => {
    const text = runAgent('probe').text;
    expect(text).toContain('tool: probe');
    for (const r of PROBE_RULES) expect(text).toContain(r.text);
    expect(text).not.toContain('TypeSafe');
    expect(text).not.toMatch(/^##\s/mu);
  });

  it.each(['outcome', 'budget', 'report'] as const)('[C-182] agent %s: a recognized non-verb target, bare, with a good/bad pair', (target) => {
    const r = runAgent(target);
    expect(r.exit).toBe(0);
    expect(r.text).toContain(`tool: ${target}`);
    expect(r.text).toContain('patterns:');
    expect(r.text).not.toMatch(/^##\s/mu); // no help-style headings
  });

  it('[C-187] agent with no target lists the tools line, beyond the six verbs', () => {
    expect(runAgent().text).toContain('tools: report, outcome, budget, template');
  });

  it('[C-187] agent template: a recognized non-verb tool, bare, with a good/bad pair', () => {
    const r = runAgent('template');
    expect(r.exit).toBe(0);
    expect(r.text).toContain('tool: template');
    expect(r.text).toContain('patterns:');
    expect(r.text).not.toMatch(/^##\s/mu);
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

// Every card `agent` prints — the overview and each verb/tool — is built in one fixed shape: identifier
// line(s) first, then `rules:`, then `patterns:` (only when the target has any), then `run:` (only when it
// points further). [C-187]
describe('every agent card follows the same key order', () => {
  const NON_VERBS = ['probe', 'outcome', 'budget', 'report', 'template'] as const;

  /** 0 = an identifier line (verb:/verbs:/tool:/tools:), 1 = rules:, 2 = patterns:, 3 = run: — undefined for
   *  any other line (a rule/pattern bullet, or bad/good body text), which carries no ordering constraint. */
  function tier(line: string): number | undefined {
    if (/^verbs?: /.test(line) || /^tools?: /.test(line)) return 0;
    if (line === 'rules:') return 1;
    if (line === 'patterns:') return 2;
    if (line.startsWith('run:')) return 3;
    return undefined;
  }

  const cards: readonly [string, string][] = [
    ['overview', runAgent().text],
    ...VERBS.map((v): [string, string] => [`verb ${v}`, runAgent(v).text]),
    ...NON_VERBS.map((t): [string, string] => [`tool ${t}`, runAgent(t).text]),
  ];

  it.each(cards)('%s: identifier, rules, patterns, run — never out of order', (_label, text) => {
    const tiers = text
      .split('\n')
      .map(tier)
      .filter((t): t is number => t !== undefined);
    expect(tiers.length).toBeGreaterThan(0);
    for (let i = 1; i < tiers.length; i++) expect(tiers[i]!).toBeGreaterThanOrEqual(tiers[i - 1]!);
  });

  it('every non-verb card leads with "tool: <name>", matching verb cards\' "verb: <name>"', () => {
    for (const t of NON_VERBS) expect(runAgent(t).text.split('\n')[0]).toBe(`tool: ${t}`);
  });

  it('every verb card leads with "verb: <name>"', () => {
    for (const v of VERBS) expect(runAgent(v).text.split('\n')[0]).toBe(`verb: ${v}`);
  });
});
