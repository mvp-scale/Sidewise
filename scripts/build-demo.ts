/**
 * The demo player's data and markup: two stories of real MM3 runs (frozen as scene JSON in site/scenes/), each step
 * following one agent session from the task it was given to the request it fired, the response MM3 returned, a quick
 * read of it, the decision it implies and what the ledger now holds. Every footer (model, endpoint, latency, cost, id)
 * and every number is read from the run's own ledger row by `extract`, never typed; the decision text is derived from the
 * response itself. The default mode and the site build read only the committed JSON, so a re-render never spends.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';

export type Footer = { model: string; endpoint: string; latencyMs: number; costUsd: number; costEstimated: boolean; questions: number; reused: number; reusedFrom: string; calls: number; date: string; pin: string };
/** What the ledger holds about the run: its place, lineage, what was recorded and reused, and the budget line the response printed. */
export type Knowledge = { run: number; of: number; parent: string; from: string; children: string[]; recorded: string[]; savedUsd: number; budget: string };
export type Scene = { story: string; n: number; id: string; verb: string; title: string; command: string; request: string; response: string; footer: Footer; knowledge: Knowledge };
export type DemoStory = { id: string; label: string; name: string; title: string; pinned: string; task: { question: string; full: string }; about: string; scenes: Scene[] };

const esc = (s: string): string => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

/** Cost with two significant digits: $0.000048, $0.00056; a reused run's exact zero reads $0.00000. */
export function fmtCost(c: number, estimated = false): string {
  if (!(c > 0)) return c === 0 ? '$0.00000' : '$0';
  return (estimated ? '~$' : '$') + c.toFixed(Math.max(2, 1 - Math.floor(Math.log10(c))));
}

/** Questions as the footer states them: what was sent to the model, and any answers reused from an earlier run. */
function questionsText(f: Footer): string {
  return f.reused > 0 ? `${f.questions} asked · ${f.reused} reused from ${f.reusedFrom}` : `${f.questions} question${f.questions === 1 ? '' : 's'}`;
}

/** The one footer string, shown under each step and checked against the site and README. */
export function sceneFooter(s: Scene): string {
  const f = s.footer;
  return [f.model, f.endpoint, `${f.latencyMs} ms`, fmtCost(f.costUsd, f.costEstimated), questionsText(f), `${f.calls} call${f.calls === 1 ? '' : 's'}`, s.id].join(' · ');
}

/** The README/site label for a frozen response: the footer's model, endpoint, latency and cost. */
export function sceneLabel(s: Scene): string {
  const f = s.footer;
  return `real output · ${f.model} · ${f.endpoint} · ${f.latencyMs} ms · ${fmtCost(f.costUsd, f.costEstimated)}`;
}

const reEsc = (t: string): string => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** The play area's folder name, taken from the --play path given at extract time (empty when none is given). */
const playName = (play: string): string => (play ? path.basename(path.resolve(play)) : '');

/** Drops any absolute machine path, and anything carrying the play area's name (from its path), from text that will be committed. */
export function scrubPaths(text: string, play = ''): string {
  const name = playName(play);
  const bare = text.replace(/(?:\/(?:home|Users|root|tmp|var|mnt)\/[^\s,'"\]}]+)+/g, '<path>');
  return name ? bare.replace(new RegExp(`[\\w./-]*${reEsc(name)}[\\w./-]*`, 'g'), '<path>') : bare;
}

/** The kickoff as the agent got it, with the play area's paths shortened: the tool is `mm3`, the notes folder `notes/`, the source `<checkout>`. */
export function scrubKickoff(text: string, play = ''): string {
  const name = playName(play);
  if (!name) return scrubPaths(text);
  const home = `~/${reEsc(name)}`;
  return scrubPaths(text
    .replace(new RegExp(`${home}/bin/mm3`, 'g'), 'mm3')
    .replace(new RegExp(`${home}/notes-\\w+/`, 'g'), 'notes/')
    .replace(new RegExp(`${home}/(?:wordpress|n8n)`, 'g'), '<checkout>'), play);
}

type Row = { id?: string; verb?: string; ts?: string; model?: string; baseURL?: string; costUsd?: number; parent?: string | null; from?: string | null; response?: string; telemetry?: { source?: string; from?: string; latencyMs?: number | null; questions?: number; costUsd?: number | null; costEstimated?: boolean; savedUsd?: number }[] };
type Meta = { story: string; n: number; pin: string; run: number; of: number; children: string[]; play?: string };

/** One ledger row plus its request text becomes a scene; footer and knowledge fields come from the row, summed over its provider calls. */
export function extractScene(row: object, requestYaml: string, meta: Meta): Scene {
  const r = row as Row;
  const calls = (r.telemetry ?? []).filter((t) => t.source === undefined || t.source === 'provider');
  const cached = (r.telemetry ?? []).filter((t) => t.source === 'cache');
  const host = ((): string => { try { return new URL(r.baseURL ?? '').host; } catch { return r.baseURL ?? ''; } })();
  const verb = r.verb ?? '';
  const response = scrubPaths((r.response ?? '').replace(/\s+$/, ''), meta.play);
  const request = scrubPaths(requestYaml.replace(/\s+$/, ''), meta.play);
  let doc: unknown = null;
  try { doc = parse(response); } catch { /* not YAML: no recorded fields */ }
  const recorded = isObj(doc) && isObj(doc.mdl) && Array.isArray(doc.mdl.recorded) ? doc.mdl.recorded.map(String) : [];
  const budgetNote = (isObj(doc) && Array.isArray(doc.notes) ? doc.notes.map(String) : []).find((n) => n.includes('budget:'));
  const budget = budgetNote ? budgetNote.slice(budgetNote.indexOf('budget:')) : '';
  const goal = ((parse(request) as { mak?: { goal?: string } } | null)?.mak?.goal ?? '').trim();
  return {
    story: meta.story, n: meta.n, id: r.id ?? '', verb, title: goal,
    command: `mm3 ${verb} request.yaml`, request, response,
    footer: {
      model: r.model ?? '', endpoint: host,
      latencyMs: calls.reduce((n, t) => n + (t.latencyMs ?? 0), 0),
      costUsd: r.costUsd ?? calls.reduce((n, t) => n + (t.costUsd ?? 0), 0),
      costEstimated: calls.some((t) => t.costEstimated === true),
      questions: calls.reduce((n, t) => n + (t.questions ?? 0), 0),
      reused: cached.reduce((n, t) => n + (t.questions ?? 0), 0), reusedFrom: [...new Set(cached.map((t) => t.from ?? ''))].filter(Boolean).join(', '),
      calls: calls.length, date: (r.ts ?? '').slice(0, 10), pin: meta.pin,
    },
    knowledge: { run: meta.run, of: meta.of, parent: r.parent ?? '', from: r.from ?? '', children: meta.children, recorded, savedUsd: cached.reduce((n, t) => n + (t.savedUsd ?? 0), 0), budget },
  };
}

// ---------------------------------------------------------------- YAML highlighting (the request and the response share it)

const inline = (s: string): string => esc(s).replace(/\{(file|part|story|call|unit)\}/g, '<span class="ph">{$1}</span>');
const BOOL = /^(?:true|false|yes|no|null|~)$/;
const scalar = (v: string): string => {
  const t = v.trim();
  if (/^-?\d+(?:\.\d+)?$/.test(t)) return `<span class="yn">${esc(t)}</span>`;
  if (BOOL.test(t)) return `<span class="yb">${esc(t)}</span>`;
  return `<span class="ys">${inline(v)}</span>`;
};
const gateWord = (w: string): string => (w === 'pass' || w === 'fail' || w === 'unsure' ? ` yg ${w}` : '');

/** A `{a: 1, b: [x, y]}` value: punctuation, keys, question numbers, numbers, gates and strings each get a class. */
function flow(s: string): string {
  const re = /("(?:[^"\\]|\\.)*"|'[^']*')|([{}[\],])|((?:[A-Za-z_][\w./@*#-]*|\d+)(?=:(?:\s|$)))|(:)|(-?\d+(?:\.\d+)?)(?![\w./-])|([^\s{}[\],:"']+)|(\s+)/g;
  let out = '', m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    if (m[1]) out += `<span class="ys">${esc(m[1])}</span>`;
    else if (m[2]) out += `<span class="yp">${m[2]}</span>`;
    else if (m[3]) out += /^\d+$/.test(m[3]) ? `<span class="yq" data-q="${m[3]}">${m[3]}</span>` : `<span class="yk">${esc(m[3])}</span>`;
    else if (m[4]) out += '<span class="yp">:</span>';
    else if (m[5]) out += `<span class="yn">${m[5]}</span>`;
    else if (m[6]) out += BOOL.test(m[6]) ? `<span class="yb">${esc(m[6])}</span>` : `<span class="ys${gateWord(m[6])}">${esc(m[6])}</span>`;
    else out += esc(m[7] ?? '');
  }
  return out;
}

/** Full YAML, one wrapping line each with a hanging indent (nothing is cut): keys, strings, numbers, gates, comments and numbered questions coloured; a numbered question is focusable and linked to its answer. */
export function highlightYaml(yaml: string): string {
  return yaml.split('\n').map((line) => {
    const ind = /^ */.exec(line)![0].length;
    let rest = line.slice(ind), extra = 0, marker = '';
    const row = (html: string, cls = ''): string => `<span class="ln${cls}" style="--i:${ind + extra};--x:${extra}">${html || '&nbsp;'}</span>`;
    if (rest.startsWith('#')) return row(`<span class="yc">${esc(rest)}</span>`);
    while (rest.startsWith('- ')) { marker += '<span class="yp">- </span>'; rest = rest.slice(2); extra += 2; }
    const m = /^([^\s:{}[\],"'#][^:]*?):(?:\s+(.*))?$/.exec(rest);
    if (!m) return row(marker + (rest ? scalar(rest) : ''));
    const [, key, value = ''] = m;
    const q = /^\d+$/.test(key!);
    const kcls = q ? '' : key === 'pass' ? 'yk pass' : ind === 0 && !marker ? `yk ytop ytop-${key}` : 'yk';
    const k = q ? `<span class="yq" data-q="${key}">${key}</span>` : `<span class="${kcls}">${esc(key!)}</span>`;
    const v = value === '' ? '' : ' ' + (value.startsWith('{') || value.startsWith('[') ? flow(value) : scalar(value));
    return q ? `<span class="ln rq" data-q="${key}" tabindex="0" style="--i:${ind + extra};--x:${extra}">${marker}${k}<span class="yp">:</span>${v}</span>` : row(`${marker}${k}<span class="yp">:</span>${v}`);
  }).join('');
}

// ---------------------------------------------------------------- the quick-read pane (the colour-coded verdict)

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

/** The quick read: gate, consensus, escalate, a row per concern (or ranked unit). The decision and the ledger have their own panes. Falls back to plain text if the response is not YAML. */
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
    + `<span class="vstat${f.questions >= 50 || f.reused >= 50 ? ' burst' : ''}"><b>${f.questions}</b> question${f.questions === 1 ? '' : 's'}${f.reused > 0 ? ` <span>+</span> <b>${f.reused}</b> reused` : ''} <span>&middot;</span> <b>${f.calls}</b> call${f.calls === 1 ? '' : 's'} <span>&middot;</span> <b>${f.latencyMs}</b> ms</span></div>`;
  const rows: string[] = [];
  const facts: string[] = [];
  for (const [k, v] of Object.entries(mak)) {
    if (['id', 'gate', 'consensus', 'escalate'].includes(k)) continue;
    if (k === 'failing' && isObj(v)) rows.push(`<div class="ranked" role="list" aria-label="ranked, worst first"><div class="rank-h">ranked, worst first</div>${unitRows(v)}</div>`);
    else if (isObj(v) && ('gate' in v || 'before' in v || 'after' in v)) rows.push(catRow(k, v));
    else facts.push(`<span class="fact"><em>${esc(k)}</em>${esc(plainVal(v))}</span>`);
  }
  return `<div class="verdict-body">${head}${rows.join('')}${facts.length ? `<div class="facts">${facts.join('')}</div>` : ''}</div>`;
}

// ---------------------------------------------------------------- the decision the response implies

export type Decision = { gate: 'pass' | 'fail' | 'unsure' | ''; do: string; what: string; cmd: string; because: string[] };

const WHAT: Record<string, string> = {
  drill: 'digs into one weak spot, one level down, asking only about it',
  replay: 're-asks the same questions across two commits, so the fix is proven, not assumed',
};
const namesWith = (mak: Obj, gate: string): string[] => Object.entries(mak).filter(([k, v]) => k !== 'goal' && isObj(v) && v.gate === gate).map(([k]) => k);
/** Up to three names in prose, then a count: "a, b, c and 2 more". */
const list = (xs: string[]): string => {
  const shown = xs.length > 3 ? [...xs.slice(0, 3), `${xs.length - 3} more`] : xs;
  return shown.length <= 2 ? shown.join(' and ') : `${shown.slice(0, -1).join(', ')} and ${shown.at(-1)}`;
};

/** The move the response points to and why, derived only from the response itself: its `next:`, gate, concerns, consensus, escalate and reuse. */
export function inferDecision(response: string): Decision {
  let doc: unknown;
  try { doc = parse(response); } catch { doc = null; }
  const mak = isObj(doc) && isObj(doc.mak) ? doc.mak : {};
  const next = isObj(doc) && typeof doc.next === 'string' ? doc.next : '';
  const gate = gateOf(mak.gate);
  const because: string[] = [];
  if (isObj(mak.failing)) {
    const units = Object.entries(mak.failing).filter(([, v]) => isObj(v)) as [string, Obj][];
    const scanned = isObj(mak.scanned) ? Object.values(mak.scanned).reduce<number>((n, v) => n + (typeof v === 'number' ? v : 0), 0) : units.length;
    if (units.length) {
      const gates = Object.values(units[0]![1]).filter((v) => gateOf(v));
      because.push(`${units.length} of ${scanned} scanned file${scanned === 1 ? '' : 's'} fail the gate; the worst is ${units[0]![0]}, failing ${gates.filter((v) => v === 'fail').length} of ${gates.length} concerns`);
    }
  } else if (gate) {
    const bad = namesWith(mak, 'fail'), unsure = namesWith(mak, 'unsure');
    const goal = isObj(mak.goal) && typeof mak.goal.gate === 'string' && mak.goal.gate !== 'pass' ? `goal ${mak.goal.gate}${typeof mak.goal.p === 'number' ? ` (p ${pTxt(mak.goal.p)})` : ''}` : '';
    const parts = [goal, bad.length ? `${list(bad)} ${bad.length === 1 ? 'fails' : 'fail'}` : '', unsure.length ? `${list(unsure)} unsure` : ''].filter(Boolean);
    because.push(`the gate is ${gate.toUpperCase()}${parts.length ? `: ${parts.join('; ')}` : ''}`);
  }
  if (mak.consensus) because.push(`consensus is ${String(mak.consensus)}${mak.escalate === true ? ' and escalate is true, so do not act on this alone' : mak.escalate === false ? ' and escalate is false' : ''}`);
  const reused = Array.isArray(mak.reused) ? mak.reused.map(String).join(', ') : typeof mak.reused === 'number' && mak.reused > 0 ? `${mak.reused} file${mak.reused === 1 ? '' : 's'}` : '';
  if (reused) because.push(`answers were reused (${reused}): the code they were given on is unchanged, so nothing new was asked`);
  const drill = /^mm3 template drill\b.*--from (\S+)/.exec(next);
  const fix = /^fix it, then (mm3 replay\b.*)$/.exec(next);
  if (drill) return { gate, do: `Drill into ${drill[1]}`, what: `mm3 drill ${WHAT.drill}`, cmd: next, because };
  if (fix) return { gate, do: 'Fix it, then replay', what: `mm3 replay ${WHAT.replay}`, cmd: fix[1]!, because };
  return { gate, do: next ? 'Do the next step MM3 names' : 'No next step named', what: '', cmd: next, because };
}

/** The decision pane: the move as one line, its command, and the reasons it follows from the response. */
export function renderDecision(s: Scene): string {
  const d = inferDecision(s.response);
  return `<section class="decision ${d.gate}" aria-label="the decision this response implies"><div class="dhead"><span class="dnum">5</span><span class="dlabel">the decision it infers</span></div><div class="dbody"><p class="dmain">${esc(d.do)}</p>`
    + `${d.what ? `<p class="dwhat">${esc(d.what)}</p>` : ''}${d.cmd ? `<code class="dcmd">${esc(d.cmd)}</code>` : ''}`
    + `<ul class="dwhy">${d.because.map((b) => `<li>${esc(b)}</li>`).join('')}</ul></div></section>`;
}

/** The ledger pane: where the run sits, its lineage, what was reused or asked fresh, and what was recorded and left in the budget. */
export function renderKnowledge(s: Scene): string {
  const k = s.knowledge, f = s.footer;
  const lineage = `run ${k.run} of ${k.of} in this ledger · ${k.parent ? `child of ${k.parent}${k.from ? `, drilled from ${k.from}` : ''}` : 'a root run, no parent'}${k.children.length ? ` · built on later by ${k.children.join(', ')}` : ''}`;
  const reuse = f.reused > 0
    ? `${f.reused} answers reused from ${f.reusedFrom}: no call, ${fmtCost(f.costUsd, f.costEstimated)}${k.savedUsd > 0 ? `, saved ${fmtCost(k.savedUsd, true)}` : ''}`
    : `asked fresh: ${f.questions} questions in ${f.calls} call${f.calls === 1 ? '' : 's'}, ${fmtCost(f.costUsd, f.costEstimated)}; every answer is kept for reuse`;
  const items: [string, string][] = [['lineage', lineage], ['reuse', reuse], ['recorded', k.recorded.length ? `${k.recorded.join(', ')} saved with the run` : 'nothing from an mdl: block; the request had none'], ...(k.budget ? [['budget', k.budget.replace(/^budget: /, '')] as [string, string]] : [])];
  return `<section class="knowledge" aria-label="what the ledger now holds"><div class="dhead"><span class="dnum">6</span><span class="dlabel">what the ledger now holds</span></div><dl class="kbody">${items.map(([a, b]) => `<div><dt>${esc(a)}</dt><dd>${esc(b)}</dd></div>`).join('')}</dl></section>`;
}

// ---------------------------------------------------------------- one step, one story, the player

/** The goal's own gate and p as one chip (pass, fail or unsure, then p), read from the response; empty when the run has no goal block. */
export function goalChip(s: Scene): string {
  let doc: unknown;
  try { doc = parse(s.response); } catch { doc = null; }
  const g = isObj(doc) && isObj(doc.mak) && isObj(doc.mak.goal) ? doc.mak.goal : null;
  const gate = g ? gateOf(g.gate) : '';
  return gate ? `<span class="goalgate">${chip(gate, `${gate}${typeof g!.p === 'number' ? ` ${pTxt(g!.p)}` : ''}`)}</span>` : '';
}

const FLOW = ['task', 'request', 'response', 'quick read', 'decision', 'ledger'];
const lines = (t: string): number => t.split('\n').length;

/** One step: the request the agent fired and the response MM3 returned (tabbed, or stacked without a script), the quick read beside them, then the decision and the ledger. `phase` (0-3) and `show` are set only for the README frames and the replay. */
export function renderScene(s: Scene, opts: { phase?: number; show?: 'request' | 'response'; hidden?: boolean } = {}): string {
  const phase = opts.phase === undefined ? '' : ` data-phase="${opts.phase}"`;
  const req = parse(s.request) as { mak?: { depth?: string } } | null;
  const meta = [s.verb, req?.mak?.depth ? `depth ${req.mak.depth}` : '', `${lines(s.request)}-line request`].filter(Boolean).join(' · ');
  return `<article class="pscene fam-${esc(s.story)}" id="scene-${esc(s.story)}-${esc(s.id)}" data-scene="${esc(s.story)}-${esc(s.id)}" data-n="${s.n}" data-verb="${esc(s.verb)}" data-show="${opts.show ?? 'request'}"${phase}${opts.hidden ? ' hidden' : ''}>
  <header class="phead"><h3><span class="stepno">${s.n}</span><span class="goal"><em class="gt">goal tested:</em> ${esc(s.title)}</span>${goalChip(s)}</h3><ol class="flow" aria-label="the flow of one step">${FLOW.map((f, i) => `<li>${i + 1} ${f}</li>`).join('')}</ol></header>
  <div class="pmain">
    <section class="codecard" aria-label="request and response">
      <div class="codetabs" role="tablist" aria-label="request or response"><button type="button" role="tab" data-tab="request" aria-selected="true"><i>2</i> request.yaml</button><button type="button" role="tab" data-tab="response" aria-selected="false"><i>3</i> response.yaml</button><span class="cmeta">${esc(meta)}</span><span class="cpage" hidden></span></div>
      <div class="code" data-pane="request" role="tabpanel"><div class="pane-h"><span><i>2</i> the request it fired</span><em>request.yaml · hover a question</em></div><div class="cbody" tabindex="0" aria-label="request.yaml">${highlightYaml(s.request)}</div></div>
      <div class="code" data-pane="response" role="tabpanel"><div class="pane-h"><span><i>3</i> the response that came back</span><em>MM3 output, verbatim</em></div><div class="cbody" tabindex="0" aria-label="response.yaml">${highlightYaml(s.response)}</div></div>
    </section>
    <section class="verdict" aria-label="quick read"><div class="pane-h"><span><i>4</i> quick read <b>${esc(s.id)}</b></span><em>bar = p</em></div>${renderVerdict(s)}</section>
  </div>
  <div class="pbottom">${renderDecision(s)}${renderKnowledge(s)}</div>
  <p class="pfoot"><span class="real">real run</span> <span class="pf">${esc(sceneFooter(s))}</span> <span class="pdate">${esc(s.footer.date)}</span> <span class="ppin">${esc(s.footer.pin)}</span> <span class="psrc">costs are estimates &middot; counts include the goal question</span></p>
  <details class="raw"><summary>Exact request and response text</summary><pre class="rawcode"><code>${esc(s.request)}</code></pre><pre class="rawcode"><code>${esc(s.response)}</code></pre></details>
</article>`;
}

/** The task strip: the kickoff the Haiku agent was given (its question verbatim; the full text one click away). */
export function renderTask(st: DemoStory): string {
  return `<div class="task"><span class="dnum">1</span><div><div class="tlabel">task given to a Haiku agent</div><p class="tq">${esc(st.task.question)}</p>`
    + `<details class="tfull"><summary>the full kickoff, paths shortened</summary><pre class="rawcode"><code>${esc(st.task.full)}</code></pre></details></div></div>`;
}

/** The whole player: a tab per story, a step chip per run, all steps stacked when there is no script (player.js turns them into tabs and steps). */
export function renderPlayer(stories: DemoStory[]): string {
  const tabs = stories.map((st) => `<a class="pstab fam-${esc(st.id)}" href="#story-${esc(st.id)}"><b>${esc(st.label)}</b><span>${esc(st.title)}</span></a>`).join('');
  const body = stories.map((st) => `  <section class="pstory fam-${esc(st.id)}" id="story-${esc(st.id)}" data-story="${esc(st.id)}" data-label="${esc(st.label)}" aria-label="${esc(st.label)}: ${esc(st.title)}">
    <div class="shead"><h3>${esc(st.label)} &middot; ${esc(st.title)}</h3><p class="spin">${esc(st.pinned)}</p><p class="sabout">${esc(st.about)}</p></div>
    ${renderTask(st)}
    <nav class="psteps" aria-label="Steps of ${esc(st.label)}">${st.scenes.map((s) => `<a class="pstep" href="#scene-${esc(s.story)}-${esc(s.id)}" title="${esc(s.title)}"><i>${s.n}</i> ${esc(s.verb)} <span>${esc(s.id)}</span></a>`).join('')}</nav>
    <div class="pscenes">
${st.scenes.map((s) => renderScene(s)).join('\n')}
    </div>
  </section>`).join('\n');
  return `<div class="player" data-player>
  <p class="pintro">Two real stories, each driven by a Haiku agent on unmodified public source. Every step is one run: the task the agent was given, the request it fired, the response MM3 returned, a quick read of it, the decision it implies and what the ledger now holds. Every footer comes from that run&rsquo;s own ledger row.</p>
  <nav class="pstabs" aria-label="Stories">${tabs}</nav>
${body}
  <div class="pctl" hidden><button type="button" data-prev>&larr; Previous</button><button type="button" data-replay>Replay</button><button type="button" data-next>Next &rarr;</button></div>
</div>`;
}

// ---------------------------------------------------------------- scenes on disk

const SCENE_DIR = 'site/scenes';
export function loadStories(dir = SCENE_DIR): DemoStory[] {
  // a scene file that is not a story (site/scenes/strip-n8n.json, the README strip's one run) has no `scenes` list and is skipped
  return readdirSync(dir).filter((f) => f.endsWith('.json')).sort().map((f) => JSON.parse(readFileSync(path.join(dir, f), 'utf8')) as DemoStory).filter((st) => Array.isArray(st.scenes));
}
/** Every step of every story, in story order. */
export function loadScenes(dir = SCENE_DIR): Scene[] {
  return loadStories(dir).flatMap((st) => st.scenes);
}

type StoryDef = { id: string; label: string; name: string; title: string; repo: string; notes: string; pinned: string; why: string; picks: { id: string; file: string }[] };
/** The two stories: which ledger runs to show (and which request file produced each), and why the rest are left out. Runs and files are from the play area's own notes. */
const STORIES: StoryDef[] = [
  { id: 'mak', label: 'MAK³ · make', name: 'WordPress', title: 'Where do agents plug into WordPress?', repo: 'wordpress', notes: 'notes-wp',
    pinned: 'WordPress/wordpress-develop @ 3ffb1df, unmodified public source',
    why: 'MM3-0002 drills into the block editor and MM3-0006 checks the admin UI; each repeats a move already shown, so the story follows the candidates that decide the answer: blocks, the REST API, the Abilities API and its access check.',
    picks: [{ id: 'MM3-0001', file: '8-class-block-registration-fixed4.yaml' }, { id: 'MM3-0003', file: '13-class-rest-api-agents-fixed.yaml' }, { id: 'MM3-0004', file: '14-class-abilities-ui-integration.yaml' }, { id: 'MM3-0005', file: '16-drill-abilities-access-fixed.yaml' }] },
  { id: 'mdl', label: 'MDL³ · model', name: 'n8n', title: "I've never worked in n8n and I want it faster", repo: 'n8n', notes: 'notes-n8n',
    pinned: 'n8n-io/n8n at tags n8n@2.40.7 then n8n@2.41.3, unmodified public source',
    why: 'MM3-0002 is a replay that came back unsure because every item was skipped, and MM3-0005 repeats the reuse shown in the last step, so the story goes scan, class, drill, then the next release re-checked from the ledger.',
    picks: [{ id: 'MM3-0001', file: '01-scan-architecture.yaml' }, { id: 'MM3-0003', file: '02-architecture-analysis.yaml' }, { id: 'MM3-0004', file: '03-drill-architecture.yaml' }, { id: 'MM3-0006', file: '01-scan-architecture.yaml' }] },
];

export type AskRow = { ask?: { categories?: { questions?: { text: string }[] }[]; layers?: { categories?: { questions?: { text: string }[] }[] }[] } };
export const askTexts = (r: AskRow): string[] => [...(r.ask?.categories ?? []), ...(r.ask?.layers ?? []).flatMap((l) => l.categories ?? [])].flatMap((c) => (c.questions ?? []).map((q) => q.text));

/** One-time, free: reads a play ledger and its request files, checks each request against its row (goal and every question text), and writes the story JSON. */
export function extractStory(def: StoryDef, play: string, kickoff: string, outDir = SCENE_DIR): string[] {
  const repo = path.join(play, def.repo);
  const rows = readFileSync(path.join(repo, '.mm3', 'log.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l) as Row & AskRow & { kind?: string; goal?: string; commit?: string });
  const runs = rows.filter((r) => r.kind === 'run');
  mkdirSync(outDir, { recursive: true });
  const scenes = def.picks.map((p, i): Scene => {
    const row = runs.find((r) => r.id === p.id);
    if (!row) throw new Error(`✖ ledger: no run ${p.id} in ${def.repo} → point --play at the play area of this round`);
    const yaml = readFileSync(path.join(play, def.notes, 'requests', p.file), 'utf8');
    const goal = ((parse(yaml) as { mak?: { goal?: string } }).mak?.goal ?? '').trim();
    if (goal !== (row.goal ?? '').trim()) throw new Error(`✖ ${p.file}: goal does not match ${p.id} → pick the request file whose mak.goal is the row's goal`);
    const missing = askTexts(row).find((t) => !yaml.includes(t));
    if (missing) throw new Error(`✖ ${p.file}: question "${missing}" of ${p.id} is not in the file → pick the request file that produced the run`);
    const commit = row.commit ?? '';
    const tags = def.id === 'mdl' ? (spawnSync('git', ['-C', repo, 'tag', '--points-at', commit], { encoding: 'utf8' }).stdout ?? '').split('\n').filter((t) => t.startsWith('n8n@')) : [];
    const pin = tags[0] ?? `${def.name} @${commit.slice(0, 7)}`;
    return extractScene(row, yaml, { story: def.id, n: i + 1, pin, run: runs.indexOf(row) + 1, of: runs.length, children: runs.filter((r) => r.parent === row.id).map((r) => r.id ?? ''), play });
  });
  const omitted = runs.filter((r) => !def.picks.some((p) => p.id === r.id)).map((r) => `${r.id} (${r.verb})`);
  const about = `${scenes.length} of the agent's ${runs.length} runs, in ledger order. Left out: ${omitted.join(', ')}. ${def.why}`;
  const full = scrubKickoff(kickoff.trim(), play);
  const story: DemoStory = { id: def.id, label: def.label, name: def.name, title: def.title, pinned: def.pinned, task: { question: full.split('\n\n')[0]!, full }, about, scenes };
  writeFileSync(path.join(outDir, `${def.id}.json`), JSON.stringify(story, null, 2) + '\n');
  return scenes.map((s) => `${def.id} ${s.n}  ${sceneFooter(s)}  ${s.footer.pin}`);
}

// ---------------------------------------------------------------- the README frame (the GIF renders one of these per moment)

export const STAGE = { w: 1600, h: 900 };

if (import.meta.url === `file://${process.argv[1]}`) {
  const [mode, ...rest] = process.argv.slice(2);
  const arg = (k: string): string | undefined => { const i = rest.indexOf(k); return i >= 0 ? rest[i + 1] : undefined; };
  if (mode === 'extract') {
    const play = arg('--play'), mak = arg('--kickoff-mak'), mdl = arg('--kickoff-mdl');
    if (!play || !mak || !mdl) { console.log('✖ extract: --play, --kickoff-mak and --kickoff-mdl are required → tsx scripts/build-demo.ts extract --play <play-area> --kickoff-mak <mak.txt> --kickoff-mdl <mdl.txt>'); process.exit(1); }
    for (const def of STORIES) for (const l of extractStory(def, play, readFileSync(def.id === 'mak' ? mak : mdl, 'utf8'))) console.log(l);
  } else {
    const stories = loadStories();
    console.log(`player: ${stories.length} stories, ${renderPlayer(stories).length} bytes of HTML (from ${SCENE_DIR}, no ledger read)`);
    for (const s of loadScenes()) console.log(`  ${s.story} ${s.n}  ${sceneFooter(s)}  ${s.footer.pin}`);
  }
}
