/**
 * The README demo strip: one animated SVG (docs/assets/demo-strip-n8n.svg) of a real n8n quick class run, a minimal terminal
 * on the left and a tabbed viewport (request, response, knowledge) on the right. The terminal hands the request across the
 * divider into the viewport; the request opens folded to fit the screen and is unfolded one group per beat; the whole
 * response fits; the ledger row closes it. Everything shown is read from committed data, never typed: the run is the frozen
 * scene docs/demo/scenes/strip-n8n.json (ledger row MM3-0007 and its request file, see `extract`), the free re-check is
 * MM3-0006 from docs/demo/scenes/mdl.json. The terminal's numbers come from the scene footer, the YAML is the scene's
 * verbatim request and response (fold markers are display marks, not YAML). Free: no ledger, no network, no browser.
 * The still (no animation, prefers-reduced-motion, renderers that ignore CSS) is a complete frame: response beat 2.
 * `--stills <dir>` writes one static SVG per beat for a visual check.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';
import { askTexts, extractScene, fmtCost, loadStories, type AskRow, type Scene } from './build-demo.ts';

export const STRIP_W = 900;
const SPLIT = 350; // the one divider; the terminal's longest line (42 chars at 12px, about 305 px) ends well left of it
const CODE_X = SPLIT + 20;
const CODE_FS = 12.5;
const WRAP = 66; // characters per row: 66 * 7.5 (0.6 em at 12.5 px) = 495 px of the 520 px between the padding, so a wider font still fits
const LH = 16;
const TAB_Y = 64; // baseline of the tab labels; the rule under them is 8 px lower
const TOP = 92; // baseline of the first code row
const CLIP_TOP = TOP - 14; // the first row's ascent: rows are clipped whole, never sliced
const FADE_S = 0.35;
const ARRIVE_S = 1.7; // the request lands in the viewport, after the packet's trip across the divider
const POSTER = 5; // beat index of the still: response, "Finds exactly where it breaks."
const MONO = "ui-monospace, SFMono-Regular, 'JetBrains Mono', Menlo, Consolas, 'DejaVu Sans Mono', monospace";
const C = { bg: '#050914', line: '#24344f', dim: '#7f93b0', ink: '#e6edf7', white: '#f5f8ff', blue: '#9bdcff', green: '#b7ff83', amber: '#ffcd57', red: '#ff8d85', panel: '#0b1424' };

// one caption per beat: request (opening, concerns, decisions, mdl), response (verdict, where, next), knowledge
const CAPTIONS = [
  'One claim. Only your code. Fixed cost.', 'Yes/no questions. Cheap models nail them.', "When yes/no isn't enough.", 'Why you asked — so the ledger learns.',
  'A verdict you can cite. Odds, not vibes.', 'Finds exactly where it breaks.', 'Knows when to doubt itself. Tells you the next move.',
  'Every answer kept. Ask again? Instant. Free.',
];
const DUR = [4.4, 3.6, 3.6, 3.6, 3.6, 3.6, 3.6, 3.6]; // seconds per beat; the opening one is longer for the hand-off
const START = DUR.map((_, i) => DUR.slice(0, i).reduce((a, b) => a + b, 0));
const T = DUR.reduce((a, b) => a + b, 0);
const TABS = ['request', 'response', 'knowledge'] as const;

const xe = (s: string): string => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

/** Wraps one source line into rows of at most `max` characters: break at the last space (else after the last comma, else after the last slash), continuation rows hang two columns past the line's own indent. */
export function wrapLine(line: string, max = WRAP): string[] {
  if (line.length <= max) return [line];
  const lead = /^\s*/.exec(line)![0];
  const hang = lead + '  ';
  const rows: string[] = [];
  let rest = line;
  let first = true;
  while (rest.length > max) {
    const win = rest.slice(0, max + 1);
    let cut = win.lastIndexOf(' ');
    const lone = /^\s*[\w-]+:$/.test(rest.slice(0, Math.max(cut, 0))) && /[,/]/.test(win.slice(cut, max)); // a bare `key:` row: keep the key with the start of its value instead
    if (cut <= (first ? lead.length : hang.length) || lone) cut = win.slice(0, max).lastIndexOf(',') + 1 || win.slice(0, max).lastIndexOf('/') + 1 || max;
    rows.push(rest.slice(0, cut).trimEnd());
    rest = hang + rest.slice(cut).trimStart();
    first = false;
  }
  rows.push(rest);
  return rows;
}

// ---------------------------------------------------------------- YAML highlight (colour per character, then cut into rows)

const paint = (cols: (string | undefined)[], from: number, to: number, c: string): void => { for (let i = from; i < to; i++) cols[i] = c; };

/** One colour per character: keys blue, numbered questions and flow-map numbers amber, gates coloured, comments and fold summaries dim. */
function colourize(line: string, mode: 'yaml' | 'plain'): (string | undefined)[] {
  const cols: (string | undefined)[] = new Array(line.length).fill(undefined);
  if (/^\s*#/.test(line)) { paint(cols, 0, line.length, C.dim); return cols; }
  for (const m of line.matchAll(/"[A-Za-z]+"(?=:)/g)) paint(cols, m.index!, m.index! + m[0].length, C.blue);
  const key = /^(\s*)([A-Za-z0-9_-]+)(?=:)/.exec(line);
  if (key) paint(cols, key[1]!.length, key[1]!.length + key[2]!.length, /^\d+$/.test(key[2]!) ? C.amber : C.blue);
  for (const m of line.matchAll(/\b([A-Za-z0-9_-]+)(?=: [{[])/g)) if (m.index! > 0 && !cols[m.index!]) paint(cols, m.index!, m.index! + m[0].length, C.blue);
  const flow = line.indexOf('{');
  if (mode === 'plain' || flow >= 0) for (const m of line.matchAll(/(?<![\w.$-])-?\d+(?:\.\d+)?(?![\w-])/g)) if (mode === 'plain' || m.index! > flow) paint(cols, m.index!, m.index! + m[0].length, C.amber);
  if (mode === 'yaml') {
    for (const m of line.matchAll(/(?<=gate: )(pass|fail|unsure)\b/g)) paint(cols, m.index!, m.index! + m[0].length, m[1] === 'pass' ? C.green : m[1] === 'fail' ? C.red : C.amber);
    for (const m of line.matchAll(/(?<=\b(?:consensus|escalate): )\w+/g)) paint(cols, m.index!, m.index! + m[0].length, C.amber);
    for (const m of line.matchAll(/(?<=\bnext: )mm3 [^\n]*/g)) paint(cols, m.index!, m.index! + m[0].length, C.green);
    const fold = line.indexOf(FOLD); // a folded group: the marker and its summary are display, not YAML
    if (fold >= 0) paint(cols, fold, line.length, C.dim);
    const com = /^\s*[\w-]+:\s+(#)/.exec(line); // `key:   # comment`
    if (com) paint(cols, com.index! + com[0].length - 1, line.length, C.dim);
  }
  return cols;
}

/** The tspans of one row (chars [from, to) of the coloured line), runs of one colour merged. */
function rowSpans(text: string, cols: (string | undefined)[], from: number, hangPad: string): string {
  let out = '';
  let i = 0;
  const chars = hangPad + text; // the row's visible text; the pad has no colour
  const pad = hangPad.length;
  while (i < chars.length) {
    const c = i < pad ? undefined : cols[from + i - pad];
    let j = i;
    while (j < chars.length && (j < pad ? undefined : cols[from + j - pad]) === c) j++;
    const seg = xe(chars.slice(i, j));
    out += c ? `<tspan fill="${c}">${seg}</tspan>` : seg;
    i = j;
  }
  return out;
}

type Row = { spans: string };
type Doc = { rows: Row[]; first: number[]; count: number[] }; // first row / row count of each source line
/** Wraps and colours a document; `first[i]`/`count[i]` say where source line i landed in rows. */
function layout(lines: string[], mode: 'yaml' | 'plain'): Doc {
  const rows: Row[] = [];
  const first: number[] = [];
  const count: number[] = [];
  for (const line of lines) {
    const cols = colourize(line, mode);
    const wrapped = wrapLine(line);
    first.push(rows.length);
    count.push(wrapped.length);
    let at = 0; // index into `line` of the next character the row consumes
    wrapped.forEach((w, k) => {
      if (k === 0) { rows.push({ spans: rowSpans(w, cols, 0, '') }); at = w.length; }
      else {
        const hangLen = /^\s*/.exec(w)![0].length; // continuation rows start with the hanging pad
        while (line[at] === ' ') at++; // wrapLine dropped the break space
        rows.push({ spans: rowSpans(w.slice(hangLen), cols, at, w.slice(0, hangLen)) });
        at += w.length - hangLen;
      }
    });
  }
  return { rows, first, count };
}

// ---------------------------------------------------------------- data: read from the scenes, never typed

const FOLD = '▸'; // a folded group's marker (display only); the unfolded group carries ▾ in the gutter
/** doc: which document is on screen; band: source lines of that document, 0-based inclusive; term: terminal lines shown. */
type Beat = { tab: 0 | 1 | 2; doc: number; band: [number, number]; term: number };
export type StripData = { terminal: string[]; docs: string[][]; gutters: number[][]; beats: Beat[]; note: string[] };

const need = (lines: string[], re: RegExp, what: string, from = 0): number => {
  const i = lines.findIndex((l, k) => k >= from && re.test(l));
  if (i < 0) throw new Error(`strip: no ${what} in the scene YAML → the scene shape changed; update scripts/build-strip.ts`);
  return i;
};

/** Cost to one significant digit, as the terminal prints it: ~$0.00005. */
function shortCost(c: number, estimated: boolean): string {
  return c > 0 ? (estimated ? '~$' : '$') + c.toFixed(-Math.floor(Math.log10(c))) : fmtCost(c);
}

const plural = (n: number, w: string): string => `${n} ${w}${n === 1 ? '' : 's'}`;

export function stripData(cls: Scene, reuse: Scene): StripData {
  const f = cls.footer;
  const req = cls.request.split('\n');
  const res = cls.response.split('\n');
  const drill = /--from (\S+)/.exec(cls.response)?.[1];
  if (!drill) throw new Error('strip: the class response has no `next: ... --from <concern>` line');
  const terminal = [
    '~/n8n $ claude',
    '> where would I make n8n faster?',
    '$ mm3 class review.yaml',
    'sending request …',
    `${f.questions} questions · ${f.calls} call · ${f.latencyMs} ms · ${shortCost(f.costUsd, f.costEstimated)}`,
    `next: drill into ${drill}`,
  ];
  // request: the claim lines, then `concerns:` and `decisions:` (and `mdl:` when the run sent one) as folded or unfolded groups
  const iAsk = need(req, /^ {2}ask:/, 'ask:');
  const iCon = need(req, /^ {4}concerns:/, 'concerns:', iAsk);
  const iDec = need(req, /^ {4}decisions:/, 'decisions:', iCon);
  const iMdl = req.findIndex((l) => /^mdl:/.test(l));
  const head = req.slice(0, iAsk + 1);
  const conBlock = req.slice(iCon, iDec);
  const decBlock = req.slice(iDec, iMdl < 0 ? req.length : iMdl);
  const count = (blk: string[]): string => `${FOLD} ${plural(blk.filter((l) => /^ {6}[\w-]+:$/.test(l)).length, blk === conBlock ? 'concern' : 'decision')} · ${plural(blk.filter((l) => /^ {8}\d+:/.test(l)).length, 'question')}`;
  const foldCon = `    concerns: ${count(conBlock)}`;
  const foldDec = `    decisions: ${count(decBlock)}`;
  // no mdl block was sent: the folded line opens to an honest comment, never an invented block
  const mdlBlock = iMdl >= 0 ? req.slice(iMdl) : ['mdl:   # optional — not sent in this run;', '       # it tells the ledger why you asked'];
  const foldMdl = iMdl >= 0 ? `mdl: ${FOLD}` : `mdl: ${FOLD} optional · none sent`;
  const h = head.length;
  const reqDocs = [
    [...head, foldCon, foldDec, foldMdl],
    [...head, ...conBlock, foldDec, foldMdl],
    [...head, foldCon, ...decBlock, foldMdl],
    [...head, foldCon, foldDec, ...mdlBlock],
  ];
  // response: verdict / where / next
  const iId = need(res, /^ {2}id:/, 'id:'), iGoal = need(res, /^ {2}goal:/, 'goal:'), iCons = need(res, /^ {2}consensus:/, 'consensus:'), iNext = need(res, /^next:/, 'next:');
  // knowledge: the run's ledger row (abridged), the SQLite index, the free re-check from the committed scan MM3-0006 (a different run)
  const rf = reuse.footer;
  const depth = /^ {2}depth: (\S+)/m.exec(cls.request)?.[1] ?? '';
  const gate = /^ {2}gate: (\S+)/m.exec(cls.response)?.[1] ?? '';
  const row = { id: cls.id, verb: cls.verb, depth, gate, model: f.model, calls: f.calls, costUsd: f.costUsd, telemetry: [{ latencyMs: f.latencyMs, questions: f.questions, costEstimated: f.costEstimated }] };
  const saved = reuse.knowledge.savedUsd > 0 && rf.reusedFrom ? [`  saved ${fmtCost(reuse.knowledge.savedUsd, true)} by reusing ${rf.reusedFrom}`] : [];
  const know = [
    '# .mm3/log.jsonl: append-only, one row per run (abridged)', JSON.stringify(row), '',
    '# .mm3/index.db: a SQLite index over every row', '',
    `# same ledger, next release: a different run (${reuse.id}, ${rf.pin})`,
    `${reuse.id}  ${reuse.verb}  reused ${rf.reused} of ${rf.reused + rf.questions} · ${rf.calls} calls · ${fmtCost(rf.costUsd)}`, ...saved,
  ];
  return {
    terminal, docs: [...reqDocs, res, know], gutters: [[], [h], [h + 1], [h + 2], [], []],
    note: ['prompt shortened for display;', 'the run itself is real'],
    beats: [
      { tab: 0, doc: 0, band: [1, iAsk - 1], term: 4 },
      { tab: 0, doc: 1, band: [h, h + conBlock.length - 1], term: 4 },
      { tab: 0, doc: 2, band: [h + 1, h + decBlock.length], term: 4 },
      { tab: 0, doc: 3, band: [h + 2, h + 1 + mdlBlock.length], term: 4 },
      { tab: 1, doc: 4, band: [iId, iGoal], term: 5 }, { tab: 1, doc: 4, band: [iGoal + 1, iCons - 1], term: 5 }, { tab: 1, doc: 4, band: [iCons, iNext], term: 6 },
      { tab: 2, doc: 5, band: [5, know.length - 1], term: 6 },
    ],
  };
}

// ---------------------------------------------------------------- geometry

export type Geometry = { height: number; viewRows: number; docRows: number[]; bandRows: [number, number][] };
/** The viewport shows every document whole (nothing scrolls): its height is the tallest one; each beat's band in rows. */
function geometry(d: StripData, docs: Doc[]): Geometry {
  const bandRows = d.beats.map((b): [number, number] => { const D = docs[b.doc]!; return [D.first[b.band[0]]!, D.first[b.band[1]]! + D.count[b.band[1]]! - 1]; });
  const docRows = docs.map((D) => D.rows.length);
  const viewRows = Math.max(...docRows);
  const height = Math.ceil((CLIP_TOP + viewRows * LH + 8 + 52) / 10) * 10; // viewport, a gap, the caption panel (40 + 12 margin)
  return { height, viewRows, docRows, bandRows };
}

const layoutAll = (d: StripData): Doc[] => d.docs.map((doc, i) => layout(doc, i === d.docs.length - 1 ? 'plain' : 'yaml'));

/** The layout numbers of the strip built from these scenes (height, visible rows, rows per document, each band in rows). */
export function stripGeometry(cls: Scene, reuse: Scene): Geometry {
  const d = stripData(cls, reuse);
  return geometry(d, layoutAll(d));
}

// ---------------------------------------------------------------- animation

type Stop = [number, string]; // [seconds, css declarations]
const pct = (t: number): string => `${Math.min(100, Math.max(0, (t / T) * 100)).toFixed(3).replace(/\.?0+$/, '')}%`;

function frames(name: string, stops: Stop[]): string {
  const byT = new Map<string, string>();
  for (const [t, v] of stops) byT.set(pct(t), v);
  const body = [...byT].sort((a, b) => parseFloat(a[0]) - parseFloat(b[0])).map(([p, v]) => `${p}{${v}}`).join('');
  return `@keyframes ${name}{${body}}`;
}

const N = CAPTIONS.length;
/** Opacity 1 while the beat is in [s, e), else 0 (inverted: the complement); each inner edge fades over FADE_S. The first beat is lit at t=0 (or at `delay` seconds, when its content arrives) and the last stays lit to the end, so the loop seam is one clean cut. */
function windowStops(s: number, e: number, invert = false, delay = 0): Stop[] {
  const a = START[s]!, z = e === N ? T : START[e]!;
  const v = (on: boolean): string => `opacity:${on !== invert ? 1 : 0}`;
  const out: Stop[] = s === 0 ? (delay ? [[0, v(false)], [delay, v(false)], [delay + FADE_S, v(true)]] : [[0, v(true)]]) : [[0, v(false)], [a - FADE_S, v(false)], [a, v(true)]];
  if (e === N) out.push([T, v(true)]);
  else out.push([z - FADE_S, v(true)], [z, v(false)], [T, v(false)]); // stay off until the loop restarts (the static state would otherwise be the implicit end)
  return out;
}

// ---------------------------------------------------------------- the SVG

export type StripOpts = { beat?: number; animate?: boolean; full?: boolean };

const WIRE_Y = 76 + 3 * 26 - 4; // the hand-off line runs level with the terminal's `sending request …` row
const WIRE_X = 156;
const WIRE_END = SPLIT + 10;

/** The strip. `beat` is the still's beat (default: the poster); `animate` (default true) adds the keyframes; `full` shows all six terminal lines in the still (the poster does). */
export function buildStrip(cls: Scene, reuse: Scene, opts: StripOpts = {}): string {
  const d = stripData(cls, reuse);
  const docs = layoutAll(d);
  const g = geometry(d, docs);
  const H = g.height;
  const still = opts.beat ?? POSTER;
  const animate = opts.animate ?? true;
  const full = opts.full ?? still === POSTER;
  const beats = d.beats;
  const stillTerm = full ? d.terminal.length : beats[still]!.term;
  const beatsOf = (pick: (b: Beat) => number, v: number): number[] => beats.flatMap((b, i) => (pick(b) === v ? [i] : []));
  const span = (l: number[]): [number, number] => [l[0]!, l[l.length - 1]! + 1];
  const docOn = (dc: number): boolean => beats[still]!.doc === dc;

  // static state = the still
  const css: string[] = [
    `svg{font-family:${MONO}}text{white-space:pre}`,
    ...TABS.flatMap((_, t) => [`.ton${t}{opacity:${beats[still]!.tab === t ? 1 : 0}}`, `.tdim${t}{opacity:${beats[still]!.tab === t ? 0 : 1}}`]),
    ...docs.map((_, dc) => `.code${dc}{opacity:${docOn(dc) ? 1 : 0}}`),
    ...beats.flatMap((_, i) => [`.band${i}{opacity:${i === still ? 1 : 0}}`, `.cap${i}{opacity:${i === still ? 1 : 0}}`]),
    ...d.terminal.map((_, k) => `.term${k}{opacity:${k < stillTerm ? 1 : 0}}`),
    ...[4, 5, 6].map((n) => `.cur${n}{opacity:${n === stillTerm ? 1 : 0}}`),
    '.wire{opacity:.45}.pkt{opacity:0}',
  ];
  if (animate) {
    const kf: string[] = [];
    const rules: string[] = [];
    const bind = (cls_: string, name: string, stops: Stop[]): void => { kf.push(frames(name, stops)); rules.push(`.${cls_}{animation:${name} ${T}s linear infinite}`); };
    TABS.forEach((_, t) => {
      const [s, e] = span(beatsOf((b) => b.tab, t));
      bind(`ton${t}`, `kt${t}`, windowStops(s, e));
      bind(`tdim${t}`, `kd${t}`, windowStops(s, e, true));
    });
    docs.forEach((_, dc) => { const [s, e] = span(beatsOf((b) => b.doc, dc)); bind(`code${dc}`, `kc${dc}`, windowStops(s, e, false, s === 0 ? ARRIVE_S : 0)); });
    beats.forEach((_, i) => { bind(`band${i}`, `kb${i}`, windowStops(i, i + 1, false, i === 0 ? ARRIVE_S : 0)); bind(`cap${i}`, `kp${i}`, windowStops(i, i + 1, false, i === 0 ? ARRIVE_S : 0)); });
    d.terminal.forEach((_, k) => { const first = beats.findIndex((b) => b.term > k); if (first > 0) bind(`term${k}`, `kl${k}`, windowStops(first, N)); });
    [4, 5, 6].forEach((n) => { const bl = beatsOf((b) => b.term, n); if (bl.length) bind(`cur${n}`, `kx${n}`, windowStops(bl[0]!, bl[bl.length - 1]! + 1)); });
    // the hand-off: the wire is lit while the request is on its way, then dims; a packet rides it across the divider
    bind('wire', 'kw', [[0, 'opacity:1'], [ARRIVE_S + 0.4, 'opacity:1'], [ARRIVE_S + 1.2, 'opacity:.45'], [T, 'opacity:.45']]);
    kf.push(`@keyframes kpk{0%{opacity:0;transform:translateX(0)}${pct(0.15)}{opacity:1;transform:translateX(0)}${pct(ARRIVE_S - 0.2)}{opacity:1;transform:translateX(${WIRE_END - WIRE_X - 24}px)}${pct(ARRIVE_S)}{opacity:0;transform:translateX(${WIRE_END - WIRE_X - 24}px)}100%{opacity:0;transform:translateX(${WIRE_END - WIRE_X - 24}px)}}`);
    rules.push(`.pkt{animation:kpk ${T}s linear infinite}.wire{stroke-dashoffset:0}`);
    css.push('@media (prefers-reduced-motion:no-preference){' + rules.join('') + kf.join('') + '}');
  }

  const out: string[] = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${STRIP_W}" height="${H}" viewBox="0 0 ${STRIP_W} ${H}" role="img" aria-label="${xe('MM3 on n8n: one quick class run, its request, its response and the ledger knowledge, walked beat by beat')}">`);
  out.push(`<title>MM3 on n8n</title><desc>${xe(`A real run (${cls.id}): ${d.terminal[4]}. Request, response and knowledge tabs, one highlighted group per beat.`)}</desc>`);
  out.push(`<style>${css.join('')}</style>`);
  out.push(`<defs><clipPath id="vp"><rect x="${SPLIT + 1}" y="${CLIP_TOP}" width="${STRIP_W - SPLIT - 2}" height="${g.viewRows * LH}"/></clipPath></defs>`);
  out.push(`<rect width="${STRIP_W}" height="${H}" rx="14" fill="${C.bg}"/><rect x=".5" y=".5" width="${STRIP_W - 1}" height="${H - 1}" rx="14" fill="none" stroke="${C.line}"/>`);
  out.push(`<text x="22" y="34" font-size="17" font-weight="700" fill="${C.white}">MM<tspan fill="${C.green}">3</tspan></text>`);
  out.push(`<line x1="${SPLIT}" y1="48" x2="${SPLIT}" y2="${H - 18}" stroke="${C.line}"/>`);
  // terminal: lines appear as the run goes
  d.terminal.forEach((t, k) => {
    const y = 76 + k * 26;
    const col = k === 0 || k === 4 ? C.dim : k === 3 ? C.blue : k === 5 ? C.amber : C.ink;
    out.push(`<text class="term${k}" x="22" y="${y}" font-size="12" fill="${col}">${xe(t)}</text>`);
  });
  for (const n of [4, 5, 6]) out.push(`<rect class="cur${n}" x="22" y="${76 + n * 26 - 11}" width="7" height="14" fill="${C.green}"/>`);
  d.note.forEach((n, k) => out.push(`<text x="22" y="${H - 44 + k * 18}" font-size="12" fill="${C.dim}"># ${xe(n)}</text>`));
  // the hand-off: a dashed wire from the terminal across the divider into the viewport, an arrowhead, and the request riding it
  out.push(`<line class="wire" x1="${WIRE_X}" y1="${WIRE_Y}" x2="${WIRE_END - 8}" y2="${WIRE_Y}" stroke="${C.blue}" stroke-width="1.5" stroke-dasharray="4 5"/><path class="wire" d="M${WIRE_END - 9} ${WIRE_Y - 4}L${WIRE_END} ${WIRE_Y}L${WIRE_END - 9} ${WIRE_Y + 4}Z" fill="${C.blue}"/>`);
  out.push(`<g class="pkt"><rect x="${WIRE_X}" y="${WIRE_Y - 5}" width="18" height="10" rx="2" fill="${C.blue}"/><text x="${WIRE_X + 18}" y="${WIRE_Y + 19}" text-anchor="end" font-size="12" fill="${C.blue}">request</text></g>`);
  // tabs, and the note that the request is shown folded
  let x = CODE_X;
  TABS.forEach((t, i) => {
    const w = t.length * 7.4;
    out.push(`<text class="tdim${i}" x="${x}" y="${TAB_Y}" font-size="12.5" fill="${C.dim}">${t}</text><g class="ton${i}"><text x="${x}" y="${TAB_Y}" font-size="12.5" font-weight="700" fill="${C.blue}">${t}</text><line x1="${x}" y1="${TAB_Y + 8}" x2="${x + w}" y2="${TAB_Y + 8}" stroke="${C.blue}" stroke-width="2"/></g>`);
    x += w + 30;
  });
  out.push(`<text class="ton0" x="${STRIP_W - 18}" y="${TAB_Y}" text-anchor="end" font-size="12" fill="${C.dim}">collapsed to fit on screen</text>`);
  out.push(`<line x1="${SPLIT}" y1="${TAB_Y + 11}" x2="${STRIP_W}" y2="${TAB_Y + 11}" stroke="${C.line}"/>`);
  // viewport: one group per document (rows, gutter marks and the bands of the beats that show it), clipped
  out.push('<g clip-path="url(#vp)">');
  docs.forEach((D, dc) => {
    out.push(`<g class="code${dc}">`);
    beats.forEach((b, i) => {
      if (b.doc !== dc) return;
      const [a, z] = g.bandRows[i]!;
      out.push(`<rect class="band${i}" x="${SPLIT + 10}" y="${TOP + a * LH - 12}" width="${STRIP_W - SPLIT - 20}" height="${(z - a + 1) * LH}" rx="5" fill="${C.green}" fill-opacity=".07" stroke="${C.green}" stroke-opacity=".55"/>`);
    });
    D.rows.forEach((r, k) => out.push(`<text x="${CODE_X}" y="${TOP + k * LH}" font-size="${CODE_FS}" fill="${C.ink}" xml:space="preserve">${r.spans}</text>`));
    for (const li of d.gutters[dc]!) out.push(`<text x="${Math.max(SPLIT + 11, CODE_X + (/^\s*/.exec(d.docs[dc]![li]!)![0].length - 2) * CODE_FS * 0.6)}" y="${TOP + D.first[li]! * LH}" font-size="${CODE_FS}" fill="${C.blue}">▾</text>`);
    out.push('</g>');
  });
  out.push('</g>');
  // the one punchy line per beat
  out.push(`<rect x="${SPLIT + 10}" y="${H - 52}" width="${STRIP_W - SPLIT - 20}" height="40" rx="7" fill="${C.panel}" stroke="${C.line}"/>`);
  CAPTIONS.forEach((c, i) => out.push(`<text class="cap${i}" x="${CODE_X}" y="${H - 27}" font-size="15" font-weight="700" fill="${C.green}">${xe(c)}</text>`));
  out.push('</svg>');
  return out.join('\n');
}

// ---------------------------------------------------------------- committed data in, one-time extract out

const STRIP_SCENE = 'docs/demo/scenes/strip-n8n.json';

/** The committed data the strip reads: n8n's quick class run (strip-n8n.json) and the free re-check on the next release (MM3-0006 in mdl.json). */
export function stripScenes(dir = 'docs/demo/scenes'): { cls: Scene; reuse: Scene } {
  const cls = JSON.parse(readFileSync(path.join(dir, 'strip-n8n.json'), 'utf8')) as Scene;
  const reuse = loadStories(dir).find((s) => s.id === 'mdl')?.scenes.find((s) => s.id === 'MM3-0006');
  if (!reuse) throw new Error('strip: docs/demo/scenes/mdl.json needs step MM3-0006 (scan, reused)');
  return { cls, reuse };
}

/** One-time, free: freezes one class run of a play area (ledger row + the request file that produced it, both checked against each other) into the strip's scene file, with the same path scrub as the player's scenes. */
export function extractStrip(play: string, rowId: string, requestFile: string, out = STRIP_SCENE): Scene {
  const repo = path.join(play, 'n8n');
  const rows = readFileSync(path.join(repo, '.mm3', 'log.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l) as Parameters<typeof extractScene>[0] & AskRow & { id?: string; kind?: string; goal?: string; commit?: string; parent?: string | null });
  const runs = rows.filter((r) => r.kind === 'run');
  const row = runs.find((r) => r.id === rowId);
  if (!row) throw new Error(`✖ ledger: no run ${rowId} in n8n → point --play at the play area of this round`);
  const yaml = readFileSync(requestFile, 'utf8');
  const goal = ((parse(yaml) as { mak?: { goal?: string } }).mak?.goal ?? '').trim();
  if (goal !== (row.goal ?? '').trim()) throw new Error(`✖ ${path.basename(requestFile)}: goal does not match ${rowId} → pass the request file whose mak.goal is the row's goal`);
  const missing = askTexts(row).find((t) => !yaml.includes(t));
  if (missing) throw new Error(`✖ ${path.basename(requestFile)}: question "${missing}" of ${rowId} is not in the file → pass the request file that produced the run`);
  const tags = (spawnSync('git', ['-C', repo, 'tag', '--points-at', row.commit ?? ''], { encoding: 'utf8' }).stdout ?? '').split('\n').filter((t) => t.startsWith('n8n@'));
  const scene = extractScene(row, yaml, { story: 'strip', n: 1, pin: tags[0] ?? `n8n @${(row.commit ?? '').slice(0, 7)}`, run: runs.indexOf(row) + 1, of: runs.length, children: runs.filter((r) => r.parent === rowId).map((r) => r.id ?? ''), play });
  writeFileSync(out, JSON.stringify(scene, null, 2) + '\n');
  return scene;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (k: string): string | undefined => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : undefined; };
  if (process.argv[2] === 'extract') {
    const play = arg('--play'), request = arg('--request');
    if (!play || !request) { console.log('✖ extract: --play and --request are required → tsx scripts/build-strip.ts extract --play <play-area> --request <request.yaml> [--row MM3-0007]'); process.exit(1); }
    const s = extractStrip(play, arg('--row') ?? 'MM3-0007', request);
    console.log(`strip scene: ${STRIP_SCENE} ${s.id} ${s.verb} ${s.footer.questions} questions ${s.footer.latencyMs} ms ${s.footer.pin}`);
  } else {
    const { cls, reuse } = stripScenes();
    const dir = arg('--stills');
    if (dir) {
      mkdirSync(dir, { recursive: true });
      writeFileSync(path.join(dir, 'strip-poster.svg'), buildStrip(cls, reuse, { animate: false }));
      for (let b = 0; b < CAPTIONS.length; b++) writeFileSync(path.join(dir, `strip-beat${b + 1}.svg`), buildStrip(cls, reuse, { beat: b, animate: false, full: false }));
      writeFileSync(path.join(dir, 'strip-anim.svg'), buildStrip(cls, reuse));
      console.log(`strip stills → ${dir}`);
    } else {
      const svg = buildStrip(cls, reuse);
      const out = 'docs/assets/demo-strip-n8n.svg';
      writeFileSync(out, svg + '\n');
      console.log(`strip: ${out} ${Buffer.byteLength(svg)} bytes (from ${STRIP_SCENE} ${cls.id} + docs/demo/scenes/mdl.json ${reuse.id}, no ledger read)`);
    }
  }
}
