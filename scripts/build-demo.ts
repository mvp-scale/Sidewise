/**
 * The demo player's data and markup: real MM3 runs (kept as frozen scene JSON in docs/demo/scenes/) shown as a split
 * panel, terminal and request YAML beside a colour-coded verdict. Every scene's footer (model, endpoint, latency,
 * cost, id) is read from the run's own ledger row by `extract`, never typed. The default mode and the site build
 * read only the committed JSON, so a re-render never spends. `gif` renders the README's animated player in headless
 * Chrome (CDP over a WebSocket, no npm dependency) and ffmpeg; both are machine tools, not part of CI.
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parse } from 'yaml';

export type Scene = {
  id: string; verb: string; title: string; prompt: string; promptSource: string; command: string; request: string; response: string;
  footer: { model: string; endpoint: string; latencyMs: number; costUsd: number; costEstimated: boolean; questions: number; reused: number; reusedFrom: string; calls: number; date: string; subject: string };
};

const esc = (s: string): string => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

/** Cost with two significant digits: $0.000048, $0.00056. */
export function fmtCost(c: number, estimated = false): string {
  if (!(c > 0)) return '$0';
  return (estimated ? '~$' : '$') + c.toFixed(Math.max(2, 1 - Math.floor(Math.log10(c))));
}

/** Questions as the footer states them: what was sent to the model, and any answers reused from an earlier run. */
function questionsText(f: Scene['footer']): string {
  return f.reused > 0 ? `${f.questions} asked · ${f.reused} reused from ${f.reusedFrom}` : `${f.questions} question${f.questions === 1 ? '' : 's'}`;
}

/** The one footer string, shown under each panel and checked against the site and README. */
export function sceneFooter(s: Scene): string {
  const f = s.footer;
  return [f.model, f.endpoint, `${f.latencyMs} ms`, fmtCost(f.costUsd, f.costEstimated), questionsText(f), `${f.calls} call${f.calls === 1 ? '' : 's'}`, s.id].join(' · ');
}

/** The README/site label for a frozen response: the footer's model, endpoint, latency and cost. */
export function sceneLabel(s: Scene): string {
  const f = s.footer;
  return `real output · ${f.model} · ${f.endpoint} · ${f.latencyMs} ms · ${fmtCost(f.costUsd, f.costEstimated)}`;
}

/** Relabels the scratch checkout's paths (they are OWASP NodeGoat's) and drops any absolute machine path. */
export function scrubPaths(text: string): string {
  return text
    .replaceAll('stage/NodeGoat/', '')
    .replace(/(?:\/(?:home|Users|root|tmp|var|mnt)\/[^\s,'"\]}]+)+/g, '<path>')
    .replace(/[\w./-]*mm3labs-play[\w./-]*/g, '<path>');
}

type Row = { id?: string; verb?: string; ts?: string; model?: string; baseURL?: string; costUsd?: number; response?: string; telemetry?: { source?: string; from?: string; latencyMs?: number | null; questions?: number; costUsd?: number | null; costEstimated?: boolean }[] };

/** One ledger row plus its request text becomes a scene; footer fields come from the row, summed over its provider calls. */
export function extractScene(row: object, requestYaml: string, meta: { title: string; prompt: string; promptSource: string; subject: string }): Scene {
  const r = row as Row;
  const calls = (r.telemetry ?? []).filter((t) => t.source === undefined || t.source === 'provider');
  const cached = (r.telemetry ?? []).filter((t) => t.source === 'cache');
  const host = ((): string => { try { return new URL(r.baseURL ?? '').host; } catch { return r.baseURL ?? ''; } })();
  const verb = r.verb ?? '';
  return {
    id: r.id ?? '', verb, title: meta.title, prompt: meta.prompt, promptSource: meta.promptSource,
    command: `mm3 ${verb} request.yaml`,
    request: scrubPaths(requestYaml.replace(/\s+$/, '')),
    response: scrubPaths((r.response ?? '').replace(/\s+$/, '')),
    footer: {
      model: r.model ?? '', endpoint: host,
      latencyMs: calls.reduce((n, t) => n + (t.latencyMs ?? 0), 0),
      costUsd: r.costUsd ?? calls.reduce((n, t) => n + (t.costUsd ?? 0), 0),
      costEstimated: calls.some((t) => t.costEstimated === true),
      questions: calls.reduce((n, t) => n + (t.questions ?? 0), 0),
      reused: cached.reduce((n, t) => n + (t.questions ?? 0), 0), reusedFrom: [...new Set(cached.map((t) => t.from ?? ''))].filter(Boolean).join(', '),
      calls: calls.length,
      date: (r.ts ?? '').slice(0, 10), subject: meta.subject,
    },
  };
}

// ---------------------------------------------------------------- the request pane

const inline = (s: string): string => esc(s).replace(/\{(file|part|story)\}/g, '<span class="ph">{$1}</span>');

/** The request YAML with keys, question numbers and `pass:` highlighted; each numbered question is a focusable line the verdict links back to. */
export function highlightRequest(yaml: string): string {
  return yaml.split('\n').map((line) => {
    let m = /^(\s*)(\d+):(.*)$/.exec(line);
    if (m) {
      const [, ind, n, rest] = m;
      return `<span class="ln rq" data-q="${n}" tabindex="0" title="${esc(line.trim())}">${esc(ind!)}<span class="qn">${n}</span>:${inline(rest!)}</span>`;
    }
    m = /^(\s*(?:- )?)([A-Za-z_][\w-]*):(.*)$/.exec(line);
    if (m) {
      const [, ind, key, rest] = m;
      const cls = key === 'pass' ? 'yk pass' : ind === '' ? `yk ytop ytop-${key}` : 'yk';
      return `<span class="ln">${esc(ind!)}<span class="${cls}">${esc(key!)}</span>:${inline(rest!)}</span>`;
    }
    return `<span class="ln">${inline(line) || '&nbsp;'}</span>`;
  }).join('');
}

// ---------------------------------------------------------------- the verdict pane

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isQ = (k: string): boolean => /^\d+$/.test(k);
const gateOf = (v: unknown): 'pass' | 'fail' | 'unsure' | '' => (v === 'pass' || v === 'fail' || v === 'unsure' ? v : '');
const pTxt = (p: number): string => (p === 1 ? '1' : p.toFixed(2));
const plainVal = (v: unknown): string => Array.isArray(v) ? (v.length ? v.map(plainVal).join(', ') : 'none') : isObj(v) ? Object.entries(v).map(([k, x]) => `${k} ${plainVal(x)}`).join(' · ') : String(v);

/** One numbered answer: its number (linked to the request), a p bar and the value; a choice also shows its top pick. */
function qChip(n: string, v: unknown): string {
  const top = isObj(v) && typeof v.top === 'string' ? v.top : '';
  const p = typeof v === 'number' ? v : isObj(v) && typeof v.p === 'number' ? v.p : NaN;
  if (Number.isNaN(p)) return '';
  return `<span class="q${top ? ' dec' : ''}" data-q="${n}" title="question ${n}: p ${pTxt(p)}${top ? ` (${esc(top)})` : ''}"><span class="qn">${n}</span>${top ? `<span class="pick">${esc(top)}</span>` : ''}<span class="pb" style="--p:${p}"></span><b>${pTxt(p)}</b></span>`;
}
/** A mini bar for a ranked row: one thin bar per numbered answer. */
function miniBar(n: string, v: unknown): string {
  const p = typeof v === 'number' ? v : isObj(v) && typeof v.p === 'number' ? v.p : NaN;
  return Number.isNaN(p) ? '' : `<i class="pb mini" data-q="${n}" style="--p:${p}" title="question ${n}: p ${pTxt(p)}"></i>`;
}
const chip = (g: string, text = g): string => `<span class="chip ${g}">${esc(text)}</span>`;
const qref = (v: unknown): string => (Array.isArray(v) ? v.map((n) => `<span class="qref" data-q="${esc(String(n))}">${esc(String(n))}</span>`).join('') : '');

/** Category row: gate chip + a bar per numbered answer. */
function catRow(name: string, o: Obj): string {
  const g = gateOf(o.gate);
  const qs = Object.entries(o).filter(([k]) => isQ(k)).map(([k, v]) => qChip(k, v)).join('');
  if (typeof o.before === 'string' || typeof o.after === 'string') {
    const still = qref(o.still), fixed = qref(o.fixed);
    return `<div class="vrow ${gateOf(o.after)}"><span class="cat">${esc(name)}</span><span class="ba">${chip(gateOf(o.before), String(o.before))}<span class="arr" aria-label="became">&rarr;</span>${chip(gateOf(o.after), String(o.after))}</span>`
      + `<span class="fx">${fixed ? `<em>fixed</em>${fixed}` : ''}${still ? `<em>still</em>${still}` : ''}<b class="probes">${esc(String(o.probes ?? ''))}</b></span></div>`;
  }
  const p = typeof o.p === 'number' ? `<span class="q goalp"><span class="pb" style="--p:${o.p}"></span><b>${pTxt(o.p)}</b></span>` : '';
  return `<div class="vrow ${g}"><span class="cat">${esc(name)}</span>${chip(g)}<span class="qs">${qs}${p}</span></div>`;
}

/** Ranked rows for a scan or loop: a dot per concern, a mini bar per numbered answer. */
function unitRows(units: Obj): string {
  return Object.entries(units).map(([name, raw], i) => {
    const o = isObj(raw) ? raw : {};
    const gates = Object.entries(o).filter(([, v]) => gateOf(v));
    const worst = gates.some(([, v]) => v === 'fail') ? 'fail' : gates.some(([, v]) => v === 'unsure') ? 'unsure' : 'pass';
    const dots = gates.map(([k, v]) => `<i class="dot ${v}" title="${esc(k)}: ${v}"></i>`).join('');
    const bars = Object.entries(o).filter(([k]) => isQ(k)).map(([k, v]) => miniBar(k, v)).join('');
    return `<div class="urow ${worst}"><span class="rk">${i + 1}</span><span class="unit" title="${esc(name)}">${esc(name)}</span><span class="dots">${dots}</span><span class="mini-bars">${bars}</span></div>`;
  }).join('');
}

/** The verdict pane: gate, consensus, escalate, a row per concern (or ranked unit), and `next` called out. Falls back to plain text if the response is not YAML. */
export function renderVerdict(s: Scene): string {
  let doc: unknown;
  try { doc = parse(s.response); } catch { doc = null; }
  const mak = isObj(doc) && isObj(doc.mak) ? doc.mak : null;
  if (!mak || !isObj(doc)) return `<div class="verdict-body"><pre class="plainresp">${esc(s.response)}</pre></div>`;
  const gate = gateOf(mak.gate);
  const f = s.footer;
  const head = `<div class="vhead"><span class="big-gate ${gate}"><small>gate</small>${esc(String(mak.gate ?? ''))}</span>`
    + `<span class="vmeta">${mak.consensus ? `<span class="cons cons-${esc(String(mak.consensus).toLowerCase())}"><small>consensus</small>${esc(String(mak.consensus))}</span>` : ''}`
    + `${typeof mak.escalate === 'boolean' ? `<span class="esc ${mak.escalate ? 'on' : 'off'}"><small>escalate</small>${mak.escalate}</span>` : ''}</span>`
    + `<span class="vstat${f.questions >= 50 ? ' burst' : ''}"><b>${f.questions}</b> question${f.questions === 1 ? '' : 's'}${f.reused > 0 ? ` <span>+</span> <b>${f.reused}</b> reused` : ''} <span>&middot;</span> <b>${f.calls}</b> call${f.calls === 1 ? '' : 's'} <span>&middot;</span> <b>${f.latencyMs}</b> ms</span></div>`;
  const rows: string[] = [];
  const facts: string[] = [];
  for (const [k, v] of Object.entries(mak)) {
    if (['id', 'gate', 'consensus', 'escalate'].includes(k)) continue;
    if (k === 'failing' && isObj(v)) rows.push(`<div class="ranked" role="list" aria-label="ranked, worst first"><div class="rank-h">ranked, worst first</div>${unitRows(v)}</div>`);
    else if (isObj(v) && ('gate' in v || 'before' in v || 'after' in v)) rows.push(catRow(k, v));
    else facts.push(`<span class="fact"><em>${esc(k)}</em>${esc(plainVal(v))}</span>`);
  }
  const mdl = isObj(doc.mdl) && Array.isArray(doc.mdl.recorded) ? `<span class="learn"><em>ledger learned</em>${esc(doc.mdl.recorded.join(', '))}</span>` : '';
  const notes = Array.isArray(doc.notes) ? `<p class="vnotes">${esc(doc.notes.join(' · '))}</p>` : '';
  const next = typeof doc.next === 'string' ? `<div class="vnext"><span class="lbl">next</span><code>${esc(doc.next)}</code></div>` : '';
  return `<div class="verdict-body">${head}${next}${rows.join('')}${facts.length ? `<div class="facts">${facts.join('')}</div>` : ''}${mdl}${notes}</div>`;
}

// ---------------------------------------------------------------- the player

const FAMILY: Record<string, string> = { view: 'mak', class: 'mak', replay: 'mak', scan: 'mdl', drill: 'mdl', loop: 'mdl' };

/** One scene as a split panel. `phase` (0-3) is set only for the README frames; the page shows everything. */
export function renderScene(s: Scene, opts: { phase?: number; hidden?: boolean } = {}): string {
  const fam = FAMILY[s.verb] ?? 'mak';
  const phase = opts.phase === undefined ? '' : ` data-phase="${opts.phase}"`;
  return `<article class="pscene fam-${fam}" id="scene-${esc(s.id)}" data-scene="${esc(s.id)}" data-verb="${esc(s.verb)}" data-title="${esc(s.title)}"${phase}${opts.hidden ? ' hidden' : ''}>
  <header class="phead"><h3>${esc(s.title)}</h3><ol class="flow" aria-label="the flow"><li>prompt</li><li>request</li><li>verdict</li><li>next</li></ol></header>
  <div class="pgrid">
    <div class="pleft">
      <section class="term" aria-label="terminal"><div class="tbar"><i></i><i></i><i></i><span>${esc(s.footer.subject)} &middot; via the mm3 tool, shown as CLI</span></div>
<pre class="tbody"><span class="tc" data-full="${esc(s.prompt)}"># ${esc(s.prompt)}</span>\n<span class="tcmd"><span class="ps">$</span> ${esc(s.command)}</span></pre></section>
      <section class="req" aria-label="request YAML"><div class="pane-h"><span>request.yaml</span><em>hover a question</em></div><div class="reqbody">${highlightRequest(s.request)}</div></section>
    </div>
    <section class="verdict" aria-label="verdict"><div class="pane-h"><span>verdict <b>${esc(s.id)}</b></span><em>bar = p</em></div>${renderVerdict(s)}</section>
  </div>
  <p class="pfoot"><span class="real">real run</span> <span class="pf">${esc(sceneFooter(s))}</span> <span class="pdate">${esc(s.footer.date)}</span> <span class="psrc">prompt: ${esc(s.promptSource)} &middot; counts include the goal question</span></p>
  <details class="raw"><summary>Exact request and response text</summary><pre class="rawcode"><code>${esc(s.request)}</code></pre><pre class="rawcode"><code>${esc(s.response)}</code></pre></details>
</article>`;
}

/** The whole player: a tab per scene, all scenes stacked when there is no script (player.js turns them into tabs). */
export function renderPlayer(scenes: Scene[]): string {
  const tabs = scenes.map((s) => `<a class="ptab" href="#scene-${esc(s.id)}">${esc(s.verb)}</a>`).join('');
  return `<div class="player" data-player>
  <p class="pintro">Five real runs on OWASP NodeGoat, from prompt to verdict. Each prompt is the task the agent was given; each verdict and footer is read from that run&rsquo;s own ledger row.</p>
  <nav class="ptabs" aria-label="Scenes">${tabs}</nav>
  <div class="pscenes">
${scenes.map((s) => renderScene(s)).join('\n')}
  </div>
  <div class="pctl" hidden><button type="button" data-prev>&larr; Previous</button><button type="button" data-replay>Replay</button><button type="button" data-next>Next &rarr;</button></div>
</div>`;
}

// ---------------------------------------------------------------- scenes on disk

const SCENE_DIR = 'docs/demo/scenes';
export function loadScenes(dir = SCENE_DIR): Scene[] {
  return readdirSync(dir).filter((f) => f.endsWith('.json')).sort().map((f) => JSON.parse(readFileSync(path.join(dir, f), 'utf8')) as Scene);
}

/** The scenes, request files and task numbers the one-time extract uses (ids are the smoke-round NodeGoat runs; `task` is the item in notes/QUESTIONS.md that produced the run). */
const PICKS: { n: string; id: string; file: string; title: string; task: number }[] = [
  { n: '01-class', id: 'MM3-0001', file: '02-class-contrib.yaml', title: 'One verdict for one subject', task: 2 },
  { n: '02-scan', id: 'MM3-0002', file: '03-scan-routes-c.yaml', title: 'Sweep a folder, worst file first', task: 3 },
  { n: '03-drill', id: 'MM3-0004', file: '05-drill-contrib-injection.yaml', title: 'Found: dig into the weak spot', task: 5 },
  { n: '04-replay', id: 'MM3-0005', file: '06-replay-fix.yaml', title: 'Fixed, and proven', task: 6 },
  { n: '05-loop', id: 'MM3-0007', file: '08-loop-pwreset-bank-b.yaml', title: 'Vet the design before code', task: 8 },
];

/** The numbered items of a QUESTIONS file, verbatim (wrapped lines joined); an item over 160 characters is cut to its first sentence and marked with an ellipsis. */
export function taskItems(md: string): Map<number, string> {
  const items = new Map<number, string>();
  const body = md.split(/\n## /)[0]!;
  for (const m of body.matchAll(/^(\d+)\. ([\s\S]*?)(?=\n\d+\. |\n\n|(?![\s\S]))/gm)) {
    const text = m[2]!.replace(/\s*\n\s*/g, ' ').trim();
    const first = /^.*?[.?!](?=\s|$)/.exec(text)?.[0] ?? text;
    items.set(+m[1]!, text.length > 160 && first.length < text.length ? `${first} …` : text);
  }
  return items;
}

/** One-time, free: reads the play ledger and request files, checks each request's goal against its row, writes the scene JSON. */
export function extractAll(ledger: string, requestsDir: string, questions: string, outDir = SCENE_DIR): string[] {
  const rows = readFileSync(ledger, 'utf8').trim().split('\n').map((l) => JSON.parse(l) as Row & { kind?: string; goal?: string });
  const tasks = taskItems(readFileSync(questions, 'utf8'));
  mkdirSync(outDir, { recursive: true });
  const out: string[] = [];
  for (const p of PICKS) {
    const row = rows.find((r) => r.kind === 'run' && r.id === p.id);
    if (!row) throw new Error(`✖ ledger: no run ${p.id} → point --ledger at the smoke-round ledger`);
    const yaml = readFileSync(path.join(requestsDir, p.file), 'utf8');
    if (!tasks.has(p.task)) throw new Error(`✖ ${questions}: no item ${p.task} → point --questions at the round's QUESTIONS.md`);
    const goal = ((parse(yaml) as { mak?: { goal?: string } }).mak?.goal ?? '').trim();
    if (goal !== (row.goal ?? '').trim()) throw new Error(`✖ ${p.file}: goal does not match ${p.id} → pick the request file whose mak.goal is the row's goal`);
    const scene = extractScene(row, yaml, { title: p.title, prompt: tasks.get(p.task) ?? '', promptSource: `smoke-test task ${p.task}`, subject: 'OWASP NodeGoat' });
    writeFileSync(path.join(outDir, `${p.n}.json`), JSON.stringify(scene, null, 2) + '\n');
    out.push(`${p.n}.json  ${sceneFooter(scene)}`);
  }
  return out;
}

// ---------------------------------------------------------------- the README GIF (headless Chrome over CDP, then ffmpeg)

const W = 1000, H = 660;
/** Frame plan per scene: [phase, seconds, highlight question or 0]; about 15 s. */
const PLAN: [number, number, number][] = [[0, 1.8, 0], [1, 2.6, 0], [2, 3.4, 0], [3, 3.4, 0], [3, 3.8, -1]];

/** One README frame as a full page: the scene at a fixed size, compacted so the tallest verdicts fit, at a given reveal phase. */
export function stagePage(s: Scene, css: string, phase: number): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="color-scheme" content="light dark"><style>${css}
html,body{margin:0;background:var(--bg)} body{padding:0;overflow:hidden;font-size:15px} .stage{width:${W}px;height:${H}px;padding:12px 16px 10px;box-sizing:border-box;display:flex;flex-direction:column;overflow:hidden}
.stage .pscene{flex:1;min-height:0;display:flex;flex-direction:column;margin:0;padding:.65rem .8rem .6rem;border-radius:14px}
.stage .phead{margin-bottom:.5rem} .stage .phead h3{font-size:1.05rem}
.stage .pgrid{flex:1;min-height:0;align-items:stretch;gap:.6rem} .stage .pleft{grid-template-rows:auto minmax(0,1fr);gap:.6rem;min-height:0}
.stage .term{min-height:0} .stage .tbody{min-height:0;padding:.5rem .7rem} .stage .tbar{padding:.3rem .7rem}
.stage .req{display:flex;flex-direction:column;min-height:0} .stage .reqbody{flex:1;min-height:0;max-height:none;overflow:hidden;padding:.35rem 0}
.stage .verdict{display:flex;flex-direction:column;min-height:0;position:relative} .stage .verdict-body{flex:1;min-height:0;max-height:none;overflow:hidden;padding:.55rem .65rem;gap:.35rem}
.stage .verdict::after,.stage .req::after{content:"";position:absolute;left:0;right:0;bottom:0;height:2.2rem;pointer-events:none}
.stage .verdict::after{background:linear-gradient(to bottom,transparent,var(--card))} .stage .req{position:relative} .stage .req::after{background:linear-gradient(to bottom,transparent,#0b1424)}
.stage .big-gate{font-size:1.35rem;padding:.2rem .7rem .25rem} .stage .vstat.burst{flex-basis:auto;margin-left:auto;padding:.2rem .6rem} .stage .vstat.burst b{font-size:1.3rem}
.stage .vrow{padding:.25rem .5rem} .stage .urow{padding:.2rem .5rem} .stage .vnext{padding:.4rem .6rem} .stage .vhead{gap:.35rem .6rem}
.stage .pfoot{margin-top:.5rem} .stage details.raw{display:none}
.stage .brandbar{display:flex;align-items:baseline;justify-content:space-between;margin-bottom:.3rem}
.stage .brandbar b{font:900 1.15rem/1 var(--sans);letter-spacing:-.04em} .stage .brandbar b i{font-style:normal;color:var(--green)} .stage .brandbar span{font-size:.74rem;color:var(--muted)}
</style></head><body><div class="stage"><div class="brandbar"><b>MM<i>3</i></b><span>real runs &middot; prompt from the task given &middot; verdict and footer read from the ledger row</span></div>${renderScene(s, { phase })}</div></body></html>`;
}

class Cdp {
  private ws: WebSocket; private id = 0; private waiting = new Map<number, (v: unknown) => void>(); private events: ((m: { method: string }) => void)[] = [];
  constructor(ws: WebSocket) {
    this.ws = ws;
    ws.addEventListener('message', (e) => {
      const m = JSON.parse(String((e as MessageEvent).data)) as { id?: number; result?: unknown; method?: string };
      if (m.id && this.waiting.has(m.id)) { this.waiting.get(m.id)!(m.result); this.waiting.delete(m.id); } else if (m.method) this.events.forEach((f) => f(m as { method: string }));
    });
  }
  static async open(url: string): Promise<Cdp> {
    const ws = new WebSocket(url);
    await new Promise<void>((res, rej) => { ws.addEventListener('open', () => res()); ws.addEventListener('error', () => rej(new Error('cdp socket'))); });
    return new Cdp(ws);
  }
  send(method: string, params: object = {}): Promise<any> { // eslint-disable-line @typescript-eslint/no-explicit-any
    const id = ++this.id;
    return new Promise((res, rej) => {
      const timer = setTimeout(() => { this.waiting.delete(id); rej(new Error(`✖ chrome: ${method} did not answer in 30 s → check MM3_CHROME and rerun`)); }, 30000);
      this.waiting.set(id, (v) => { clearTimeout(timer); res(v); });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  once(method: string): Promise<void> { return new Promise((res) => { const f = (m: { method: string }): void => { if (m.method === method) { this.events = this.events.filter((x) => x !== f); res(); } }; this.events.push(f); }); }
  close(): void { this.ws.close(); }
}

/** The question the frames link request to verdict: the story's own pick, else the answer with the highest p. */
const HL: Record<string, number> = { 'MM3-0001': 3, 'MM3-0002': 3, 'MM3-0004': 1, 'MM3-0005': 5, 'MM3-0007': 25 };
function highlightQuestion(s: Scene): number {
  if (HL[s.id]) return HL[s.id]!;
  const best = [...s.response.matchAll(/\b(\d+): (\d(?:\.\d+)?)\b/g)].sort((a, b) => +b[2]! - +a[2]!)[0];
  return best ? +best[1]! : 1;
}

/** A path inside an ffmpeg concat list's single quotes: each quote is closed, escaped and reopened. */
function concatPath(p: string): string { return p.replaceAll("'", "'\\''"); }

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Chrome for the frames: $MM3_CHROME, else the first of a few usual paths. */
function chromePath(): string {
  const c = [process.env.MM3_CHROME, '/usr/bin/google-chrome', '/usr/bin/chromium-browser', '/snap/bin/chromium'].find((p) => p && existsSync(p));
  if (!c) throw new Error('✖ chrome: not found → set MM3_CHROME to a Chrome or Chromium binary');
  return c;
}

/** Renders one GIF per theme (all scenes, ~15 s each) into outDir; returns the sizes. Free: it reads only the scene JSON. */
export async function renderGifs(scenes: Scene[], outDir = 'docs/assets', keep?: string): Promise<string[]> {
  const work = keep ?? mkdtempSync(path.join(tmpdir(), 'mm3-gif-'));
  mkdirSync(work, { recursive: true });
  const css = readFileSync('site/style.css', 'utf8');
  const port = 9300 + Math.floor(Math.random() * 300);
  const chrome = spawn(chromePath(), ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${path.join(work, 'profile')}`, '--no-sandbox', '--hide-scrollbars', '--force-device-scale-factor=1', 'about:blank'], { stdio: 'ignore' });
  const notes: string[] = [];
  try {
    let target: { webSocketDebuggerUrl: string } | undefined;
    for (let i = 0; i < 50 && !target; i++) { await sleep(200); try { target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json() as { type: string; webSocketDebuggerUrl: string }[]).find((t) => t.type === 'page'); } catch { /* not up yet */ } }
    if (!target) throw new Error('✖ chrome: no page target → check MM3_CHROME');
    const cdp = await Cdp.open(target.webSocketDebuggerUrl);
    await cdp.send('Page.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
    for (const theme of ['light', 'dark'] as const) {
      await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: theme }, { name: 'prefers-reduced-motion', value: 'reduce' }] });
      const list: string[] = [];
      let n = 0;
      for (const s of scenes) {
        const file = path.join(work, `stage-${s.id}-${theme}.html`);
        writeFileSync(file, stagePage(s, css, 0));
        const loaded = cdp.once('Page.loadEventFired');
        await cdp.send('Page.navigate', { url: `file://${file}` });
        await loaded; await sleep(150);
        const hlQ = highlightQuestion(s);
        for (const [phase, secs, hl] of PLAN) {
          await cdp.send('Runtime.evaluate', { expression: `(() => { const sc = document.querySelector('.pscene'); sc.dataset.phase = '${phase}'; sc.querySelectorAll('.hl').forEach((e) => e.classList.remove('hl')); ${hl ? `sc.querySelectorAll('[data-q="${hlQ}"]').forEach((e) => e.classList.add('hl'));` : ''} })()` });
          await sleep(120);
          const shot = await cdp.send('Page.captureScreenshot', { format: 'png' }) as { data: string };
          const png = path.join(work, `${theme}-${String(n).padStart(3, '0')}.png`);
          writeFileSync(png, Buffer.from(shot.data, 'base64'));
          list.push(`file '${concatPath(png)}'`, `duration ${secs}`);
          n++;
        }
      }
      list.push(`file '${concatPath(path.join(work, `${theme}-${String(n - 1).padStart(3, '0')}.png`))}'`);
      const listFile = path.join(work, `${theme}.txt`);
      writeFileSync(listFile, list.join('\n') + '\n');
      const out = path.join(outDir, `demo-player-${theme}.gif`);
      const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', listFile, '-vf', `fps=8,scale=${W}:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=96:stats_mode=diff[p];[b][p]paletteuse=dither=none:diff_mode=rectangle`, '-loop', '0', out], { encoding: 'utf8' });
      if (r.status !== 0) throw new Error(`✖ ffmpeg: ${r.stderr.trim().split('\n')[0]} → install ffmpeg`);
      notes.push(`${out}: ${(statSync(out).size / 1e6).toFixed(2)} MB, ${n} frames`);
    }
    cdp.close();
  } finally {
    const gone = new Promise<void>((res) => chrome.once('exit', () => res()));
    chrome.kill(); await Promise.race([gone, sleep(3000)]);
    if (!keep) rmSync(work, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 });
  }
  return notes;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [mode, ...rest] = process.argv.slice(2);
  const arg = (k: string): string | undefined => { const i = rest.indexOf(k); return i >= 0 ? rest[i + 1] : undefined; };
  if (mode === 'extract') {
    const ledger = arg('--ledger'), reqs = arg('--requests'), qs = arg('--questions');
    if (!ledger || !reqs || !qs) { console.log('✖ extract: --ledger, --requests and --questions are required → tsx scripts/build-demo.ts extract --ledger <log.jsonl> --requests <dir> --questions <QUESTIONS.md>'); process.exit(1); }
    for (const l of extractAll(ledger, reqs, qs)) console.log(l);
  } else if (mode === 'gif') {
    for (const l of await renderGifs(loadScenes(), 'docs/assets', arg('--keep'))) console.log(l);
  } else {
    const scenes = loadScenes();
    console.log(`player: ${scenes.length} scenes, ${renderPlayer(scenes).length} bytes of HTML (from ${SCENE_DIR}, no ledger read)`);
    for (const s of scenes) console.log(`  ${sceneFooter(s)}`);
  }
}
