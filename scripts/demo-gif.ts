/**
 * Renders the README's animated player as one GIF per colour scheme: headless Chrome over CDP (Node's built-in
 * WebSocket, no npm dependency) captures each step of each story at 1600x900 - the request and the response paged through
 * in full, then the quick read, the decision and the ledger - and ffmpeg joins the frames. Free: it reads only the scene
 * JSON. Chrome and ffmpeg are machine tools, not part of CI.
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { STAGE, loadStories, stagePage, type DemoStory } from './build-demo.ts';

/** Seconds a frame is held: the first page of a pane, later pages, the decision and the ledger. */
const HOLD = { first: 2.8, page: 2.3, decision: 3.4, ledger: 4 };

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

/** A path inside an ffmpeg concat list's single quotes: each quote is closed, escaped and reopened. */
function concatPath(p: string): string { return p.replaceAll("'", "'\\''"); }

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Chrome for the frames: $MM3_CHROME, else the first of a few usual paths. */
function chromePath(): string {
  const c = [process.env.MM3_CHROME, '/usr/bin/google-chrome', '/usr/bin/chromium-browser', '/snap/bin/chromium'].find((p) => p && existsSync(p));
  if (!c) throw new Error('✖ chrome: not found → set MM3_CHROME to a Chrome or Chromium binary');
  return c;
}

type Probe = { pages: number; vOver: boolean; dOver: boolean };

/** Renders one GIF per theme (every step of every story) into outDir; returns the sizes. A quick read or decision that would be cut off fails the render instead of shipping cropped. */
export async function renderGifs(stories: DemoStory[], outDir = 'docs/assets', keep?: string): Promise<string[]> {
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
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: STAGE.w, height: STAGE.h, deviceScaleFactor: 1, mobile: false });
    for (const theme of ['light', 'dark'] as const) {
      await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: theme }, { name: 'prefers-reduced-motion', value: 'reduce' }] });
      const list: string[] = [];
      let n = 0;
      const snap = async (secs: number): Promise<void> => {
        await sleep(110);
        let shot: { data: string } | undefined;
        for (let attempt = 0; attempt < 3 && !shot; attempt++) { // headless Chrome now and then stalls a capture: wake the tab and ask again
          try { shot = await cdp.send('Page.captureScreenshot', { format: 'png' }) as { data: string }; } catch (e) { if (attempt === 2) throw e; await cdp.send('Page.bringToFront').catch(() => undefined); }
        }
        if (!shot) throw new Error('✖ chrome: no screenshot → check MM3_CHROME and rerun');
        const png = path.join(work, `${theme}-${String(n).padStart(3, '0')}.png`);
        writeFileSync(png, Buffer.from(shot.data, 'base64'));
        list.push(`file '${concatPath(png)}'`, `duration ${secs}`);
        n++;
      };
      const frame = async (phase: number, show: string, page: number): Promise<Probe> => (await cdp.send('Runtime.evaluate', { expression: `window.mm3Frame(${phase}, '${show}', ${page})`, returnByValue: true }) as { result: { value: Probe } }).result.value;
      for (const st of stories) for (const s of st.scenes) {
        const file = path.join(work, `stage-${st.id}-${s.id}-${theme}.html`);
        writeFileSync(file, stagePage(stories, st, s, css));
        const loaded = cdp.once('Page.loadEventFired');
        await cdp.send('Page.navigate', { url: `file://${file}` });
        await loaded; await sleep(150);
        const req = await frame(0, 'request', 0);
        for (let p = 0; p < req.pages; p++) { await frame(0, 'request', p); await snap(p === 0 ? HOLD.first : HOLD.page); }
        const res = await frame(1, 'response', 0);
        if (res.vOver || res.dOver) throw new Error(`✖ stage: ${st.id} ${s.id} does not fit (${res.vOver ? 'quick read' : 'decision or ledger'} is cut off) → shorten it or raise the stage`);
        for (let p = 0; p < res.pages; p++) { await frame(1, 'response', p); await snap(p === 0 ? HOLD.first : HOLD.page); }
        await frame(2, 'response', 0); await snap(HOLD.decision);
        await frame(3, 'response', 0); await snap(HOLD.ledger);
      }
      list.push(`file '${concatPath(path.join(work, `${theme}-${String(n - 1).padStart(3, '0')}.png`))}'`);
      const listFile = path.join(work, `${theme}.txt`);
      writeFileSync(listFile, list.join('\n') + '\n');
      const out = path.join(outDir, `demo-player-${theme}.gif`);
      const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', listFile, '-vf', `fps=6,scale=${STAGE.w}:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=64:stats_mode=diff[p];[b][p]paletteuse=dither=none:diff_mode=rectangle`, '-loop', '0', out], { encoding: 'utf8' });
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
  const keep = process.argv.indexOf('--keep');
  for (const l of await renderGifs(loadStories(), 'docs/assets', keep >= 0 ? process.argv[keep + 1] : undefined)) console.log(l);
}
