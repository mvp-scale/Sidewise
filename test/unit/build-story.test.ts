// Unit tests for scripts/build-story.ts (the README's two story screens): each screen names its three verbs in grid order,
// is well-formed and script-free, loops on one shared SMIL timeline, carries a frozen finished frame for reduced motion,
// and the committed SVGs are the build's output; no ledger, no network, no browser.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildStory, LEDGER_T, SCREENS, STORY_T } from '../../scripts/build-story.ts';

/** A small well-formedness check: every tag closes in order, attributes are quoted, no stray `&` or `<`. */
function wellFormed(xml: string): string | null {
  const stack: string[] = [];
  const re = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<(\/?)([A-Za-z][\w:-]*)((?:\s+[\w:-]+="[^"]*")*)\s*(\/?)>|<|&(?!(?:amp|lt|gt|quot|apos);)/g;
  for (let m = re.exec(xml); m; m = re.exec(xml)) {
    if (m[0] === '<' || m[0].startsWith('&')) return `stray ${m[0]} at ${m.index}`;
    if (m[2] === undefined) continue;
    if (m[2] === 'style' && !m[1]) { const end = xml.indexOf('</style>', re.lastIndex); re.lastIndex = end; }
    if (m[1]) { if (stack.pop() !== m[2]) return `unbalanced </${m[2]}> at ${m.index}`; }
    else if (!m[4]) stack.push(m[2]);
  }
  return stack.length ? `unclosed <${stack.at(-1)}>` : null;
}

describe('build-story', () => {
  for (const [which, verbs] of [['mak', ['view', 'class', 'replay']], ['mdl', ['scan', 'drill', 'loop']]] as const) {
    const svg = buildStory(which);
    const still = /<g class="still">([\s\S]*?)<\/g>\n<g class="motion">/.exec(svg)![1]!;
    const motion = svg.slice(svg.indexOf('<g class="motion">'));

    it(`${which}: shows its row of the grid in Know, Judge, Prove order`, () => {
      const at = (s: string): number => still.indexOf(`>${s}<`);
      expect(verbs.map(at).every((i, k, a) => i > 0 && (k === 0 || i > a[k - 1]!))).toBe(true);
      expect(['KNOW', 'JUDGE', 'PROVE'].map(at).every((i) => i > 0)).toBe(true);
      for (const c of SCREENS[which].cards) expect(still).toContain(c.head);
    });

    it(`${which}: is well-formed, script-free and loops on one timeline`, () => {
      expect(wellFormed(svg)).toBeNull();
      expect(svg).not.toMatch(/<script|on\w+=/);
      const durs = new Set([...motion.matchAll(/dur="([\d.]+)s"/g)].map((m) => m[1]));
      expect([...durs]).toEqual([String(STORY_T)]);
    });

    it(`${which}: freezes the finished frame for reduced motion`, () => {
      expect(svg).toContain('@media (prefers-reduced-motion:reduce){.motion{display:none}.still{display:inline}}');
      expect(still).not.toMatch(/<animate/);
      for (const [top] of SCREENS[which].record) expect(still).toContain(top);
    });

    it(`${which}: matches the committed docs/assets/story-${which}.svg`, () => {
      expect(readFileSync(`docs/assets/story-${which}.svg`, 'utf8').trimEnd()).toBe(svg);
    });
  }

  describe('ledger', () => {
    const svg = buildStory('ledger');
    const still = /<g class="still">([\s\S]*?)<\/g>\n<g class="motion">/.exec(svg)![1]!;
    const motion = svg.slice(svg.indexOf('<g class="motion">'));
    it('goes from one JSONL file to 10, 20 and 50 runs, then the open mdl: block, the read-back and the payoff', () => {
      const at = (s: string): number => still.indexOf(s);
      const order = ['log.jsonl', 'A layered heat map', 'Reference architecture', 'A knowledge graph', 'The mdl: block is yours.', '+ your field', 'SQLite index', 'Where your agents are strong'].map(at);
      expect(order.every((i, k, a) => i > 0 && (k === 0 || i > a[k - 1]!))).toBe(true);
    });
    it('is well-formed, script-free, loops on one timeline and freezes its finished frame', () => {
      expect(wellFormed(svg)).toBeNull();
      expect(svg).not.toMatch(/<script|on\w+=/);
      expect([...new Set([...motion.matchAll(/dur="([\d.]+)s"/g)].map((m) => m[1]))]).toEqual([String(LEDGER_T)]);
      expect(still).not.toMatch(/<animate/);
      expect(still).toContain('50 runs');
    });
    it('matches the committed docs/assets/story-ledger.svg', () => {
      expect(readFileSync('docs/assets/story-ledger.svg', 'utf8').trimEnd()).toBe(svg);
    });
  });
});
