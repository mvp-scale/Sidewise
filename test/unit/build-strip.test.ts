// Unit tests for scripts/build-strip.ts (the README demo strip): numbers come from the scene footer, the request opens folded and each beat unfolds one group, every beat is present, long lines wrap inside the viewport, the SVG is well-formed and script-free, the still is a complete frame, and the committed SVG is the build's output; no ledger, no network, no browser.
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildStrip, extractStrip, STRIP_W, stripData, stripGeometry, stripScenes, wrapLine } from '../../scripts/build-strip.ts';

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
    expect(cls.id).toBe('MM3-0007');
    expect(cls.footer).toMatchObject({ questions: 12, latencyMs: 345, calls: 1 });
    expect(d.terminal[4]).toBe('12 questions · 1 call · 345 ms · ~$0.00005');
    const other = { ...cls, footer: { ...cls.footer, questions: 33, latencyMs: 412, calls: 2, costUsd: 0.00096 } };
    expect(stripData(other, reuse).terminal[4]).toBe('33 questions · 2 call · 412 ms · ~$0.0010');
    expect(d.terminal[5]).toBe('next: drill into correctness');
    expect(d.terminal.slice(0, 4)).toEqual(['~/n8n $ claude', '> where would I make n8n faster?', '$ mm3 class review.yaml', 'sending request …']);
  });

  it('shows the real response, the real request under its fold markers, and the committed reuse figures only', () => {
    const d = stripData(cls, reuse);
    expect(d.docs[4]!.join('\n')).toBe(cls.response);
    // unfolding a group gives its verbatim request lines back: the fold summaries are display marks, no YAML key of their own
    const src = cls.request.split('\n');
    const iCon = src.findIndex((l) => /^ {4}concerns:/.test(l)), iDec = src.findIndex((l) => /^ {4}decisions:/.test(l));
    expect(d.docs[1]!.join('\n')).toContain(src.slice(0, iDec).join('\n'));
    expect(d.docs[2]!.join('\n')).toContain(src.slice(iDec).join('\n'));
    expect(d.docs[0]!.slice(0, iCon)).toEqual(src.slice(0, iCon));
    const know = d.docs[5]!.join('\n');
    expect(know).toContain('.mm3/index.db');
    expect(know).toContain('"id":"MM3-0007"');
    expect(know).toContain('"latencyMs":345');
    expect(know).toContain(`a different run (${reuse.id}`);
    expect(know).toContain(`reused ${reuse.footer.reused} of ${reuse.footer.reused}`);
    expect(know).toContain('$0.00000');
    expect(know).toContain(reuse.footer.pin);
  });

  it('opens the request folded: claim lines whole, concerns / decisions / mdl on one line each, marked as display', () => {
    const open = stripData(cls, reuse).docs[0]!;
    expect(open.join('\n')).toContain('goal: ' + cls.title);
    expect(open).toContain('  depth: quick');
    expect(open.some((l) => l.startsWith('  where: [packages/'))).toBe(true);
    expect(open).toContain('    concerns: ▸ 3 concerns · 9 questions');
    expect(open).toContain('    decisions: ▸ 2 decisions · 2 questions');
    expect(open.at(-1)).toMatch(/^mdl: ▸/);
    expect(open.join('\n')).not.toMatch(/performance:|priority:|\b1: Does/); // nothing of the folded groups leaks in
    expect(svg).toContain('collapsed to fit on screen');
    expect(svg).toContain('class="ton0"'); // the note belongs to the request tab
  });

  it('unfolds one group per beat: concerns (all 9 questions), then decisions, then an honest mdl comment, never an invented block', () => {
    const d = stripData(cls, reuse);
    const [, con, dec, mdl] = d.docs as [string[], string[], string[], string[]];
    for (let q = 1; q <= 9; q++) expect(con.some((l) => new RegExp(`^ {8}${q}: `).test(l))).toBe(true);
    expect(con.some((l) => /^ {4}decisions: ▸/.test(l))).toBe(true);
    expect(con.at(-1)).toMatch(/^mdl: ▸/);
    expect(dec.some((l) => /^ {4}concerns: ▸/.test(l))).toBe(true);
    expect(dec).toContain('    decisions:');
    expect(dec.some((l) => /^ {8}10:$/.test(l))).toBe(true);
    expect(mdl.slice(-2)).toEqual(['mdl:   # optional — not sent in this run;', '       # it tells the ledger why you asked']);
    expect(cls.request).not.toMatch(/^mdl:/m); // the run sent none
    expect(mdl.some((l) => /^\s+\w+: /.test(l) && l.startsWith('mdl'))).toBe(false);
    expect(d.gutters.slice(1, 4).map((g) => g.length)).toEqual([1, 1, 1]);
    expect(d.docs[1]![d.gutters[1]![0]!]).toBe('    concerns:'); // the unfolded group's key line carries the ▾ mark
  });

  it('has every beat: one caption and one band each, request folded then three unfolds, then response, then knowledge', () => {
    for (const c of ['One claim. Only your code. Fixed cost.', 'Yes/no questions. Cheap models nail them.', "When yes/no isn't enough.", 'Why you asked — so the ledger learns.', 'A verdict you can cite. Odds, not vibes.', 'Finds exactly where it breaks.', 'Knows when to doubt itself. Tells you the next move.', 'Every answer kept. Ask again? Instant. Free.']) expect(svg).toContain(c.replaceAll('&', '&amp;'));
    const beats = stripData(cls, reuse).beats;
    expect(beats.map((b) => b.tab)).toEqual([0, 0, 0, 0, 1, 1, 1, 2]);
    expect(beats.filter((b) => b.tab === 0)).toHaveLength(4); // at most 4 request frames incl. the opening one
    for (let i = 0; i < 8; i++) expect(svg).toContain(`class="band${i}"`);
    for (const w of ['>request<', '>response<', '>knowledge<']) expect(svg).toContain(w);
    expect(svg).toContain('sending request …');
    expect(svg).toContain('class="pkt"'); // the request travels over the divider
    expect(svg).toContain('class="wire"');
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
    expect(wrapLine('  where: [' + 'a'.repeat(20) + '/' + 'b'.repeat(50) + ']')[0]).toBe('  where: [' + 'a'.repeat(20) + '/'); // a bare key row is avoided
  });

  it('keeps every band inside its whole document, every document inside the viewport', () => {
    const g = stripGeometry(cls, reuse);
    const beats = stripData(cls, reuse).beats;
    expect(g.bandRows).toHaveLength(8);
    g.bandRows.forEach(([a, z], i) => {
      expect(a).toBeGreaterThanOrEqual(0);
      expect(z).toBeLessThan(g.docRows[beats[i]!.doc]!);
    });
    for (const n of g.docRows) expect(n).toBeLessThanOrEqual(g.viewRows); // the whole request and the whole response fit, nothing scrolls
    expect(g.height).toBeLessThanOrEqual(700);
    expect(g.height).toBeGreaterThanOrEqual(600);
    expect(Number(/<svg [^>]*height="(\d+)"/.exec(svg)![1])).toBe(g.height);
  });

  it('is well-formed XML with no script, external font or machine path', () => {
    expect(wellFormed(svg)).toBeNull();
    expect(svg).not.toMatch(/<script|@import|@font-face|https?:\/\/(?!www\.w3\.org)/);
    expect(svg).not.toMatch(/\/home\/|\/Users\/|[A-Z]:\\|\.superpowers|\/tmp\/|mm3-demo-play|<path>/);
    expect(readFileSync('docs/demo/scenes/strip-n8n.json', 'utf8')).not.toMatch(/\/home\/|\/Users\/|-play\b|\/tmp\/|<path>/);
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" width="900"')).toBe(true);
  });

  it('draws a complete still: motion only inside prefers-reduced-motion:no-preference, poster frame all lit', () => {
    const style = /<style>([\s\S]*?)<\/style>/.exec(svg)![1]!;
    const [still, motion] = style.split('@media (prefers-reduced-motion:no-preference){');
    expect(motion).toContain('@keyframes');
    expect(still).not.toContain('animation');
    expect(still).toContain('.cap5{opacity:1}');
    expect(still).toContain('.band5{opacity:1}');
    for (const k of [0, 1, 2, 3, 4, 5]) expect(still).toContain(`.term${k}{opacity:1}`);
    expect(still).toContain('.code4{opacity:1');
    expect(still).toContain('.pkt{opacity:0}'); // the packet is only in flight while animating
    const plain = buildStrip(cls, reuse, { animate: false });
    expect(plain).not.toContain('@keyframes');
    expect(wellFormed(plain)).toBeNull();
  });

  it('matches the committed docs/assets/demo-strip-n8n.svg', () => {
    expect(readFileSync('docs/assets/demo-strip-n8n.svg', 'utf8').trimEnd()).toBe(svg);
  });
});

describe('extractStrip', () => {
  const play = (goal: string): { dir: string; req: string; out: string } => {
    const dir = mkdtempSync(path.join(tmpdir(), 'strip-play-'));
    mkdirSync(path.join(dir, 'n8n', '.mm3'), { recursive: true });
    const q = 'Is it fast?';
    const row = { kind: 'run', id: 'MM3-0007', verb: 'class', goal: 'g1', commit: 'abcdef1234', model: 'm', baseURL: 'https://api.example.test', costUsd: 0.00005, ask: { categories: [{ questions: [{ text: q }] }] }, telemetry: [{ source: 'provider', questions: 1, latencyMs: 9, costUsd: 0.00005, costEstimated: true }], response: `mak:\n  id: MM3-0007\n  note: see ${dir}/n8n/x.ts\nnext: mm3 template drill --from a\n` };
    writeFileSync(path.join(dir, 'n8n', '.mm3', 'log.jsonl'), JSON.stringify(row) + '\n');
    const req = path.join(dir, 'req.yaml');
    writeFileSync(req, `mak:\n  goal: ${goal}\n  ask:\n    concerns:\n      a:\n        1: ${q}\n`);
    return { dir, req, out: path.join(dir, 'strip.json') };
  };

  it('freezes a ledger row and its request into a scene, with machine paths scrubbed', () => {
    const { dir, req, out } = play('g1');
    const s = extractStrip(dir, 'MM3-0007', req, out);
    expect(s).toMatchObject({ id: 'MM3-0007', verb: 'class', footer: { questions: 1, latencyMs: 9, endpoint: 'api.example.test' } });
    expect(readFileSync(out, 'utf8')).not.toContain(dir);
    expect(s.response).toContain('<path>');
  });

  it('refuses a request file that is not the run\'s own', () => {
    const { dir, req, out } = play('another goal');
    expect(() => extractStrip(dir, 'MM3-0007', req, out)).toThrow(/goal does not match/);
    expect(() => extractStrip(dir, 'MM3-0099', req, out)).toThrow(/no run MM3-0099/);
  });
});

