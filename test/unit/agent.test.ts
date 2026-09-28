// sidewise agent [verb]: free, no project needed — help's terse, agent-facing twin. [C-173]
import { describe, expect, it } from 'vitest';
import { MAX_QUESTION_CHARS } from '../../src/contract/schema-check.ts';
import { VERBS } from '../../src/contract/types.ts';
import { AGENT_TOOLS, runAgent } from '../../src/help/agent.ts';
import { runHelp } from '../../src/help/index.ts';
import { PATTERNS } from '../../src/help/patterns.ts';
import { TOOL_LINE } from '../../src/help/report.ts';
import { PROBE_RULES, RULES, VERDICT_FACTS } from '../../src/help/rules.ts';
import { SHARP, VERB_LINE } from '../../src/help/verbs.ts';

describe('runAgent', () => {
  it('with no target: the verb list plus the universal rules, no prose', () => {
    const r = runAgent();
    expect(r.exit).toBe(0);
    expect(r.text).toContain('verbs (pick by goal):');
    for (const v of VERBS) expect(r.text).toContain(`- ${v}: `);
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

  // Round-4 finding: `agent drill`/`agent replay` used to render an empty `rules:` section with no `patterns:`
  // at all — the two highest-stakes verbs had no in-band teaching surface. Both now carry SHARP's own gotcha
  // prose in `rules:` (verbs.ts) and at least one good/bad pair each (patterns.ts).
  it('[C-192] agent drill/replay now carry SHARP rules and a patterns section', () => {
    for (const verb of ['drill', 'replay'] as const) {
      const text = runAgent(verb).text;
      expect(text).toContain('patterns:');
      for (const s of SHARP[verb]) expect(text).toContain(s);
      const owned = PATTERNS.filter((p) => p.in.includes(verb));
      expect(owned.length).toBeGreaterThan(0);
      for (const p of owned) expect(text).toContain(p.why);
    }
  });

  it('[C-192] every verb card carries its own SHARP bullets, not just drill/replay', () => {
    for (const verb of VERBS) {
      const text = runAgent(verb).text;
      for (const s of SHARP[verb]) expect(text, `"${s}" missing from agent ${verb}`).toContain(s);
    }
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

  // Round-4 finding: a cold agent hit `✖ question 1: is longer than 160 characters` with zero prior warning
  // in `agent view`/`agent probe` — the cap is now a shared RULES entry, tagged 'probe' too.
  it('[C-194] the 160-char question cap reaches agent probe and agent view (not just the validator)', () => {
    expect(runAgent('probe').text).toContain(String(MAX_QUESTION_CHARS));
    expect(runAgent('view').text).toContain(String(MAX_QUESTION_CHARS));
  });

  // Round-4 finding: an agent had to fail once (`✖ side.where: cannot read "..."`) to learn `where:` resolves
  // against the MCP `project` arg/`SIDEWISE_HOME`, not session cwd — stated only in agent's overview.
  it('[C-195] the overview states where: resolves against project/SIDEWISE_HOME, not session cwd', () => {
    const text = runAgent().text;
    expect(text).toContain('SIDEWISE_HOME');
    expect(text).toContain('project');
    expect(text.toLowerCase()).toContain('session cwd');
  });

  // [C-196] The overview's closing run: block now has a third line pointing at the new verdict topic.
  it('[C-196] the overview points at "sidewise agent verdict" for reading a response', () => {
    expect(runAgent().text).toContain('run: sidewise agent verdict');
  });

  // [C-196] A new bare topic card covering the response-side vocabulary, aligned with help verdict's prose via
  // the shared VERDICT_FACTS list (rules.ts).
  describe('[C-196] agent verdict', () => {
    it('identifier, bare, no headings, no citations', () => {
      const text = runAgent('verdict').text;
      expect(text).toContain('tool: verdict');
      expect(text).not.toMatch(/^##\s/mu);
      expect(text).not.toContain('TypeSafe');
    });

    it('carries every VERDICT_FACTS entry, verbatim', () => {
      const text = runAgent('verdict').text;
      for (const f of VERDICT_FACTS) expect(text).toContain(f);
    });

    it('covers consensus, escalate, stale, reused and fixed/still/regressed', () => {
      const text = runAgent('verdict').text;
      for (const term of ['STRONG', 'SPLIT', 'WEAK', 'escalate', 'stale', 'reused', 'fixed', 'still', 'regressed', 'unsure']) {
        expect(text, `missing "${term}"`).toContain(term);
      }
    });

    it('is listed among the recognized extras', () => {
      const r = runAgent('nope');
      expect(r.text).toContain('"verdict"');
    });
  });

  it.each(['outcome', 'budget', 'report'] as const)('[C-182] agent %s: a recognized non-verb target, bare, with a good/bad pair', (target) => {
    const r = runAgent(target);
    expect(r.exit).toBe(0);
    expect(r.text).toContain(`tool: ${target}`);
    expect(r.text).toContain('patterns:');
    expect(r.text).not.toMatch(/^##\s/mu); // no help-style headings
  });

  it('[C-187] agent with no target lists a tools section, beyond the six verbs', () => {
    const text = runAgent().text;
    expect(text).toContain('tools:');
    for (const t of AGENT_TOOLS) expect(text).toContain(`- ${t}: `);
  });

  describe('[C-189] overview purpose lines: one each, shared verbatim with help', () => {
    it('every verb has exactly one purpose line in the overview, matching VERB_LINE', () => {
      const lines = runAgent().text.split('\n');
      for (const v of VERBS) {
        const matches = lines.filter((l) => l.startsWith(`- ${v}: `));
        expect(matches, `expected exactly one purpose line for verb ${v}`).toEqual([`- ${v}: ${VERB_LINE[v]}`]);
      }
    });

    it('every tool has exactly one purpose line in the overview, matching TOOL_LINE', () => {
      const lines = runAgent().text.split('\n');
      for (const t of AGENT_TOOLS) {
        const matches = lines.filter((l) => l.startsWith(`- ${t}: `));
        expect(matches, `expected exactly one purpose line for tool ${t}`).toEqual([`- ${t}: ${TOOL_LINE[t]}`]);
      }
    });

    it('help\'s own card states the same purpose text as agent\'s overview, for every verb and tool', () => {
      const helpText = runHelp().text;
      for (const v of VERBS) expect(helpText, `help card missing agent's ${v} line`).toContain(`- ${v}: ${VERB_LINE[v]}`);
      for (const t of AGENT_TOOLS) expect(helpText, `help card missing agent's ${t} line`).toContain(`${TOOL_LINE[t]}`);
    });
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

// [C-190] The overview's own no-key hint: one extra `run:` line, only when no key is configured, using the
// same plugin-context detection doctor's `key:` line uses.
describe('runAgent: the overview\'s no-key hint', () => {
  it('with a key configured: no hint line at all', () => {
    const text = runAgent(undefined, { TYPESAFE_API_KEY: 'sk-real-key' }).text;
    expect(text).not.toContain('run: no key');
  });

  it('no key, outside the plugin: points at "sidewise init"', () => {
    const text = runAgent(undefined, {}).text;
    expect(text).toContain('run: no key → sidewise init to add one');
    expect(text).not.toContain('/plugin');
  });

  it('no key, inside the plugin (CLAUDE_PLUGIN_ROOT set): points at /plugin → Sidewise → Configure', () => {
    const text = runAgent(undefined, { CLAUDE_PLUGIN_ROOT: '/plugins/sidewise' }).text;
    expect(text).toContain('run: no key (sample answers only) → /plugin → Sidewise → Configure → press Enter on "TypeSafe API key", paste, Enter, Save configuration');
  });

  it('a verb card is never affected by env — no key info leaks into it', () => {
    const text = runAgent('class', {}).text;
    expect(text).not.toContain('run: no key');
  });

  it('a bad SIDEWISE_BASE_URL never crashes the overview — it just skips the hint', () => {
    expect(() => runAgent(undefined, { SIDEWISE_BASE_URL: 'not a url' })).not.toThrow();
  });
});

// Every card `agent` prints — the overview and each verb/tool — is built in one fixed shape: identifier
// line(s) first, then `rules:`, then `patterns:` (only when the target has any), then `run:` (only when it
// points further). [C-187]
describe('every agent card follows the same key order', () => {
  const NON_VERBS = ['probe', 'verdict', 'outcome', 'budget', 'report', 'template', 'config', 'doctor'] as const;

  /** 0 = an identifier line (verb:/verbs:/tool:/tools:, including the overview's "verbs (pick by goal):"
   *  header), 1 = rules:, 2 = patterns:, 3 = run: — undefined for any other line (a purpose/rule/pattern
   *  bullet, or bad/good body text), which carries no ordering constraint. */
  function tier(line: string): number | undefined {
    if (/^verbs?[: (]/.test(line) || /^tools?[: (]/.test(line)) return 0;
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
