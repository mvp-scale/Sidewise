/**
 * The README demo strip: one animated SVG (docs/assets/demo-strip-n8n.svg) of a real n8n run, a minimal terminal on the
 * left and a tabbed viewport (request, response, knowledge) on the right that scrolls through the run's real YAML, one
 * highlighted group and one punchy line per beat. Everything shown is read from the committed scene data
 * (docs/demo/scenes/mdl.json: MM3-0003 the class run, MM3-0006 the free re-check), never typed: the terminal's numbers come
 * from the scene footer, the YAML is the scene's verbatim request and response. Free: no ledger, no network, no browser.
 * The still (no animation, prefers-reduced-motion, renderers that ignore CSS) is a complete frame: response beat 2.
 * `--stills <dir>` writes one static SVG per beat for a visual check.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fmtCost, loadStories, type Scene } from './build-demo.ts';

export const STRIP_W = 900;
const SPLIT = 350; // the one divider; the terminal's cost line (42 chars at 12px, about 305 px) ends well left of it
const CODE_X = SPLIT + 20;
const CODE_FS = 12.5;
const WRAP = 66; // characters per row: 66 * 7.5 (0.6 em at 12.5 px) = 495 px of the 520 px between the padding, so a wider font still fits
const LH = 17;
const TOP = 106; // baseline of the first code row
const CLIP_TOP = TOP - 14; // the first row's ascent: rows are clipped whole, never sliced
const BEAT_S = 3.6;
const FADE_S = 0.35;
const POSTER = 4; // beat index of the still: response, "Finds exactly where it breaks."
const MONO = "ui-monospace, SFMono-Regular, 'JetBrains Mono', Menlo, Consolas, 'DejaVu Sans Mono', monospace";
const C = { bg: '#050914', line: '#24344f', dim: '#7f93b0', ink: '#e6edf7', white: '#f5f8ff', blue: '#9bdcff', green: '#b7ff83', amber: '#ffcd57', red: '#ff8d85', panel: '#0b1424' };

const CAPTIONS = [
  'One claim. Only your code. Fixed cost.', 'Yes/no questions. Cheap models nail them.', "When yes/no isn't enough.",
  'A verdict you can cite. Odds, not vibes.', 'Finds exactly where it breaks.', 'Knows when to doubt itself. Tells you the next move.',
  'Every answer kept. Ask again? Instant. Free.',
];
const TABS = ['request', 'response', 'knowledge'] as const;

const xe = (s: string): string => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

/** Wraps one source line into rows of at most `max` characters: break at the last space (else after the last comma), continuation rows hang two columns past the line's own indent. */
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
    if (cut <= (first ? lead.length : hang.length)) cut = win.slice(0, max).lastIndexOf(',') + 1 || max;
    rows.push(rest.slice(0, cut).trimEnd());
    rest = hang + rest.slice(cut).trimStart();
    first = false;
  }
  rows.push(rest);
  return rows;
}

// ---------------------------------------------------------------- YAML highlight (colour per character, then cut into rows)

const paint = (cols: (string | undefined)[], from: number, to: number, c: string): void => { for (let i = from; i < to; i++) cols[i] = c; };

/** One colour per character: keys blue, numbered questions and flow-map numbers amber, gates coloured, comments dim. */
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

type Beat = { tab: 0 | 1 | 2; band: [number, number]; term: number }; // band: source lines, 0-based inclusive
export type StripData = { terminal: string[]; docs: string[][]; beats: Beat[]; note: string[] };

const need = (lines: string[], re: RegExp, what: string, from = 0): number => {
  const i = lines.findIndex((l, k) => k >= from && re.test(l));
  if (i < 0) throw new Error(`strip: no ${what} in the scene YAML → the scene shape changed; update scripts/build-strip.ts`);
  return i;
};

/** Cost to one significant digit, as the terminal prints it: ~$0.00004. */
function shortCost(c: number, estimated: boolean): string {
  return c > 0 ? (estimated ? '~$' : '$') + c.toFixed(-Math.floor(Math.log10(c))) : fmtCost(c);
}

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
    `${f.questions} questions · ${f.calls} call · ${f.latencyMs} ms · ${shortCost(f.costUsd, f.costEstimated)}`,
    `next: drill into ${drill}`,
  ];
  // request: claim / first three concerns / decisions
  const iAsk = need(req, /^ {2}ask:/, 'ask:');
  const concerns = req.map((l, i) => [l, i] as const).filter(([l, i]) => i > iAsk && /^ {6}[\w-]+:$/.test(l)).map(([, i]) => i);
  const iDec = need(req, /^ {4}decisions:/, 'decisions:');
  const iMdl = req.findIndex((l) => /^mdl:/.test(l));
  const r3 = concerns.length > 3 ? concerns[3]! - 1 : iDec - 1;
  // response: verdict / where / next
  const iId = need(res, /^ {2}id:/, 'id:'), iGoal = need(res, /^ {2}goal:/, 'goal:'), iCons = need(res, /^ {2}consensus:/, 'consensus:'), iNext = need(res, /^next:/, 'next:');
  // knowledge: the run's ledger row (abridged), the SQLite index, the free re-check from the committed scan MM3-0006
  const rf = reuse.footer;
  const row = { id: cls.id, verb: cls.verb, model: f.model, costUsd: f.costUsd, telemetry: [{ latencyMs: f.latencyMs, questions: f.questions, costEstimated: f.costEstimated }] };
  const saved = reuse.knowledge.savedUsd > 0 && rf.reusedFrom ? [`  saved ${fmtCost(reuse.knowledge.savedUsd, true)} by reusing ${rf.reusedFrom}`] : [];
  const know = [
    '# .mm3/log.jsonl: append-only, one row per run (abridged)', JSON.stringify(row), '',
    '# .mm3/index.db: a SQLite index over every row', '',
    `# next release, same questions (${rf.pin}):`,
    `${reuse.id}  ${reuse.verb}  reused ${rf.reused} of ${rf.reused + rf.questions} · ${rf.calls} calls · ${fmtCost(rf.costUsd)}`, ...saved,
  ];
  return {
    terminal, docs: [req, res, know], note: ['prompt shortened for display;', 'the run itself is real'],
    beats: [
      { tab: 0, band: [0, iAsk - 1], term: 3 }, { tab: 0, band: [iAsk, r3], term: 3 }, { tab: 0, band: [iDec, iMdl < 0 ? req.length - 1 : iMdl - 1], term: 3 },
      { tab: 1, band: [iId, iGoal], term: 4 }, { tab: 1, band: [iGoal + 1, iCons - 1], term: 4 }, { tab: 1, band: [iCons, iNext], term: 5 },
      { tab: 2, band: [5, know.length - 1], term: 5 },
    ],
  };
}

// ---------------------------------------------------------------- geometry

export type Geometry = { height: number; viewRows: number; offsets: number[]; bandRows: [number, number][] };
/** Viewport height from the tallest thing that must be whole (a beat's band, or a short tab), each beat's scroll offset, each band in rows. */
function geometry(d: StripData, docs: Doc[]): Geometry {
  const bandRows = d.beats.map((b): [number, number] => { const D = docs[b.tab]!; return [D.first[b.band[0]]!, D.first[b.band[1]]! + D.count[b.band[1]]! - 1]; });
  const need = Math.max(...bandRows.map(([a, z]) => z - a + 1), ...docs.slice(1).map((D) => D.rows.length)) + 2; // a row of context above and below the tallest band
  const viewRows = need;
  const offsets = d.beats.map((b, i) => {
    const total = docs[b.tab]!.rows.length;
    const [a, z] = bandRows[i]!;
    let top = Math.max(0, a - 1);
    if (z + 1 - top > viewRows) top = z + 1 - viewRows;
    top = Math.min(top, Math.max(0, total - viewRows));
    if (a < top || z >= top + viewRows) top = a; // never hide the band
    return top;
  });
  const height = Math.ceil((CLIP_TOP + viewRows * LH + 14 + 62) / 10) * 10; // viewport, a gap, the caption panel (44 + 18 margin)
  return { height, viewRows, offsets, bandRows };
}

/** The layout numbers of the strip built from these scenes (height, visible rows, each beat's scroll offset and band rows). */
export function stripGeometry(cls: Scene, reuse: Scene): Geometry {
  const d = stripData(cls, reuse);
  return geometry(d, [layout(d.docs[0]!, 'yaml'), layout(d.docs[1]!, 'yaml'), layout(d.docs[2]!, 'plain')]);
}

// ---------------------------------------------------------------- animation

/** Opacity keyframe stops for a window [s, e) of beats (fade at both edges); the timeline is 7 beats. */
type Stop = [number, string]; // [seconds, css declarations]
const T = BEAT_S * CAPTIONS.length;
const pct = (t: number): string => `${Math.min(100, Math.max(0, (t / T) * 100)).toFixed(3).replace(/\.?0+$/, '')}%`;

function frames(name: string, stops: Stop[]): string {
  const byT = new Map<string, string>();
  for (const [t, v] of stops) byT.set(pct(t), v);
  const body = [...byT].sort((a, b) => parseFloat(a[0]) - parseFloat(b[0])).map(([p, v]) => `${p}{${v}}`).join('');
  return `@keyframes ${name}{${body}}`;
}

/** Opacity 1 while the beat is in [s, e), else 0 (inverted: the complement); each inner edge fades over FADE_S. The first beat is lit at t=0 and the last stays lit to the end, so a still grabbed at any moment is a real frame and the loop seam is one clean cut. */
function windowStops(s: number, e: number, invert = false): Stop[] {
  const a = s * BEAT_S, z = e * BEAT_S;
  const v = (on: boolean): string => `opacity:${on !== invert ? 1 : 0}`;
  const out: Stop[] = s === 0 ? [[0, v(true)]] : [[0, v(false)], [a - FADE_S, v(false)], [a, v(true)]];
  if (e === CAPTIONS.length) out.push([T, v(true)]);
  else out.push([z - FADE_S, v(true)], [z, v(false)], [T, v(false)]); // stay off until the loop restarts (the static state would otherwise be the implicit end)
  return out;
}

// ---------------------------------------------------------------- the SVG

export type StripOpts = { beat?: number; animate?: boolean; full?: boolean };

/** The strip. `beat` is the still's beat (default: the poster); `animate` (default true) adds the keyframes; `full` shows all five terminal lines in the still (the poster does). */
export function buildStrip(cls: Scene, reuse: Scene, opts: StripOpts = {}): string {
  const d = stripData(cls, reuse);
  const docs = [layout(d.docs[0]!, 'yaml'), layout(d.docs[1]!, 'yaml'), layout(d.docs[2]!, 'plain')];
  const g = geometry(d, docs);
  const H = g.height;
  const still = opts.beat ?? POSTER;
  const animate = opts.animate ?? true;
  const full = opts.full ?? still === POSTER;
  const beats = d.beats;
  const stillTerm = full ? 5 : beats[still]!.term;
  const beatsOf = (tab: number): number[] => beats.flatMap((b, i) => (b.tab === tab ? [i] : []));
  const span = (tab: number): [number, number] => { const l = beatsOf(tab); return [l[0]!, l[l.length - 1]! + 1]; };
  const ty = (i: number): number => -g.offsets[i]! * LH;

  // static state = the still
  const css: string[] = [
    `svg{font-family:${MONO}}text{white-space:pre}`,
    ...TABS.flatMap((_, t) => [`.code${t}{opacity:${beats[still]!.tab === t ? 1 : 0};transform:translateY(${beats[still]!.tab === t ? ty(still) : 0}px)}`, `.ton${t}{opacity:${beats[still]!.tab === t ? 1 : 0}}`, `.tdim${t}{opacity:${beats[still]!.tab === t ? 0 : 1}}`]),
    ...beats.flatMap((_, i) => [`.band${i}{opacity:${i === still ? 1 : 0}}`, `.cap${i}{opacity:${i === still ? 1 : 0}}`]),
    ...d.terminal.map((_, k) => `.term${k}{opacity:${k < stillTerm ? 1 : 0}}`),
    ...[3, 4, 5].map((n) => `.cur${n}{opacity:${n === stillTerm ? 1 : 0}}`),
  ];
  if (animate) {
    const kf: string[] = [];
    const rules: string[] = [];
    const bind = (cls_: string, name: string, stops: Stop[]): void => { kf.push(frames(name, stops)); rules.push(`.${cls_}{animation:${name} ${T}s linear infinite}`); };
    TABS.forEach((_, t) => {
      const [s, e] = span(t);
      // scroll: hold each beat's offset, then glide to the next beat's within the tab (0.6 s before it starts)
      const bl = beatsOf(t);
      const moves: Stop[] = [[0, `transform:translateY(${ty(bl[0]!)}px)`], ...bl.flatMap((i): Stop[] => [[i * BEAT_S, `transform:translateY(${ty(i)}px)`], [(i + 1) * BEAT_S - 0.6, `transform:translateY(${ty(i)}px)`]]), [e * BEAT_S, `transform:translateY(${ty(bl[bl.length - 1]!)}px)`]];
      const merged = new Map<number, string>();
      for (const [tt, v] of [...windowStops(s, e), ...moves]) merged.set(tt, [merged.get(tt), v].filter(Boolean).join(';'));
      bind(`code${t}`, `kc${t}`, [...merged].sort((x, y) => x[0] - y[0]));
      bind(`ton${t}`, `kt${t}`, windowStops(s, e));
      bind(`tdim${t}`, `kd${t}`, windowStops(s, e, true));
    });
    beats.forEach((_, i) => { bind(`band${i}`, `kb${i}`, windowStops(i, i + 1)); bind(`cap${i}`, `kp${i}`, windowStops(i, i + 1)); });
    d.terminal.forEach((_, k) => { const first = beats.findIndex((b) => b.term > k); bind(`term${k}`, `kl${k}`, windowStops(first, CAPTIONS.length)); });
    [3, 4, 5].forEach((n) => { const bl = beats.flatMap((b, i) => (b.term === n ? [i] : [])); if (bl.length) bind(`cur${n}`, `kx${n}`, windowStops(bl[0]!, bl[bl.length - 1]! + 1)); });
    css.push('@media (prefers-reduced-motion:no-preference){' + rules.join('') + kf.join('') + '}');
  }

  const out: string[] = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${STRIP_W}" height="${H}" viewBox="0 0 ${STRIP_W} ${H}" role="img" aria-label="${xe('MM3 on n8n: one class run, its request, its response and the ledger knowledge, walked beat by beat')}">`);
  out.push(`<title>MM3 on n8n</title><desc>${xe(`A real run (${cls.id}): ${d.terminal[3]}. Request, response and knowledge tabs, one highlighted group per beat.`)}</desc>`);
  out.push(`<style>${css.join('')}</style>`);
  out.push(`<defs><clipPath id="vp"><rect x="${SPLIT + 1}" y="${CLIP_TOP}" width="${STRIP_W - SPLIT - 2}" height="${g.viewRows * LH}"/></clipPath></defs>`);
  out.push(`<rect width="${STRIP_W}" height="${H}" rx="14" fill="${C.bg}"/><rect x=".5" y=".5" width="${STRIP_W - 1}" height="${H - 1}" rx="14" fill="none" stroke="${C.line}"/>`);
  out.push(`<text x="22" y="34" font-size="17" font-weight="700" fill="${C.white}">MM<tspan fill="${C.green}">3</tspan></text>`);
  out.push(`<line x1="${SPLIT}" y1="48" x2="${SPLIT}" y2="${H - 18}" stroke="${C.line}"/>`);
  // terminal: lines appear beat by beat
  d.terminal.forEach((t, k) => {
    const y = 76 + k * 26;
    const col = k === 0 || k === 3 ? C.dim : k === 4 ? C.amber : C.ink;
    out.push(`<text class="term${k}" x="22" y="${y}" font-size="12" fill="${col}">${xe(t)}</text>`);
  });
  for (const n of [3, 4, 5]) out.push(`<rect class="cur${n}" x="22" y="${76 + n * 26 - 11}" width="7" height="14" fill="${C.green}"/>`);
  d.note.forEach((n, k) => out.push(`<text x="22" y="${H - 44 + k * 18}" font-size="12" fill="${C.dim}"># ${xe(n)}</text>`));
  // tabs
  let x = CODE_X;
  TABS.forEach((t, i) => {
    const w = t.length * 7.4;
    out.push(`<text class="tdim${i}" x="${x}" y="72" font-size="12.5" fill="${C.dim}">${t}</text><g class="ton${i}"><text x="${x}" y="72" font-size="12.5" font-weight="700" fill="${C.blue}">${t}</text><line x1="${x}" y1="80" x2="${x + w}" y2="80" stroke="${C.blue}" stroke-width="2"/></g>`);
    x += w + 30;
  });
  out.push(`<line x1="${SPLIT}" y1="83" x2="${STRIP_W}" y2="83" stroke="${C.line}"/>`);
  // viewport: one group per tab (rows + that tab's bands), clipped
  out.push('<g clip-path="url(#vp)">');
  TABS.forEach((_, t) => {
    out.push(`<g class="code${t}">`);
    beats.forEach((b, i) => {
      if (b.tab !== t) return;
      const [a, z] = g.bandRows[i]!;
      out.push(`<rect class="band${i}" x="${SPLIT + 10}" y="${TOP + a * LH - 13}" width="${STRIP_W - SPLIT - 20}" height="${(z - a + 1) * LH + 2}" rx="5" fill="${C.green}" fill-opacity=".07" stroke="${C.green}" stroke-opacity=".55"/>`);
    });
    docs[t]!.rows.forEach((r, k) => out.push(`<text x="${CODE_X}" y="${TOP + k * LH}" font-size="${CODE_FS}" fill="${C.ink}" xml:space="preserve">${r.spans}</text>`));
    out.push('</g>');
  });
  out.push('</g>');
  // the one punchy line per beat
  out.push(`<rect x="${SPLIT + 10}" y="${H - 62}" width="${STRIP_W - SPLIT - 20}" height="44" rx="7" fill="${C.panel}" stroke="${C.line}"/>`);
  CAPTIONS.forEach((c, i) => out.push(`<text class="cap${i}" x="${CODE_X}" y="${H - 34}" font-size="15" font-weight="700" fill="${C.green}">${xe(c)}</text>`));
  out.push('</svg>');
  return out.join('\n');
}

/** The committed scenes the strip reads: n8n's class run and the free re-check on the next release. */
export function stripScenes(dir?: string): { cls: Scene; reuse: Scene } {
  const story = loadStories(dir).find((s) => s.id === 'mdl');
  const cls = story?.scenes.find((s) => s.id === 'MM3-0003');
  const reuse = story?.scenes.find((s) => s.id === 'MM3-0006');
  if (!cls || !reuse) throw new Error('strip: docs/demo/scenes/mdl.json needs steps MM3-0003 (class) and MM3-0006 (scan, reused)');
  return { cls, reuse };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { cls, reuse } = stripScenes();
  const at = process.argv.indexOf('--stills');
  if (at >= 0) {
    const dir = process.argv[at + 1]!;
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, 'strip-poster.svg'), buildStrip(cls, reuse, { animate: false }));
    for (let b = 0; b < CAPTIONS.length; b++) writeFileSync(path.join(dir, `strip-beat${b + 1}.svg`), buildStrip(cls, reuse, { beat: b, animate: false, full: false }));
    writeFileSync(path.join(dir, 'strip-anim.svg'), buildStrip(cls, reuse));
    console.log(`strip stills → ${dir}`);
  } else {
    const svg = buildStrip(cls, reuse);
    const out = 'docs/assets/demo-strip-n8n.svg';
    writeFileSync(out, svg + '\n');
    console.log(`strip: ${out} ${Buffer.byteLength(svg)} bytes (from docs/demo/scenes/mdl.json ${cls.id} + ${reuse.id}, no ledger read)`);
  }
}
