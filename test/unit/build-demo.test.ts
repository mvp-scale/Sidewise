// Unit tests for scripts/build-demo.ts (scene extract, footer, player markup) and checkDemo (footer and README drift); no ledger, no network, no browser.
import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { extractScene, highlightRequest, taskItems, loadScenes, renderPlayer, renderVerdict, sceneFooter, sceneLabel, scrubPaths, stagePage, type Scene } from '../../scripts/build-demo.ts';
import { buildSite } from '../../scripts/build-site.ts';
import { checkDemo } from '../../scripts/check-readme.ts';

const meta = { title: 'One verdict', prompt: 'Is <this> safe?', promptSource: 'smoke-test task 2', subject: 'OWASP NodeGoat' };
const response = `mak:
  id: MM3-0009
  gate: fail
  goal: {gate: fail, p: 0.06}
  injection: {gate: fail, 1: 0.99, 2: 0.08}
  input: {gate: pass, 3: 0.95}
  access: {gate: unsure, 4: 0.55}
  severity: {gate: fail, 5: {top: critical, p: 0.96}}
  consensus: SPLIT
  escalate: true
mdl: {recorded: [why, area]}
next: mm3 template drill --parent MM3-0009
notes: [cost estimated from tokens]`;
const request = `mak:
  goal: The handler is <safe>
  where: [stage/NodeGoat/app/routes/x.js:1-9]
  ask:
    concerns:
      injection:
        pass: no
        1: Does {file} read a value from the body?
        2: Is it parsed?`;
const row = {
  kind: 'run', id: 'MM3-0009', verb: 'class', ts: '2026-09-29T03:27:09Z', model: 'jev-1.13.0', baseURL: 'https://api.typesafe.ai', costUsd: 0.000047922, response,
  telemetry: [{ source: 'provider', latencyMs: 300, questions: 8, costUsd: 0.00003, costEstimated: true }, { source: 'provider', latencyMs: 93, questions: 4, costUsd: 0.000018, costEstimated: true }, { source: 'cache', from: 'MM3-0001', questions: 78 }],
};
const scene = (over: Partial<Scene> = {}): Scene => ({ ...extractScene(row, request, meta), ...over });

describe('extractScene', () => {
  it('reads the footer from the row: model, endpoint host, summed latency, cost, provider questions and calls, date', () => {
    const s = extractScene(row, request, meta);
    expect(s.footer).toEqual({ model: 'jev-1.13.0', endpoint: 'api.typesafe.ai', latencyMs: 393, costUsd: 0.000047922, costEstimated: true, questions: 12, reused: 78, reusedFrom: 'MM3-0001', calls: 2, date: '2026-09-29', subject: 'OWASP NodeGoat' });
    expect(s).toMatchObject({ id: 'MM3-0009', verb: 'class', command: 'mm3 class request.yaml', promptSource: 'smoke-test task 2', response });
  });
  it('relabels the scratch checkout and strips absolute and play-area paths', () => {
    const abs = ['', 'home', 'someone', 'mm3labs-play'].join('/'); // built, so this file holds no machine path itself
    const s = extractScene({ ...row, response: response + `\nnotes: [${abs}/x.js]` }, request + `\n  at: ${abs}/notes/a.yaml`, meta);
    expect(s.request).toContain('app/routes/x.js:1-9');
    expect(s.request).not.toMatch(/stage\/NodeGoat|\/home\/|mm3labs/);
    expect(s.response).not.toMatch(/\/home\/|mm3labs/);
    expect(scrubPaths('stage/NodeGoat/app/a.js /tmp/x/y.js')).toBe('app/a.js <path>');
  });
});

describe('sceneFooter', () => {
  it('has one exact format', () => {
    expect(sceneFooter(scene())).toBe('jev-1.13.0 · api.typesafe.ai · 393 ms · ~$0.000048 · 12 asked · 78 reused from MM3-0001 · 2 calls · MM3-0009');
    const one = scene({ footer: { ...scene().footer, latencyMs: 393, costUsd: 0.000558432, questions: 111, reused: 0, reusedFrom: '', calls: 1 } });
    expect(sceneFooter(one)).toBe('jev-1.13.0 · api.typesafe.ai · 393 ms · ~$0.00056 · 111 questions · 1 call · MM3-0009');
    expect(sceneLabel(one)).toBe('real output · jev-1.13.0 · api.typesafe.ai · 393 ms · ~$0.00056');
    expect(sceneFooter(scene({ footer: { ...one.footer, costEstimated: false } }))).toContain(' · $0.00056 · ');
  });
});

describe('taskItems', () => {
  const md = '# Round\n\n1. Check what is on record about\n   the handler.\n2. Do the first pass now and rank it. Then look again at the worst one with care, and say why you chose that call and how sure you are of it, in full detail, including every check you ran along the way and anything you would change.\n\n## Report back\n\n3. not an item';
  it('joins wrapped lines verbatim, cuts a long item to its first sentence with an ellipsis, and stops at the next heading', () => {
    const t = taskItems(md);
    expect(t.get(1)).toBe('Check what is on record about the handler.');
    expect(t.get(2)).toBe('Do the first pass now and rank it. …');
    expect(t.has(3)).toBe(false);
  });
  it('carries the real task text as the prompt (class run)', () => {
    expect(loadScenes()[0]!.prompt).toBe('Take a first look: is that contribution handler safe to merge as it stands?');
  });
});

describe('renderPlayer', () => {
  const html = renderPlayer([scene(), scene({ id: 'MM3-0010', verb: 'scan' })]);
  it('escapes HTML from the prompt, request and response', () => {
    const page = renderPlayer([scene({ prompt: '<script>x()</script>', request: 'mak:\n  goal: <img onerror=x>', response: 'not: [yaml <b>' })]);
    expect(page).not.toMatch(/<script>x|<img onerror|yaml <b>/);
    expect(page).toContain('&lt;script&gt;');
  });
  it('emits one tab and one scene per verb, all shown without a script', () => {
    expect(html.match(/class="ptab"/g)).toHaveLength(2);
    expect(html.match(/<article class="pscene/g)).toHaveLength(2);
    expect(html).not.toMatch(/<article[^>]*\bhidden\b/);
    expect(html).toContain('href="#scene-MM3-0009"');
  });
  it('colour-codes each verdict line by gate and draws a p bar per numbered answer', () => {
    const v = renderVerdict(scene());
    for (const g of ['pass', 'fail', 'unsure']) expect(v).toContain(`class="vrow ${g}"`);
    expect(v.match(/class="pb"/g)).toHaveLength(5 + 1); // five numbered answers, plus the goal's p
    expect(v).toContain('class="big-gate fail"');
    expect(v).toContain('consensus');
    expect(v).toContain('escalate');
    expect(v).toContain('mm3 template drill --parent MM3-0009');
  });
  it('links question N in the request to answer N in the verdict', () => {
    const v = renderVerdict(scene());
    const r = highlightRequest(request);
    expect(r).toContain('data-q="1"');
    expect(r).toContain('tabindex="0"');
    expect(v).toContain('data-q="1"');
    expect(r).toContain('<span class="ph">{file}</span>');
  });
  it('shows the footer of each scene, real-run tagged', () => {
    expect(html).toContain(sceneFooter(scene()));
    expect(html).toContain('real run');
    expect(html).toContain('via the mm3 tool, shown as CLI');
    expect(html).toContain('prompt: smoke-test task 2');
  });
  it('falls back to plain text for a response that is not YAML', () => {
    expect(renderVerdict(scene({ response: 'just text' }))).toContain('plainresp');
  });
  it('renders a README frame at a fixed size with its phase', () => {
    const page = stagePage(scene(), '/* css */', 2);
    expect(page).toContain('data-phase="2"');
    expect(page).toContain('real run');
  });
});

describe('the committed scenes', () => {
  const scenes = loadScenes();
  it('are the five real runs, in order, with a footer per run', () => {
    expect(scenes.map((s) => s.id)).toEqual(['MM3-0001', 'MM3-0002', 'MM3-0004', 'MM3-0005', 'MM3-0007']);
    expect(scenes.map((s) => s.verb)).toEqual(['class', 'scan', 'drill', 'replay', 'loop']);
    for (const s of scenes) {
      expect(s.footer.model).toMatch(/^jev-/);
      expect(s.footer.endpoint).toBe('api.typesafe.ai');
      expect(s.footer.latencyMs).toBeGreaterThan(0);
      expect(s.footer.costUsd).toBeGreaterThan(0);
      expect(s.response).toContain(`id: ${s.id}`);
    }
  });
  it('show the loop run\'s reuse and label every cost as an estimate', () => {
    const loop = scenes.find((x) => x.verb === 'loop')!;
    expect(sceneFooter(loop)).toBe('jev-1.13.0 · api.typesafe.ai · 631 ms · ~$0.00047 · 228 asked · 78 reused from MM3-0006 · 2 calls · MM3-0007');
    expect(renderVerdict(loop)).toContain('<b>78</b> reused');
    for (const s of scenes) { expect(s.footer.costEstimated, s.id).toBe(true); expect(sceneFooter(s)).toContain('~$'); expect(s.promptSource).toMatch(/^smoke-test task \d+$/); }
  });
  it('make the scan visible: 111 questions in one call', () => {
    const s = scenes.find((x) => x.verb === 'scan')!;
    expect(sceneFooter(s)).toBe('jev-1.13.0 · api.typesafe.ai · 393 ms · ~$0.00056 · 111 questions · 1 call · MM3-0002');
  });
  it('carry no machine path, play-area path, scratch-checkout prefix or old name', () => {
    for (const f of readdirSync('docs/demo/scenes')) {
      const raw = readFileSync(`docs/demo/scenes/${f}`, 'utf8');
      expect(raw, f).not.toMatch(/\/home\/|\/Users\/|mm3labs-play|stage\/NodeGoat|\/tmp\//);
      expect(raw, f).not.toMatch(/\bSidewise\b|\bsidewise\b|\bSW-\d{4}\b|\bside:|\bwise:/);
    }
  });
  it('render every scene with a bar for each numbered answer the response prints', () => {
    for (const s of scenes) {
      const html = renderVerdict(s);
      const answers = [...s.response.matchAll(/[ {,](\d+): (?:\d(?:\.\d+)?|\{top: [\w-]+, p: [\d.]+\})/g)].length;
      expect((html.match(/class="pb/g) ?? []).length, s.id).toBe(answers + (/goal: \{gate: \w+, p:/.test(s.response) ? 1 : 0));
    }
  });
  it('appear in the built site with the player script', () => {
    buildSite(undefined, 'site/dist');
    const page = readFileSync('site/dist/index.html', 'utf8');
    expect(page).toContain('data-player');
    expect(page).toContain('src="player.js"');
    for (const s of scenes) expect(page).toContain(sceneFooter(s));
  });
});

describe('checkDemo', () => {
  const scenes = loadScenes();
  const readme = readFileSync('README.md', 'utf8');
  const page = (): string => { buildSite(undefined, 'site/dist'); return readFileSync('site/dist/index.html', 'utf8'); };
  it('passes for the real site and README', () => {
    expect(checkDemo(page(), readme, scenes)).toEqual([]);
  });
  it('fails when a scene footer drifts from the site', () => {
    const drifted = page().replace('393 ms · ~$0.00056 · 111 questions', '393 ms · ~$0.00099 · 111 questions');
    expect(checkDemo(drifted, readme, scenes).join('\n')).toMatch(/site demo MM3-0002: footer/);
  });
  it('fails when the README response text or label drifts from its scene', () => {
    const a = readme.replace('escalate: true\nmdl:', 'escalate: false\nmdl:');
    expect(checkDemo(page(), a, scenes).join('\n')).toMatch(/README response MM3-0001: differs/);
    const b = readme.replace('364 ms', '999 ms');
    expect(checkDemo(page(), b, scenes).join('\n')).toMatch(/label/);
    const c = readme.replaceAll('  id: MM3-0001', '  id: MM3-9999');
    expect(checkDemo(page(), c, scenes).join('\n')).toMatch(/no frozen response/);
  });
});
