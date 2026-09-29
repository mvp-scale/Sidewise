// Unit tests for scripts/build-strip.ts (the README demo strip): numbers come from the scene footer, every beat is present, long lines wrap inside the viewport, the SVG is well-formed and script-free, the still is a complete frame, and the committed SVG is the build's output; no ledger, no network, no browser.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildStrip, STRIP_W, stripData, stripGeometry, stripScenes, wrapLine } from '../../scripts/build-strip.ts';

const { cls, reuse } = stripScenes();
const svg = buildStrip(cls, reuse);

/** A small well-formedness check: every tag closes in order, attributes are quoted, no stray `&` or `<`. */
function wellFormed(xml: string): string | null {
  const stack: string[] = [];
  const re = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<(\/?)([A-Za-z][\w:-]*)((?:\s+[\w:-]+="[^"]*")*)\s*(\/?)>|<|&(?!(?:amp|lt|gt|quot|apos);)/g;
  let last = 0;
  for (let m = re.exec(xml); m; m = re.exec(xml)) {
    if (m[0] === '<' || m[0].startsWith('&')) return `stray ${m[0]} at ${m.index}`;
    if (m[2] === undefined) { last = re.lastIndex; continue; }
    if (m[2] === 'style' && !m[1]) { const end = xml.indexOf('</style>', re.lastIndex); re.lastIndex = end; }
    if (m[1]) { if (stack.pop() !== m[2]) return `unbalanced </${m[2]}> at ${m.index}`; }
    else if (!m[4]) stack.push(m[2]);
    last = re.lastIndex;
  }
  void last;
  return stack.length ? `unclosed <${stack.at(-1)}>` : null;
}

describe('build-strip', () => {
  it('reads the terminal numbers from the scene footer, not from typed text', () => {
    const d = stripData(cls, reuse);
    expect(d.terminal[3]).toBe('21 questions · 1 call · 305 ms · ~$0.00004');
    const other = { ...cls, footer: { ...cls.footer, questions: 33, latencyMs: 412, calls: 2, costUsd: 0.00096 } };
    expect(stripData(other, reuse).terminal[3]).toBe('33 questions · 2 call · 412 ms · ~$0.0010');
    expect(d.terminal[4]).toBe('next: drill into architecture');
    expect(d.terminal.slice(0, 3)).toEqual(['~/n8n $ claude', '> where would I make n8n faster?', '$ mm3 class review.yaml']);
  });

  it('shows the real YAML and the committed reuse figures only', () => {
    const d = stripData(cls, reuse);
    expect(d.docs[0]!.join('\n')).toBe(cls.request);
    expect(d.docs[1]!.join('\n')).toBe(cls.response);
    const know = d.docs[2]!.join('\n');
    expect(know).toContain('.mm3/index.db');
    expect(know).toContain('"id":"MM3-0003"');
    expect(know).toContain(`reused ${reuse.footer.reused} of ${reuse.footer.reused}`);
    expect(know).toContain('$0.00000');
    expect(know).toContain(reuse.footer.pin);
  });

  it('has every beat: one caption and one band each, three or fewer per tab', () => {
    for (const c of ['One claim. Only your code. Fixed cost.', 'Yes/no questions. Cheap models nail them.', "When yes/no isn't enough.", 'A verdict you can cite. Odds, not vibes.', 'Finds exactly where it breaks.', 'Knows when to doubt itself. Tells you the next move.', 'Every answer kept. Ask again? Instant. Free.']) expect(svg).toContain(c.replaceAll('&', '&amp;'));
    const beats = stripData(cls, reuse).beats;
    expect(beats).toHaveLength(7);
    for (let i = 0; i < 7; i++) expect(svg).toContain(`class="band${i}"`);
    for (const t of [0, 1, 2]) expect(beats.filter((b) => b.tab === t).length).toBeLessThanOrEqual(3);
    for (const w of ['>request<', '>response<', '>knowledge<']) expect(svg).toContain(w);
  });

  it('wraps long lines with a hanging indent and never past the viewport width', () => {
    expect(wrapLine('short')).toEqual(['short']);
    const rows = wrapLine('        1: Are major architectural components (execution, queue, DB layer) clearly separated?');
    expect(rows.length).toBe(2);
    expect(rows[1]!.startsWith('          ')).toBe(true);
    expect(rows.map((r) => r.trim()).join(' ')).toBe('1: Are major architectural components (execution, queue, DB layer) clearly separated?');
    const d = stripData(cls, reuse);
    for (const doc of d.docs) for (const line of doc) for (const r of wrapLine(line)) expect(r.length).toBeLessThanOrEqual(66);
    expect(66 * 12.5 * 0.6).toBeLessThan(STRIP_W - 350 - 40); // 66 columns at the code font fit between the divider and the right edge
    expect(wrapLine('x'.repeat(30) + ',' + 'y'.repeat(60)).length).toBe(2); // no space: break after a comma
  });

  it('keeps every band whole inside the viewport at its own scroll offset', () => {
    const g = stripGeometry(cls, reuse);
    expect(g.bandRows).toHaveLength(7);
    g.bandRows.forEach(([a, z], i) => {
      expect(a).toBeGreaterThanOrEqual(g.offsets[i]!); // top row visible
      expect(z).toBeLessThan(g.offsets[i]! + g.viewRows); // bottom row visible
    });
    expect(g.height).toBeGreaterThanOrEqual(600);
    expect(g.height).toBeLessThanOrEqual(760);
    expect(Number(/<svg [^>]*height="(\d+)"/.exec(svg)![1])).toBe(g.height);
  });

  it('is well-formed XML with no script, external font or machine path', () => {
    expect(wellFormed(svg)).toBeNull();
    expect(svg).not.toMatch(/<script|@import|@font-face|https?:\/\/(?!www\.w3\.org)/);
    expect(svg).not.toMatch(/\/home\/|\/Users\/|[A-Z]:\\|\.superpowers|\/tmp\//);
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" width="900"')).toBe(true);
  });

  it('draws a complete still: motion only inside prefers-reduced-motion:no-preference, poster frame all lit', () => {
    const style = /<style>([\s\S]*?)<\/style>/.exec(svg)![1]!;
    const [still, motion] = style.split('@media (prefers-reduced-motion:no-preference){');
    expect(motion).toContain('@keyframes');
    expect(still).not.toContain('animation');
    expect(still).toContain('.cap4{opacity:1}');
    expect(still).toContain('.band4{opacity:1}');
    for (const k of [0, 1, 2, 3, 4]) expect(still).toContain(`.term${k}{opacity:1}`);
    expect(still).toContain('.code1{opacity:1');
    const plain = buildStrip(cls, reuse, { animate: false });
    expect(plain).not.toContain('@keyframes');
    expect(wellFormed(plain)).toBeNull();
  });

  it('matches the committed docs/assets/demo-strip-n8n.svg', () => {
    expect(readFileSync('docs/assets/demo-strip-n8n.svg', 'utf8').trimEnd()).toBe(svg);
  });
});
