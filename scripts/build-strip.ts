/**
 * The README demo strip: one animated SVG (docs/assets/demo-strip-n8n.svg) of a real n8n quick class run. LEFT is the agent
 * session (a typed prompt, the `Bash(mm3 class ...)` call, its result) with a value panel underneath; RIGHT is a tabbed
 * viewport (request, response, knowledge). When the call fires the request tab pulses and the request opens folded; a
 * simulated pointer clicks concerns, decisions and mdl open one after the other, then the response and knowledge tabs. Every
 * YAML byte, number and output line is read from the frozen scene docs/demo/scenes/strip-n8n.json (ledger row MM3-0008, its
 * request file, and the free `view` / `report` output captured beside it, see `extract`); the terminal's numbers come from the
 * scene footer, fold summaries are counted from the request. Free: no ledger, no network, no browser.
 * Motion is SMIL (`<animate>` with keyTimes and keySplines): it renders in an <img> in Chrome, Firefox and Safari, GitHub's
 * viewer included, and eases geometry (band, expanding groups, pointer) which CSS keyframes cannot do on SVG attributes in
 * every engine. SMIL ignores prefers-reduced-motion, so a second, frozen copy of the poster frame (the response) sits under
 * the animation and CSS swaps to it for readers who ask for no motion; the animated group's own base values are the poster too.
 * `--stills <dir>` writes the poster plus static SVGs paused at timeline points for a visual check.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';
import { askTexts, extractScene, fmtCost, scrubPaths, type AskRow, type Scene } from './build-demo.ts';

export const STRIP_W = 900;
const SPLIT = 280; // the one divider; the left column (terminal + value panel) is 280 px
const CODE_X = SPLIT + 26; // room for the fold gutter (▾) between the band's edge and the code
const FS = 12.5; // code font size: about 12.0 px at GitHub's ~865 px column
const CW = FS * 0.6; // one monospace column
const WRAP = 77; // 77 * 7.5 = 577 px of the 580 px between the code column and the right padding
const LH = 16;
const TAB_Y = 34; // baseline of the tab labels
const TOP = 78; // baseline of the first code row
const CLIP_TOP = TOP - 14;
const MONO = "ui-monospace, SFMono-Regular, 'JetBrains Mono', Menlo, Consolas, 'DejaVu Sans Mono', monospace";
const SANS = "Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif";
const C = { bg: '#050914', line: '#24344f', dim: '#7f93b0', ink: '#e6edf7', white: '#f5f8ff', blue: '#9bdcff', green: '#b7ff83', amber: '#ffcd57', red: '#ff8d85', panel: '#0b1424' };
const FOLD = '▸';

const xe = (s: string): string => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const n2 = (n: number): string => String(Math.round(n * 100) / 100);
const plural = (n: number, w: string): string => `${n} ${w}${n === 1 ? '' : 's'}`;

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

type Mode = 'yaml' | 'plain' | 'cmd';
const paint = (cols: (string | undefined)[], from: number, to: number, c: string): void => { for (let i = from; i < to; i++) cols[i] = c; };

/** One colour per character: keys blue, numbered questions and flow-map numbers amber, gates coloured, comments and fold summaries dim. */
function colourize(line: string, mode: Mode): (string | undefined)[] {
  const cols: (string | undefined)[] = new Array(line.length).fill(undefined);
  if (mode === 'cmd') { paint(cols, 0, 1, C.green); paint(cols, 2, line.length, C.white); return cols; }
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
  }
  if (mode === 'plain') {
    for (const m of line.matchAll(/\b(?:pass|fail|unsure)\b/g)) paint(cols, m.index!, m.index! + m[0].length, m[0] === 'pass' ? C.green : m[0] === 'fail' ? C.red : C.amber);
    for (const m of line.matchAll(/\bMM3-\d+/g)) paint(cols, m.index!, m.index! + m[0].length, C.blue);
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

type Doc = { rows: string[]; first: number[]; count: number[] }; // rows as tspans; first row / row count of each source line
/** Wraps and colours a document; `first[i]`/`count[i]` say where source line i landed in rows. */
function layout(lines: string[], mode: Mode | ((i: number) => Mode)): Doc {
  const rows: string[] = [];
  const first: number[] = [];
  const count: number[] = [];
  lines.forEach((line, i) => {
    const cols = colourize(line, typeof mode === 'function' ? mode(i) : mode);
    const wrapped = wrapLine(line);
    first.push(rows.length);
    count.push(wrapped.length);
    let at = 0; // index into `line` of the next character the row consumes
    wrapped.forEach((w, k) => {
      if (k === 0) { rows.push(rowSpans(w, cols, 0, '')); at = w.length; }
      else {
        const hangLen = /^\s*/.exec(w)![0].length; // continuation rows start with the hanging pad
        while (line[at] === ' ') at++; // wrapLine dropped the break space
        rows.push(rowSpans(w.slice(hangLen), cols, at, w.slice(0, hangLen)));
        at += w.length - hangLen;
      }
    });
  });
  return { rows, first, count };
}

// ---------------------------------------------------------------- data: read from the scene, never typed

export type FreeOut = { cmd: string; out: string };
/** The frozen run (ledger row + request file, as `Scene`) plus the free `view`/`report` output captured beside it. */
export type StripScene = Scene & { free: FreeOut[] };
type Group = { name: string; fold: string; open: string; body: string[] }; // one collapsible request group: its folded and open header lines and the body under the open header
export type StripData = {
  shell: string; ask: string; tool: string; receipt: string[]; next: string;
  head: string[]; groups: [Group, Group, Group]; res: string[]; free: FreeOut[];
  claimEnd: number; // last head line of the claim band (the `where:` item)
  resBands: [number, number][]; // response bands in source lines: verdict, odds, consensus and next
};

const need = (lines: string[], re: RegExp, what: string, from = 0): number => {
  const i = lines.findIndex((l, k) => k >= from && re.test(l));
  if (i < 0) throw new Error(`strip: no ${what} in the scene YAML → the scene shape changed; update scripts/build-strip.ts`);
  return i;
};

/** Cost to one significant digit, as the terminal prints it: ~$0.00006. */
function shortCost(c: number, estimated: boolean): string {
  return c > 0 ? (estimated ? '~$' : '$') + c.toFixed(-Math.floor(Math.log10(c))) : fmtCost(c);
}

export function stripData(s: StripScene): StripData {
  const f = s.footer;
  const req = s.request.split('\n');
  const res = s.response.split('\n');
  const drill = /--from (\S+)/.exec(s.response)?.[1];
  if (!drill) throw new Error('strip: the response has no `next: ... --from <concern>` line');
  if (s.free.length !== 3) throw new Error('strip: the scene needs its three free outputs (view <row>, report mdl, view <request>) → tsx scripts/build-strip.ts extract --capture');
  const iAsk = need(req, /^ {2}ask:/, 'ask:');
  const iWhere = need(req, /^ {2}where:/, 'where:');
  const iCon = need(req, /^ {4}concerns:/, 'concerns:', iAsk);
  const iDec = need(req, /^ {4}decisions:/, 'decisions:', iCon);
  const iMdl = need(req, /^mdl:/, 'mdl:', iDec);
  const conBlock = req.slice(iCon, iDec);
  const decBlock = req.slice(iDec, iMdl);
  const mdlBlock = req.slice(iMdl);
  const cnt = (blk: string[], re: RegExp): number => blk.filter((l) => re.test(l)).length;
  const groups: [Group, Group, Group] = [
    { name: 'concerns', fold: `    concerns: ${FOLD} ${plural(cnt(conBlock, /^ {6}[\w-]+:$/), 'concern')} · ${plural(cnt(conBlock, /^ {8}\d+:/), 'question')}`, open: conBlock[0]!, body: conBlock.slice(1) },
    { name: 'decisions', fold: `    decisions: ${FOLD} ${plural(cnt(decBlock, /^ {6}[\w-]+:$/), 'decision')}`, open: decBlock[0]!, body: decBlock.slice(1) },
    { name: 'mdl', fold: `mdl: ${FOLD} ${plural(cnt(mdlBlock, /^ {2}[\w-]+:/), 'field')}`, open: mdlBlock[0]!, body: mdlBlock.slice(1) },
  ];
  const iId = need(res, /^ {2}id:/, 'id:'), iGoal = need(res, /^ {2}goal:/, 'goal:'), iCons = need(res, /^ {2}consensus:/, 'consensus:'), iNext = need(res, /^next:/, 'next:');
  return {
    shell: '~/n8n $ claude', ask: 'where would I make n8n faster?', tool: 'mm3 class review.yaml',
    receipt: [`${plural(f.questions, 'question')} · ${plural(f.calls, 'call')}`, `${f.latencyMs} ms · ${shortCost(f.costUsd, f.costEstimated)}`],
    next: `next: drill into ${drill}`,
    head: req.slice(0, iAsk + 1), groups, res, free: s.free, claimEnd: iWhere + 1,
    resBands: [[iId, iGoal], [iGoal + 1, iCons - 1], [iCons, iNext]],
  };
}

// ---------------------------------------------------------------- the value panel: what the highlighted element is worth

type Value = { title: string; bullets: string[] };
const VALUE = {
  claim: { title: 'THE CLAIM', bullets: ['One claim', 'Only your code', 'Fixed cost'] },
  concerns: { title: 'CONCERNS', bullets: ['Yes/no questions', 'Cheap models nail them'] },
  decisions: { title: 'DECISIONS', bullets: ["When yes/no isn't enough"] },
  mdl: { title: 'MDL', bullets: ['Why you asked', 'The ledger learns', 'Next time starts smarter'] },
  response: { title: 'RESPONSE', bullets: ['A verdict you can cite', 'Odds, not vibes', 'Finds where it breaks'] },
  next: { title: 'NEXT', bullets: ['Knows when to doubt itself', 'Tells you the next move'] },
  knowledge: { title: 'KNOWLEDGE', bullets: ['Every answer kept', 'Ask again: instant, free'] },
} satisfies Record<string, Value>;

// ---------------------------------------------------------------- geometry

type Rows = { rows: string[] };
type ReqLayout = { head: Doc; g: { fold: Rows; open: Rows; body: Rows; b: number }[]; nh: number };
function reqLayout(d: StripData): ReqLayout {
  const head = layout(d.head, 'yaml');
  const g = d.groups.map((x) => {
    const body = layout(x.body, 'yaml').rows;
    return { fold: { rows: layout([x.fold], 'yaml').rows }, open: { rows: layout([x.open], 'yaml').rows }, body: { rows: body }, b: body.length };
  });
  return { head, g, nh: head.rows.length };
}
/** Row of group i's header when the groups flagged in `open` are unfolded. */
const segRow = (r: ReqLayout, i: number, open: boolean[]): number => r.nh + i + r.g.slice(0, i).reduce((a, x, j) => a + (open[j] ? x.b : 0), 0);

export type Geometry = { height: number; viewRows: number; reqRows: number; resRows: number; knowRows: number; headRows: number; bodyRows: number[] };
function knowLines(d: StripData): { lines: string[]; modes: Mode[]; sec: [number, number][] } {
  const lines: string[] = [];
  const modes: Mode[] = [];
  const sec: [number, number][] = [];
  d.free.forEach((x, k) => {
    const a = lines.length;
    lines.push(`$ ${x.cmd}`); modes.push('cmd');
    for (const l of x.out.split('\n')) { lines.push(l); modes.push(k === 2 ? 'yaml' : 'plain'); }
    sec.push([a, lines.length - 1]);
    if (k < d.free.length - 1) { lines.push(''); modes.push('plain'); }
  });
  return { lines, modes, sec };
}

function geometry(d: StripData): Geometry {
  const r = reqLayout(d);
  const reqRows = Math.max(...[0, 1, 2].map((o) => r.nh + 3 + r.g[o]!.b));
  const resRows = layout(d.res, 'yaml').rows.length;
  const k = knowLines(d);
  const knowRows = layout(k.lines, (i) => k.modes[i]!).rows.length;
  const viewRows = Math.max(reqRows, resRows, knowRows);
  const height = Math.ceil((CLIP_TOP + viewRows * LH + 14 + 20) / 10) * 10;
  return { height, viewRows, reqRows, resRows, knowRows, headRows: r.nh, bodyRows: r.g.map((x) => x.b) };
}
/** The layout numbers of the strip built from this scene (height, visible rows, rows per document). */
export const stripGeometry = (s: StripScene): Geometry => geometry(stripData(s));

// ---------------------------------------------------------------- SMIL helpers

const EASE = '0.45 0 0.2 1'; // calm ease-in-out
const LIN = '0 0 1 1';
type V = number | string;
type KF = [t: number, v: V, ease?: string];
type Ch = [t0: number, t1: number, v: V, ease?: string];

/** Keyframes that hold `init`, then move to each change's value between its t0 and t1 (a change starts from wherever the last one ended). */
function tr(init: V, ...chs: Ch[]): KF[] {
  const out: KF[] = [[0, init]];
  let cur = init;
  for (const [t0, t1, v, e] of chs) {
    if (t0 > out.at(-1)![0]) out.push([t0, cur]);
    out.push([Math.max(t1, out.at(-1)![0] + 0.001), v, e]);
    cur = v;
  }
  return out;
}
/** Opacity: 0 until `a`, lit from a+fi to `b` (Infinity: stays), gone by b+fo. */
const win = (a: number, b = Infinity, fi = 0.4, fo = 0.4): KF[] => tr(0, [a, a + fi, 1], ...(b === Infinity ? [] : [[b, b + fo, 0] as Ch]));
/** `n` soft pulses of opacity up to `peak`, 0.75 s apart. */
const pulses = (t: number, n: number, peak: number): KF[] => tr(0, ...Array.from({ length: n }, (_, i): Ch[] => [[t + i * 0.75, t + i * 0.75 + 0.3, peak, '0.3 0 0.4 1'], [t + i * 0.75 + 0.3, t + i * 0.75 + 0.75, 0, '0.4 0 0.6 1']]).flat());

// ---------------------------------------------------------------- the timeline (seconds)

type Timeline = ReturnType<typeof timeline>;
/** The beats of the loop in seconds: what lands when, and the loop length `T`. */
function timeline() {
  return {
    typeShell: 0.8, // `claude` is typed
    boxIn: 2.8,
    typeAsk: 3.4,
    toolIn: 6.9,
    runIn: 7.4,
    fire: 7.9, // the call fires: the request tab pulses
    reqIn: 9.6, // the folded request fades in
    bandA: 10.2,
    hint: 10.2,
    ptrIn: 14.0, // the pointer appears and moves to concerns
    clickCon: 15.5, openCon: 15.65,
    clickDec: 21.2, openDec: 21.35,
    clickMdl: 27.1, openMdl: 27.25,
    clickResp: 33.6,
    respIn: 34.2,
    r2: 39.3,
    r3: 44.6,
    clickKnow: 49.7,
    knowIn: 50.4,
    k2: 55.8,
    k3: 61.2,
    end: 67.0, // fade out at the loop seam
    T: 67.8,
  };
}

/** Typing times: char k (1-based) appears at times[k-1]; pace is irregular but fixed (an integer LCG, never Math.random). */
function typing(n: number, t0: number, seed: number, text: string): number[] {
  let x = seed;
  let t = t0;
  return Array.from({ length: n }, (_, i) => {
    x = (Math.imul(x, 1103515245) + 12345) & 0x7fffffff;
    t += 0.055 + ((x >> 8) % 100) / 100 * 0.085 + (text[i - 1] === ' ' ? 0.06 : 0);
    return Math.round(t * 100) / 100;
  });
}

// ---------------------------------------------------------------- the SVG

const LEFT_X = 18;
const TERM_FS = 12;
const TERM_CW = TERM_FS * 0.6;
const ROW = { shell: 92, box: 116, ask: 135, tool: 194, res0: 220, res1: 240, next: 264 };

const POINTER = 'M0 0L0 15.6L3.9 12.2L6.4 18.6L9.1 17.5L6.6 11.3L11.5 11Z';
const attr = (o: Record<string, V | undefined>): string => Object.entries(o).filter(([, v]) => v !== undefined).map(([k, v]) => ` ${k}="${typeof v === 'number' ? n2(v) : v}"`).join('');

export function buildStrip(s: StripScene): string {
  const d = stripData(s);
  const g = geometry(d);
  const H = g.height;
  const TL = timeline();
  const T = TL.T;
  const r = reqLayout(d);
  const resDoc = layout(d.res, 'yaml');
  const kl = knowLines(d);
  const kDoc = layout(kl.lines, (i) => kl.modes[i]!);
  const build = (motion: boolean): string => {
    const id = motion ? '' : 'p'; // the frozen copy carries no ids, so none clash
    const frac = (t: number): string => String(Math.round(Math.min(1, Math.max(0, t / T)) * 100000) / 100000);
    /** One `<animate>` / `<animateTransform>` over the whole loop; empty in the frozen copy. */
    const an = (a: string, kfs: KF[], o: { kind?: 'transform'; discrete?: boolean } = {}): string => {
      if (!motion) return '';
      const list = kfs.slice();
      if (list.at(-1)![0] < T) list.push([T, list.at(-1)![1]]);
      const times: number[] = [];
      list.forEach(([t]) => times.push(Math.max(t, (times.at(-1) ?? -1) + 0.001)));
      times[0] = 0;
      times[times.length - 1] = T;
      const vals = list.map(([, v]) => (typeof v === 'number' ? n2(v) : v));
      const spl = list.slice(1).map(([, v, e], i) => e ?? (v === list[i]![1] ? LIN : EASE));
      const common = ` dur="${n2(T)}s" repeatCount="indefinite" values="${vals.join(';')}" keyTimes="${times.map(frac).join(';')}"`;
      const mode = o.discrete ? ' calcMode="discrete"' : ` calcMode="spline" keySplines="${spl.join(';')}"`;
      return o.kind === 'transform' ? `<animateTransform attributeName="transform" type="translate"${common}${mode}/>` : `<animate attributeName="${a}"${common}${mode}/>`;
    };
    const el = (tag: string, at: Record<string, V | undefined>, anims = '', inner = ''): string => (anims || inner ? `<${tag}${attr(at)}>${inner}${anims}</${tag}>` : `<${tag}${attr(at)}/>`);
    const o: string[] = [];

    // ------------- tabs
    const tabs = ['request', 'response', 'knowledge'] as const;
    const tabX: number[] = [];
    let tx = CODE_X;
    for (const t of tabs) { tabX.push(tx); tx += t.length * CW + 34; }
    const tabW = tabs.map((t) => t.length * CW);
    const RESP = 1;
    const tabClick = (i: number): [number, number] => [tabX[i]! + tabW[i]! / 2, TAB_Y - 5];
    const pulseAt = [TL.fire, TL.clickResp + 0.15, TL.clickKnow + 0.15];
    const pulseN = [3, 2, 2];
    tabs.forEach((t, i) => {
      const glow = (peak: number): KF[] => pulses(pulseAt[i]!, pulseN[i]!, peak);
      o.push(el('rect', { x: tabX[i]! - 10, y: TAB_Y - 18, width: tabW[i]! + 20, height: 27, rx: 7, fill: C.blue, opacity: 0 }, an('opacity', glow(0.2))));
      o.push(el('rect', { x: tabX[i]! - 10, y: TAB_Y - 18, width: tabW[i]! + 20, height: 27, rx: 7, fill: 'none', stroke: C.blue, 'stroke-width': 1.2, opacity: 0 }, an('opacity', glow(0.75))));
      o.push(el('text', { x: tabX[i], y: TAB_Y, 'font-size': FS, fill: C.dim, class: 'tab' }, '', t));
      const lit = i === 0 ? win(TL.fire, TL.clickResp + 0.15) : i === 1 ? win(TL.clickResp + 0.15, TL.clickKnow + 0.15) : win(TL.clickKnow + 0.15);
      o.push(el('text', { x: tabX[i], y: TAB_Y, 'font-size': FS, 'font-weight': 700, fill: C.blue, opacity: i === RESP ? 1 : 0, class: 'tab' }, an('opacity', lit), t));
    });
    const ux = tr(tabX[0]!, [TL.clickResp + 0.15, TL.clickResp + 0.75, tabX[1]!], [TL.clickKnow + 0.15, TL.clickKnow + 0.75, tabX[2]!]);
    const uw = tr(tabW[0]!, [TL.clickResp + 0.15, TL.clickResp + 0.75, tabW[1]!], [TL.clickKnow + 0.15, TL.clickKnow + 0.75, tabW[2]!]);
    o.push(el('rect', { x: tabX[RESP], y: TAB_Y + 8, width: tabW[RESP], height: 2, rx: 1, fill: C.blue, opacity: 1 }, an('x', ux) + an('width', uw) + an('opacity', win(TL.fire, Infinity, 0.3))));
    o.push(el('line', { x1: SPLIT, y1: TAB_Y + 14, x2: STRIP_W, y2: TAB_Y + 14, stroke: C.line }));
    if (motion) o.push(el('text', { x: STRIP_W - 18, y: TAB_Y, 'text-anchor': 'end', 'font-size': 11.5, 'font-family': SANS, 'font-style': 'italic', fill: C.dim, opacity: 0 }, an('opacity', win(TL.hint, TL.clickCon, 0.5, 0.4)), 'folded groups: collapsed to fit'));

    // ------------- viewport: band behind the documents
    const bx = SPLIT + 8, bw = STRIP_W - SPLIT - 16;
    const rowTop = (k: number): number => TOP + k * LH - 12;
    const bandRect = (a: number, z: number): [number, number] => [rowTop(a), (z - a + 1) * LH]; // rows a..z inclusive
    const closed = [false, false, false];
    const opn = (i: number): boolean[] => closed.map((_, j) => j === i);
    const claimA = r.head.first[1]!, claimZ = r.head.first[d.claimEnd]! + r.head.count[d.claimEnd]! - 1;
    const bandA = bandRect(claimA, claimZ);
    const grpBand = (i: number): [number, number] => bandRect(segRow(r, i, opn(i)), segRow(r, i, opn(i)) + r.g[i]!.b);
    const bCon = grpBand(0), bDec = grpBand(1), bMdl = grpBand(2);
    const rb = d.resBands.map(([a, z]) => bandRect(resDoc.first[a]!, resDoc.first[z]! + resDoc.count[z]! - 1)) as [number, number][];
    const kb = kl.sec.map(([a, z]) => bandRect(kDoc.first[a]!, kDoc.first[z]! + kDoc.count[z]! - 1)) as [number, number][];
    const EX = 0.85; // an unfold or fold takes this long
    const bandY = tr(rb[1]![0], [TL.bandA - 0.1, TL.bandA - 0.05, bandA[0]], [TL.openCon, TL.openCon + EX, bCon[0]], [TL.openDec, TL.openDec + EX, bDec[0]], [TL.openMdl, TL.openMdl + EX, bMdl[0]], [TL.respIn + 0.5, TL.respIn + 0.55, rb[0]![0]], [TL.r2, TL.r2 + 0.7, rb[1]![0]], [TL.r3, TL.r3 + 0.7, rb[2]![0]], [TL.knowIn + 0.5, TL.knowIn + 0.55, kb[0]![0]], [TL.k2, TL.k2 + 0.7, kb[1]![0]], [TL.k3, TL.k3 + 0.7, kb[2]![0]]);
    const bandH = tr(rb[1]![1], [TL.bandA - 0.1, TL.bandA - 0.05, bandA[1]], [TL.openCon, TL.openCon + EX, bCon[1]], [TL.openDec, TL.openDec + EX, bDec[1]], [TL.openMdl, TL.openMdl + EX, bMdl[1]], [TL.respIn + 0.5, TL.respIn + 0.55, rb[0]![1]], [TL.r2, TL.r2 + 0.7, rb[1]![1]], [TL.r3, TL.r3 + 0.7, rb[2]![1]], [TL.knowIn + 0.5, TL.knowIn + 0.55, kb[0]![1]], [TL.k2, TL.k2 + 0.7, kb[1]![1]], [TL.k3, TL.k3 + 0.7, kb[2]![1]]);
    const bandO = tr(1, [0.01, 0.02, 0], [TL.bandA, TL.bandA + 0.5, 1], [TL.clickResp, TL.clickResp + 0.4, 0], [TL.respIn + 0.5, TL.respIn + 1.0, 1], [TL.clickKnow, TL.clickKnow + 0.4, 0], [TL.knowIn + 0.5, TL.knowIn + 1.0, 1]);
    o.push(el('rect', { x: bx, y: rb[1]![0], width: bw, height: rb[1]![1], rx: 5, fill: C.green, 'fill-opacity': 0.07, stroke: C.green, 'stroke-opacity': 0.55, class: 'band' }, an('y', bandY) + an('height', bandH) + an('opacity', bandO)));

    // ------------- viewport documents (clipped to the viewport)
    const vp = `vp${id}`;
    if (motion) o.push(`<clipPath id="${vp}"><rect x="${SPLIT + 1}" y="${CLIP_TOP}" width="${STRIP_W - SPLIT - 2}" height="${g.viewRows * LH + 6}"/></clipPath>`);
    o.push(`<g${motion ? ` clip-path="url(#${vp})"` : ''}>`);
    const text = (k: number, spans: string, x = CODE_X): string => `<text x="${x}" y="${k * LH}" font-size="${FS}" fill="${C.ink}" xml:space="preserve">${spans}</text>`;
    const glyphX = (line: string): number => Math.max(CODE_X - 12, CODE_X + (/^\s*/.exec(line)![0].length - 2) * CW);
    if (motion) {
      // request: head, then three groups that fold and unfold
      const yPos = (i: number): KF[] => tr(TOP + segRow(r, i, closed) * LH, [TL.openCon, TL.openCon + EX, TOP + segRow(r, i, opn(0)) * LH], [TL.openDec, TL.openDec + EX, TOP + segRow(r, i, opn(1)) * LH], [TL.openMdl, TL.openMdl + EX, TOP + segRow(r, i, opn(2)) * LH]);
      const yStr = (i: number): KF[] => yPos(i).map(([t, v, e]): KF => [t, `0 ${n2(v as number)}`, e]);
      const reqOpen = [[TL.openCon, TL.openDec], [TL.openDec, TL.openMdl], [TL.openMdl, TL.clickResp]] as const;
      o.push(el('g', { opacity: 0 }, an('opacity', tr(0, [TL.reqIn, TL.reqIn + 0.6, 1], [TL.clickResp + 0.3, TL.clickResp + 0.8, 0])),
        el('g', { transform: `translate(0 ${TOP})` }, '', r.head.rows.map((sp, k) => text(k, sp)).join('')) +
        d.groups.map((gr, i) => {
          const gi = r.g[i]!;
          const [oa, oz] = reqOpen[i]!;
          const clip = `sg${i}`;
          const mark = `<text x="${glyphX(gr.open)}" y="0" font-size="${FS}" fill="${C.blue}" opacity="0">${'▾'}${an('opacity', tr(0, [oa, oa + 0.3, 1], [oz, oz + 0.3, 0]))}</text>`;
          return el('g', { transform: `translate(0 ${TOP + segRow(r, i, closed) * LH})` }, an('', yStr(i), { kind: 'transform' }),
            `<g opacity="1">${gi.fold.rows.map((sp) => text(0, sp)).join('')}${an('opacity', tr(1, [oa, oa + 0.25, 0], [oz + 0.4, oz + 0.7, 1]))}</g>` +
            `<g opacity="0">${gi.open.rows.map((sp) => text(0, sp)).join('')}${mark}${an('opacity', tr(0, [oa, oa + 0.25, 1], [oz, oz + 0.25, 0]))}</g>` +
            `<clipPath id="${clip}"><rect x="${SPLIT + 1}" y="4" width="${STRIP_W - SPLIT - 2}" height="0">${an('height', tr(0, [oa, oa + EX, gi.b * LH + 4], [oz, oz + EX, 0]))}</rect></clipPath>` +
            `<g clip-path="url(#${clip})">${gi.body.rows.map((sp, k) => text(k + 1, sp)).join('')}</g>`);
        }).join('')));
    }
    // response
    o.push(el('g', { opacity: 1 }, an('opacity', tr(0, [TL.respIn - 0.3, TL.respIn + 0.4, 1], [TL.clickKnow + 0.3, TL.clickKnow + 0.8, 0])),
      `<g transform="translate(0 ${TOP})">${resDoc.rows.map((sp, k) => text(k, sp)).join('')}</g>`));
    if (motion) o.push(el('g', { opacity: 0 }, an('opacity', tr(0, [TL.knowIn - 0.1, TL.knowIn + 0.5, 1])), `<g transform="translate(0 ${TOP})">${kDoc.rows.map((sp, k) => text(k, sp)).join('')}</g>`));
    o.push('</g>');

    // ------------- left column: the agent session
    const cur = (n: number): number => LEFT_X + n * TERM_CW;
    const shellT = typing(d.shell.length, TL.typeShell, 7, d.shell);
    const askT = typing(d.ask.length, TL.typeAsk, 91, d.ask);
    const shellTxt = (): string => `<text x="${LEFT_X}" y="${ROW.shell}" font-size="${TERM_FS}" xml:space="preserve"><tspan fill="${C.dim}">~/n8n $ </tspan><tspan fill="${C.white}">claude</tspan></text>`;
    o.push(el('g', { 'clip-path': motion ? `url(#sh${id})` : undefined }, '', shellTxt()));
    /** A discrete reveal: the clip's width steps up one character at each time. */
    const reveal = (times: number[], pad: number): KF[] => [[0, 0], ...times.map((tm, k): KF => [tm, (k + 1) * TERM_CW + pad])];
    if (motion) o.push(`<clipPath id="sh"><rect x="${LEFT_X - 2}" y="${ROW.shell - 14}" width="${d.shell.length * TERM_CW + 2}" height="20">${an('width', reveal(shellT, 2), { discrete: true })}</rect></clipPath>`);
    // prompt box + `>` + typed ask
    const boxO = win(TL.boxIn, Infinity, 0.5);
    o.push(el('rect', { x: 12, y: ROW.box, width: SPLIT - 24, height: 28, rx: 7, fill: 'none', stroke: C.line, opacity: 1 }, an('opacity', boxO)));
    o.push(el('text', { x: 24, y: ROW.ask, 'font-size': TERM_FS, fill: C.green, opacity: 1 }, an('opacity', boxO), '&gt;'));
    const askX = 24 + 2 * TERM_CW;
    o.push(el('text', { x: askX, y: ROW.ask, 'font-size': TERM_FS, fill: C.white, 'clip-path': motion ? 'url(#ak)' : undefined, 'xml:space': 'preserve' }, '', xe(d.ask)));
    if (motion) o.push(`<clipPath id="ak"><rect x="${n2(askX - 2)}" y="${ROW.ask - 14}" width="${d.ask.length * TERM_CW + 4}" height="20">${an('width', reveal(askT, 4), { discrete: true })}</rect></clipPath>`);
    // steady cursor: on the shell line while it types, then in the prompt box while the ask types, then gone
    if (motion) {
      const cx: KF[] = [[0, cur(0)], ...shellT.map((tm, k): KF => [tm, cur(k + 1)]), [TL.boxIn, askX], ...askT.map((tm, k): KF => [tm, askX + (k + 1) * TERM_CW])];
      const cy: KF[] = [[0, ROW.shell - 11], [TL.boxIn - 0.001, ROW.shell - 11], [TL.boxIn, ROW.ask - 11]];
      const endT = askT.at(-1)! + 0.9;
      o.push(el('rect', { x: cur(0), y: ROW.shell - 11, width: TERM_CW, height: 14, fill: C.green, opacity: 0 }, an('x', cx, { discrete: true }) + an('y', cy, { discrete: true }) + an('opacity', tr(0, [0.3, 0.301, 1], [endT, endT + 0.3, 0]))));
    }
    // the tool call and its result (glyphs drawn as shapes: ⏺ and ⎿ are missing from some system mono fonts)
    const toolO = win(TL.toolIn, Infinity, 0.5);
    o.push(el('g', { opacity: 1 }, an('opacity', toolO),
      `<circle cx="${LEFT_X + 4}" cy="${ROW.tool - 4}" r="3.6" fill="${C.green}"/>` +
      `<text x="${LEFT_X + 16}" y="${ROW.tool}" font-size="${TERM_FS}" xml:space="preserve"><tspan fill="${C.white}" font-weight="700">Bash</tspan><tspan fill="${C.dim}">(</tspan><tspan fill="${C.ink}">${xe(d.tool)}</tspan><tspan fill="${C.dim}">)</tspan></text>`));
    const bracket = (y: number): string => `<path d="M${LEFT_X + 7} ${y - 12}V${y - 4}H${LEFT_X + 14}" fill="none" stroke="${C.dim}" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>`;
    if (motion) o.push(el('g', { opacity: 0 }, an('opacity', tr(0, [TL.runIn, TL.runIn + 0.4, 1], [TL.respIn + 0.5, TL.respIn + 0.9, 0])), bracket(ROW.res0) + `<text x="${LEFT_X + 24}" y="${ROW.res0}" font-size="${TERM_FS}" fill="${C.dim}">Running…</text>`));
    const rx = LEFT_X + 24;
    o.push(el('g', { opacity: 1 }, an('opacity', tr(0, [TL.respIn + 0.5, TL.respIn + 1.0, 1])),
      bracket(ROW.res0) + `<text x="${rx}" y="${ROW.res0}" font-size="${TERM_FS}" fill="${C.ink}">${xe(d.receipt[0]!)}</text><text x="${rx}" y="${ROW.res1}" font-size="${TERM_FS}" fill="${C.ink}">${xe(d.receipt[1]!)}</text>`));
    o.push(el('text', { x: rx, y: ROW.next, 'font-size': TERM_FS, fill: C.green, opacity: 1 }, an('opacity', win(TL.r3 + 0.2, Infinity, 0.5)), xe(d.next)));

    // ------------- value panel
    const PH = 176;
    const PY = H - 20 - PH;
    const panelBox = el('rect', { x: 14, y: PY, width: SPLIT - 28, height: PH, rx: 10, fill: C.panel, stroke: C.line });
    o.push(panelBox);
    type Panel = { v: Value; a: number; b: number; at: number[] }; // window [a, b) and when each bullet lands
    const panels: Panel[] = [
      { v: VALUE.claim, a: TL.bandA + 0.1, b: TL.openCon + 0.2, at: [TL.bandA + 0.5, TL.bandA + 1.6, TL.bandA + 2.7] },
      { v: VALUE.concerns, a: TL.openCon + 0.2, b: TL.openDec + 0.2, at: [TL.openCon + 0.6, TL.openCon + 1.8] },
      { v: VALUE.decisions, a: TL.openDec + 0.2, b: TL.openMdl + 0.2, at: [TL.openDec + 0.6] },
      { v: VALUE.mdl, a: TL.openMdl + 0.2, b: TL.clickResp + 0.3, at: [TL.openMdl + 0.6, TL.openMdl + 1.7, TL.openMdl + 2.8] },
      { v: VALUE.response, a: TL.respIn + 0.5, b: TL.r3 + 0.1, at: [TL.respIn + 0.9, TL.r2 + 0.5, TL.r2 + 1.6] },
      { v: VALUE.next, a: TL.r3 + 0.1, b: TL.clickKnow + 0.3, at: [TL.r3 + 0.5, TL.r3 + 1.6] },
      { v: VALUE.knowledge, a: TL.knowIn + 0.5, b: Infinity, at: [TL.knowIn + 0.9, TL.k3 + 0.5] },
    ];
    const POSTER_PANEL = 4;
    panels.forEach((p, pi) => {
      const on = pi === POSTER_PANEL;
      const pw = p.b === Infinity ? win(p.a, Infinity, 0.4) : win(p.a, p.b, 0.4, 0.35);
      const bullets = p.v.bullets.map((b, k) => el('g', { opacity: 1 }, an('opacity', win(p.at[k]!, Infinity, 0.5)),
        `<circle cx="34" cy="${PY + 60 + k * 30 - 4.5}" r="3" fill="${C.green}"/><text x="46" y="${PY + 60 + k * 30}" font-size="13.5" font-weight="600" font-family="${SANS}" fill="${C.white}">${xe(b)}</text>`));
      if (!motion && !on) return;
      o.push(el('g', { opacity: on ? 1 : 0 }, an('opacity', pw),
        `<text x="30" y="${PY + 32}" font-size="10.5" font-weight="700" letter-spacing="1.6" font-family="${SANS}" fill="${C.blue}">${xe(p.v.title)}</text>` + bullets.join('')));
    });

    // ------------- the pointer and its clicks
    if (motion) {
      const tip = (k: number, dx: number): [number, number] => [CODE_X + dx * CW + CW / 2, TOP + k * LH - 4];
      const conP = tip(segRow(r, 0, closed), d.groups[0]!.fold.indexOf(FOLD));
      const decP = tip(segRow(r, 1, opn(0)), d.groups[1]!.fold.indexOf(FOLD));
      const mdlP = tip(segRow(r, 2, opn(1)), d.groups[2]!.fold.indexOf(FOLD));
      const respP = tabClick(1), knowP = tabClick(2);
      const hover = (b: [number, number], x: number): [number, number] => [x, b[0] + b[1] / 2 + 4];
      const start: [number, number] = [STRIP_W - 150, TOP + 3 * LH];
      const stops: [number, number, [number, number]][] = [
        [TL.ptrIn, TL.clickCon - 0.2, conP],
        [TL.clickDec - 1.5, TL.clickDec - 0.2, decP],
        [TL.clickMdl - 1.5, TL.clickMdl - 0.2, mdlP],
        [TL.clickResp - 1.6, TL.clickResp - 0.2, respP],
        [TL.clickResp + 1.0, TL.respIn + 1.6, hover(rb[0]!, 700)],
        [TL.r2, TL.r2 + 0.7, hover(rb[1]!, 700)],
        [TL.r3, TL.r3 + 0.7, hover(rb[2]!, 700)],
        [TL.clickKnow - 1.5, TL.clickKnow - 0.2, knowP],
        [TL.clickKnow + 1.0, TL.knowIn + 1.6, hover(kb[0]!, 790)],
        [TL.k2, TL.k2 + 0.7, hover(kb[1]!, 790)],
        [TL.k3, TL.k3 + 0.7, hover(kb[2]!, 790)],
      ];
      const pos: KF[] = tr(`${start[0]} ${start[1]}`, ...stops.map(([a, z, p]): Ch => [a, z, `${n2(p[0])} ${n2(p[1])}`]));
      o.push(el('g', { opacity: 0, transform: `translate(${start[0]} ${start[1]})`, id: 'pointer', class: 'pointer' }, an('', pos, { kind: 'transform' }) + an('opacity', tr(0, [TL.ptrIn - 0.4, TL.ptrIn, 1])),
        `<path d="${POINTER}" transform="translate(1.2 1.6)" fill="#000" fill-opacity=".38"/><path d="${POINTER}" fill="${C.white}" stroke="#0b1424" stroke-width="1.1" stroke-linejoin="round"/>`));
      const ripple = (p: [number, number], t: number): void => {
        o.push(el('circle', { cx: p[0], cy: p[1], r: 2, fill: 'none', stroke: C.blue, 'stroke-width': 1.6, opacity: 0, class: 'ripple' },
          an('r', tr(2, [t, t + 0.55, 19, '0.2 0.6 0.3 1'])) + an('opacity', tr(0, [t, t + 0.01, 0.9], [t + 0.01, t + 0.6, 0]))));
      };
      ripple(conP, TL.clickCon); ripple(decP, TL.clickDec); ripple(mdlP, TL.clickMdl); ripple(respP, TL.clickResp); ripple(knowP, TL.clickKnow);
    }
    return o.join('\n');
  };

  const out: string[] = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${STRIP_W}" height="${H}" viewBox="0 0 ${STRIP_W} ${H}" role="img" aria-label="${xe('MM3 on n8n: an agent runs one quick class request; the request, response and knowledge tabs open one after the other')}">`);
  out.push(`<title>MM3 on n8n</title><desc>${xe(`A real run (${s.id}): ${stripData(s).receipt.join(' · ')}, then ${stripData(s).next}. The request unfolds group by group (concerns, decisions, mdl), then the response and the knowledge the ledger now holds.`)}</desc>`);
  out.push(`<style>svg{font-family:${MONO}}text{white-space:pre}.still{display:none}@media (prefers-reduced-motion:reduce){.motion{display:none}.still{display:inline}}</style>`);
  out.push(`<rect width="${STRIP_W}" height="${H}" rx="14" fill="${C.bg}"/>`);
  const frame = `<text x="${LEFT_X}" y="${TAB_Y}" font-size="17" font-weight="700" font-family="${SANS}" fill="${C.white}">MM<tspan fill="${C.green}">3</tspan></text><line x1="${SPLIT}" y1="14" x2="${SPLIT}" y2="${H - 20}" stroke="${C.line}"/>`;
  out.push(`<g class="still">${frame}\n${build(false)}</g>`);
  out.push(`<g class="motion">${frame}\n${build(true)}`);
  // the loop seam: everything fades to the ground and back, once
  out.push(`<rect width="${STRIP_W}" height="${H}" rx="14" fill="${C.bg}" opacity="0" class="seam"><animate attributeName="opacity" dur="${n2(T)}s" repeatCount="indefinite" calcMode="spline" values="1;0;0;1" keyTimes="0;${(0.7 / T).toFixed(5)};${((TL.end) / T).toFixed(5)};1" keySplines="${EASE};${LIN};${EASE}"/></rect>`);
  out.push('</g>');
  out.push(`<rect x=".5" y=".5" width="${STRIP_W - 1}" height="${H - 1}" rx="14" fill="none" stroke="${C.line}"/>`);
  out.push('</svg>');
  return out.join('\n');
}

/** The strip's timeline (seconds): the loop length `T` and when each beat lands; for tests and the stills. */
export const stripTimeline = (): Timeline => timeline();

// ---------------------------------------------------------------- committed data in, one-time extract out

const STRIP_SCENE = 'docs/demo/scenes/strip-n8n.json';

export function stripScene(file = STRIP_SCENE): StripScene {
  return JSON.parse(readFileSync(file, 'utf8')) as StripScene;
}

/** The free, read-only commands whose real output the knowledge tab shows: the run's own row, what the ledger now holds about mdl, and the same request looked up again (a reuse check, no call). */
export function freeCommands(rowId: string, requestFile: string): { show: string; args: string[] }[] {
  return [
    { show: `mm3 view ${rowId}`, args: ['view', rowId] },
    { show: 'mm3 report mdl', args: ['report', 'mdl'] },
    { show: 'mm3 view review.yaml', args: ['view', requestFile] },
  ];
}

/** One-time, free: freezes one class run of a play area (ledger row + the request file that produced it, both checked against each other) into the strip's scene file, with the same path scrub as the player's scenes; `capture` also runs the free `view` / `report` commands of the play area's own `bin/mm3` and freezes their output. */
export function extractStrip(play: string, rowId: string, requestFile: string, out = STRIP_SCENE, capture = false): StripScene {
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
  const base = extractScene(row, yaml, { story: 'strip', n: 1, pin: tags[0] ?? `n8n @${(row.commit ?? '').slice(0, 7)}`, run: runs.indexOf(row) + 1, of: runs.length, children: runs.filter((r) => r.parent === rowId).map((r) => r.id ?? ''), play });
  const free: FreeOut[] = [];
  if (capture) {
    const bin = path.join(play, 'bin', 'mm3');
    if (!existsSync(bin)) throw new Error(`✖ capture: ${path.basename(play)}/bin/mm3 not found → run extract with the play area that holds the CLI wrapper`);
    for (const c of freeCommands(rowId, requestFile)) {
      const p = spawnSync(bin, c.args, { cwd: repo, encoding: 'utf8' });
      if (p.status !== 0 || !p.stdout.trim()) throw new Error(`✖ capture: ${c.show} failed (exit ${p.status}) → run it by hand in the play area and read its message`);
      free.push({ cmd: c.show, out: scrubPaths(p.stdout.replace(/\s+$/, ''), play) });
    }
  }
  const scene: StripScene = { ...base, free };
  writeFileSync(out, JSON.stringify(scene, null, 2) + '\n');
  return scene;
}

/** A page for the visual check: the animated SVG inline, paused and set to time `t` (SMIL `setCurrentTime`). */
export function stillHtml(svg: string, t: number): string {
  return `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#050914">${svg}<script>const s=document.querySelector('svg');s.pauseAnimations();s.setCurrentTime(${t});</script></body>`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (k: string): string | undefined => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : undefined; };
  if (process.argv[2] === 'extract') {
    const play = arg('--play'), request = arg('--request');
    if (!play || !request) { console.log('✖ extract: --play and --request are required → tsx scripts/build-strip.ts extract --play <play-area> --request <request.yaml> [--row MM3-0008] [--capture]'); process.exit(1); }
    const sc = extractStrip(play, arg('--row') ?? 'MM3-0008', request, STRIP_SCENE, process.argv.includes('--capture'));
    console.log(`strip scene: ${STRIP_SCENE} ${sc.id} ${sc.verb} ${sc.footer.questions} questions ${sc.footer.latencyMs} ms ${sc.footer.pin} free outputs ${sc.free.length}`);
  } else if (process.argv[2] === '--stills') {
    const dir = process.argv[3] ?? '.';
    mkdirSync(dir, { recursive: true });
    const svg = buildStrip(stripScene());
    const tl = timeline();
    const marks: [string, number][] = [['t0', 0.3], ['typing', 4.6], ['tool', 7.6], ['pulse', 8.6], ['folded', tl.bandA + 3.4], ['con', tl.openCon + 3.5], ['dec', tl.openDec + 3.5], ['mdl', tl.openMdl + 3.5], ['resp1', tl.respIn + 3.5], ['resp2', tl.r2 + 3.5], ['resp3', tl.r3 + 3.5], ['know1', tl.knowIn + 3.5], ['know2', tl.k2 + 3.5], ['know3', tl.k3 + 3.5], ['click', tl.clickDec + 0.1], ['seam', tl.end + 0.3]];
    for (const [name, t] of marks) writeFileSync(path.join(dir, `${name}.html`), stillHtml(svg, t));
    writeFileSync(path.join(dir, 'poster.svg'), svg.replace(/<g class="motion">[\s\S]*<\/g>\n<rect x="\.5"/, '<rect x=".5"').replace('.still{display:none}', '.still{display:inline}'));
    console.log(`strip stills → ${dir}: ${marks.map(([n, t]) => `${n}@${n2(t)}`).join(' ')}`);
  } else {
    const svg = buildStrip(stripScene());
    const outFile = 'docs/assets/demo-strip-n8n.svg';
    writeFileSync(outFile, svg + '\n');
    const tl = timeline();
    console.log(`strip: ${outFile} ${Buffer.byteLength(svg)} bytes, loop ${tl.T} s (from ${STRIP_SCENE}, no ledger read)`);
  }
}
