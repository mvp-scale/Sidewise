// Unit tests for scripts/build-demo.ts (scene extract, footer, YAML highlight, the inferred decision, player markup) and checkDemo (footer and README drift); no ledger, no network, no browser.
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { extractScene, fmtCost, goalChip, highlightYaml, inferDecision, loadScenes, loadStories, renderDecision, renderKnowledge, renderPlayer, renderScene, renderVerdict, sceneFooter, sceneLabel, scrubKickoff, scrubPaths, type Scene } from '../../scripts/build-demo.ts';
import { buildSite } from '../../scripts/build-site.ts';
import { checkDemo } from '../../scripts/check-readme.ts';
import { stripScene } from '../../scripts/build-strip.ts';

const response = `mak:
  id: MM3-0009
  gate: fail
  goal: {gate: unsure, p: 0.38}
  design: {gate: unsure, 1: 0.97, 2: 0.50, 3: 0.96}
  access: {gate: fail, 4: 0.38, 5: 0.08, 6: 0.10}
  correctness: {gate: pass, 7: 0.80}
  aui: {gate: unsure, 8: {top: "yes", p: 0.45}}
  consensus: SPLIT
  escalate: true
mdl: {recorded: [why, area]}
next: mm3 template drill --parent MM3-0009 --from access
notes: [cost estimated from tokens (no live pricing reported), "budget: $0.10 left of $0.10 · 26 of 30 runs left"]`;
const request = `mak:
  goal: The API is <safe>
  depth: quick
  where:
    - src/a.php:1-9
  ask:
    concerns:
      design:
        pass: "yes"
        1: Does {file} read a value from the body?
        2: Is it parsed?`;
const row = {
  kind: 'run', id: 'MM3-0009', verb: 'class', ts: '2026-09-29T03:27:09Z', model: 'jev-1.13.0', baseURL: 'https://api.typesafe.ai', costUsd: 0.000047922, parent: 'MM3-0004', from: 'access', response,
  telemetry: [{ source: 'provider', latencyMs: 300, questions: 8, costUsd: 0.00003, costEstimated: true }, { source: 'provider', latencyMs: 93, questions: 4, costUsd: 0.000018, costEstimated: true }, { source: 'cache', from: 'MM3-0001', questions: 78, savedUsd: 0.0002 }],
};
const meta = { story: 'mak', n: 3, pin: 'WordPress @3ffb1df', run: 4, of: 6, children: ['MM3-0010'] };
const scene = (over: Partial<Scene> = {}): Scene => ({ ...extractScene(row, request, meta), ...over });
const text = (html: string): string => html.replaceAll('<span class="ln', '\n<span class="ln').replace(/<[^>]+>/g, '').replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&quot;', '"').replaceAll('&amp;', '&').replaceAll('&nbsp;', '');
/** Builds the site into a throwaway folder (never the repo's site/dist) and returns its index.html. */
function builtPage(): string {
  const dist = mkdtempSync(path.join(tmpdir(), 'mm3-site-'));
  try { buildSite(undefined, dist); return readFileSync(path.join(dist, 'index.html'), 'utf8'); } finally { rmSync(dist, { recursive: true, force: true }); }
}
const squash = (t: string): string => t.split('\n').map((l) => l.trim().replace(/\s+/g, ' ')).filter(Boolean).join('\n');

describe('extractScene', () => {
  it('reads footer and knowledge from the row: model, endpoint host, summed latency, cost, provider questions and calls, reuse, lineage, budget', () => {
    const s = extractScene(row, request, meta);
    expect(s.footer).toEqual({ model: 'jev-1.13.0', endpoint: 'api.typesafe.ai', latencyMs: 393, costUsd: 0.000047922, costEstimated: true, questions: 12, reused: 78, reusedFrom: 'MM3-0001', calls: 2, date: '2026-09-29', pin: 'WordPress @3ffb1df' });
    expect(s.knowledge).toEqual({ run: 4, of: 6, parent: 'MM3-0004', from: 'access', children: ['MM3-0010'], recorded: ['why', 'area'], savedUsd: 0.0002, budget: 'budget: $0.10 left of $0.10 · 26 of 30 runs left' });
    expect(s).toMatchObject({ id: 'MM3-0009', verb: 'class', story: 'mak', n: 3, title: 'The API is <safe>', command: 'mm3 class request.yaml', response });
  });
  it('takes the budget from a note that has other parts before it, and reads none as no recorded fields', () => {
    const r = response.replace('recorded: [why, area]', 'recorded: none').replace('"budget:', '"1 call · 80 questions · budget:');
    const s = extractScene({ ...row, response: r }, request, meta);
    expect(s.knowledge.recorded).toEqual([]);
    expect(s.knowledge.budget).toBe('budget: $0.10 left of $0.10 · 26 of 30 runs left');
  });
  it('strips absolute paths, and the play-area name taken from the --play path, from the request and response', () => {
    const name = ['demo', 'play'].join('-'); // built from parts: no play-area name is written in this file
    const play = ['', 'home', 'someone', name].join('/');
    const s = extractScene({ ...row, response: response + `\nnotes: [${play}/x.js]` }, request + `\n  at: ~/${name}/notes/a.yaml`, { ...meta, play });
    expect(s.request + s.response).not.toMatch(new RegExp(`/home/|${name}`));
    expect(scrubPaths('a /tmp/x/y.js b')).toBe('a <path> b');
    expect(scrubPaths(`keep ${name}-like text`)).toBe(`keep ${name}-like text`); // no --play given: only machine paths go
  });
  it('shortens the kickoff paths and keeps its wording', () => {
    const name = ['demo', 'play'].join('-');
    const k = scrubKickoff(`Use MM3.\n\nThe code is ~/${name}/n8n (unmodified). Run \`~/${name}/bin/mm3 agent\`.\n\nLeave these in ~/${name}/notes-n8n/:`, ['', 'x', name].join('/'));
    expect(k).toBe('Use MM3.\n\nThe code is <checkout> (unmodified). Run `mm3 agent`.\n\nLeave these in notes/:');
  });
  it('reads a fully reused run as zero asked, zero calls, $0.00000', () => {
    const reuse = { ...row, costUsd: 0, telemetry: [{ source: 'cache', from: 'MM3-0001', questions: 81, savedUsd: 0.00022 }] };
    const s = extractScene(reuse, request, meta);
    expect(sceneFooter(s)).toBe('jev-1.13.0 · api.typesafe.ai · 0 ms · $0.00000 · 0 asked · 81 reused from MM3-0001 · 0 calls · MM3-0009');
    expect(fmtCost(0.00011, true)).toBe('~$0.00011');
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

describe('highlightYaml', () => {
  const html = highlightYaml(request + '\n# note: a comment\n  gates: {gate: pass, 1: 0.5, top: "yes", ok: true}');
  it('colours keys, strings, numbers, booleans, comments, gates and question numbers, and marks {file} placeholders', () => {
    expect(html).toContain('<span class="yk ytop ytop-mak">mak</span>');
    expect(html).toContain('<span class="yk pass">pass</span>');
    expect(html).toContain('<span class="yq" data-q="1">1</span>');
    expect(html).toContain('<span class="yn">0.5</span>');
    expect(html).toContain('<span class="ys">&quot;yes&quot;</span>');
    expect(html).toContain('<span class="yb">true</span>');
    expect(html).toContain('<span class="yc"># note: a comment</span>');
    expect(html).toContain('<span class="ys yg pass">pass</span>');
    expect(html).toContain('<span class="ph">{file}</span>');
    expect(html).toContain('&lt;safe&gt;');
  });
  it('makes each numbered question a focusable line linked to its answer', () => {
    expect(html).toContain('class="ln rq" data-q="1" tabindex="0"');
    expect(renderVerdict(scene())).toContain('data-q="1"');
  });
  it('keeps every line whole: no truncation, wrapped with a hanging indent', () => {
    const long = 'mak:\n  goal: ' + 'word '.repeat(60).trim();
    const h = highlightYaml(long);
    expect(text(h)).toContain('word '.repeat(59) + 'word');
    expect(h).not.toContain('…');
    expect(h).toContain('style="--i:2;--x:0"');
  });
  it('round-trips the text of every committed request and response', () => {
    for (const s of loadScenes()) {
      expect(squash(text(highlightYaml(s.request))), `${s.story} ${s.id} request`).toBe(squash(s.request));
      expect(squash(text(highlightYaml(s.response))), `${s.story} ${s.id} response`).toBe(squash(s.response));
    }
  });
});

describe('inferDecision', () => {
  it('names the drill, the concern it goes into, and why: gate, concerns, consensus, escalate', () => {
    const d = inferDecision(response);
    expect(d).toMatchObject({ gate: 'fail', do: 'Drill into access', cmd: 'mm3 template drill --parent MM3-0009 --from access' });
    expect(d.because[0]).toBe('the gate is FAIL: goal unsure (p 0.38); access fails; design and aui unsure');
    expect(d.because[1]).toBe('consensus is SPLIT and escalate is true, so do not act on this alone');
  });
  it('turns a fix-then-replay next into the replay command', () => {
    const d = inferDecision(response.replace(/^next: .*$/m, 'next: fix it, then mm3 replay --parent MM3-0004 --compare <before>..<after>'));
    expect(d).toMatchObject({ do: 'Fix it, then replay', cmd: 'mm3 replay --parent MM3-0004 --compare <before>..<after>' });
  });
  it('reads a scan: the worst file, and reuse of unchanged code', () => {
    const scan = `mak:
  id: MM3-0006
  gate: fail
  scanned: {file: 4}
  failing:
    packages/cli/src/index.ts: {architecture: fail, testing: unsure, 1: 0.10}
    packages/core/src/index.ts: {architecture: unsure, 1: 0.44}
  passing: 0
  reused: 4
next: mm3 template drill --parent MM3-0006 --from packages/cli/src/index.ts`;
    const d = inferDecision(scan);
    expect(d.do).toBe('Drill into packages/cli/src/index.ts');
    expect(d.because[0]).toBe('2 of 4 scanned files fail the gate; the worst is packages/cli/src/index.ts, failing 1 of 2 concerns');
    expect(d.because.join('|')).toContain('answers were reused (4 files): the code they were given on is unchanged');
  });
  it('lists at most three names, then a count, and survives a non-YAML response', () => {
    const many = `mak:\n  gate: fail\n  a: {gate: fail, 1: 0.1}\n  b: {gate: fail, 2: 0.1}\n  c: {gate: fail, 3: 0.1}\n  d: {gate: fail, 4: 0.1}\n  e: {gate: fail, 5: 0.1}\nnext: mm3 template drill --parent MM3-0001 --from a`;
    expect(inferDecision(many).because[0]).toBe('the gate is FAIL: a, b, c and 2 more fail');
    expect(inferDecision('not: [yaml').do).toBe('No next step named');
  });
  it('renders the decision and the ledger panes, escaped', () => {
    const d = renderDecision(scene());
    expect(d).toContain('Drill into access');
    expect(d).toContain('class="decision fail"');
    expect(d).toContain('<code class="dcmd">mm3 template drill --parent MM3-0009 --from access</code>');
    const k = renderKnowledge(scene());
    expect(k).toContain('run 4 of 6 in this ledger · child of MM3-0004, drilled from access · built on later by MM3-0010');
    expect(k).toContain('78 answers reused from MM3-0001: no call, ~$0.000048, saved ~$0.00020');
    expect(k).toContain('why, area saved with the run');
    expect(k).toContain('$0.10 left of $0.10 · 26 of 30 runs left');
    expect(renderKnowledge(scene({ footer: { ...scene().footer, reused: 0, reusedFrom: '' }, knowledge: { ...scene().knowledge, parent: '', children: [] } }))).toMatch(/a root run, no parent.*asked fresh: 12 questions in 2 calls/s);
  });
});

describe('goal heading', () => {
  it('labels the run goal as "goal tested:" and shows its own gate chip and p beside it', () => {
    const html = renderScene(scene());
    expect(html).toContain('<em class="gt">goal tested:</em> The API is &lt;safe&gt;');
    expect(html).toContain('<span class="goalgate"><span class="chip unsure">unsure 0.38</span></span>');
    expect(goalChip(scene({ response: response.replace('goal: {gate: unsure, p: 0.38}', 'goal: {gate: pass, p: 0.87}') }))).toContain('chip pass">pass 0.87');
    expect(goalChip(scene({ response: 'not: yaml' }))).toBe('');
  });
});

describe('renderPlayer', () => {
  const st = (id: string, label: string) => ({ id, label, name: 'X', title: `Title ${id}`, pinned: 'X @abc', task: { question: 'Use MM3 <now>', full: 'Use MM3 <now>\n\nrest' }, about: '2 of 6 runs.', scenes: [scene({ story: id, n: 1 }), scene({ story: id, n: 2, id: 'MM3-0010', verb: 'drill' })] });
  const stories = [st('mak', 'MAK³ · make'), st('mdl', 'MDL³ · model')];
  const html = renderPlayer(stories);
  it('escapes HTML from the task, request and response', () => {
    const page = renderPlayer([{ ...stories[0]!, task: { question: '<script>x()</script>', full: 'f' }, scenes: [scene({ request: 'mak:\n  goal: <img onerror=x>', response: 'not: [yaml <b>' })] }]);
    expect(page).not.toMatch(/<script>x|<img onerror|yaml <b>/);
    expect(page).toContain('&lt;script&gt;');
  });
  it('emits a tab per story and a step chip and scene per run, all shown without a script', () => {
    expect(html.match(/class="pstab /g)).toHaveLength(2);
    expect(html.match(/class="pstep"/g)).toHaveLength(4);
    expect(html.match(/<article class="pscene/g)).toHaveLength(4);
    expect(html).not.toMatch(/<(article|section)[^>]*\bhidden\b/);
    expect(html).toContain('href="#story-mak"');
    expect(html).toContain('href="#scene-mdl-MM3-0010"');
    expect(html).toContain('id="scene-mak-MM3-0009"');
  });
  it('shows the task given to a Haiku agent, once per story, with the full kickoff one click away', () => {
    expect(html.match(/task given to a Haiku agent/g)).toHaveLength(2);
    expect(html).toContain('Use MM3 &lt;now&gt;');
    expect(html).toContain('the full kickoff, paths shortened');
  });
  it('gives each step both panes (request and response), the quick read, the decision, the ledger and the footer with its pin and date', () => {
    const one = renderScene(scene());
    for (const part of ['data-pane="request"', 'data-pane="response"', 'aria-label="quick read"', 'class="decision fail"', 'class="knowledge"', 'real run', 'WordPress @3ffb1df', '2026-09-29', sceneFooter(scene())]) expect(one).toContain(part);
    expect(one).toContain('data-tab="request"');
    expect(one).toContain('data-show="request"');
    expect(one).not.toContain('data-phase');
  });
  it('colour-codes each quick-read line by gate and draws a p bar per numbered answer', () => {
    const v = renderVerdict(scene());
    for (const g of ['pass', 'fail', 'unsure']) expect(v).toContain(`class="vrow ${g}"`);
    expect(v.match(/class="pb"/g)).toHaveLength(8 + 1); // eight numbered answers, plus the goal's p
    expect(v).toContain('class="big-gate fail"');
    expect(v).toContain('consensus');
    expect(v).toContain('escalate');
  });
  it('falls back to plain text for a response that is not YAML', () => {
    expect(renderVerdict(scene({ response: 'just text' }))).toContain('plainresp');
  });
});

describe('the committed stories', () => {
  const stories = loadStories();
  const scenes = loadScenes();
  it('are two stories of four real runs each, in ledger order, each pinned to its public source', () => {
    expect(stories.map((s) => s.id)).toEqual(['mak', 'mdl']);
    expect(stories.map((s) => s.label)).toEqual(['MAK³ · make', 'MDL³ · model']);
    expect(stories[0]!.scenes.map((s) => `${s.id} ${s.verb}`)).toEqual(['MM3-0001 class', 'MM3-0003 class', 'MM3-0004 class', 'MM3-0005 drill']);
    expect(stories[1]!.scenes.map((s) => `${s.id} ${s.verb}`)).toEqual(['MM3-0001 scan', 'MM3-0003 class', 'MM3-0004 drill', 'MM3-0006 scan']);
    expect(stories[0]!.scenes.every((s) => s.footer.pin === 'WordPress @3ffb1df')).toBe(true);
    expect(stories[1]!.scenes.map((s) => s.footer.pin)).toEqual(['n8n@2.40.7', 'n8n@2.40.7', 'n8n@2.40.7', 'n8n@2.41.3']);
    expect(stories[0]!.pinned).toMatch(/unmodified public source/);
    expect(stories[1]!.pinned).toMatch(/n8n@2\.40\.7.*n8n@2\.41\.3.*unmodified/);
    for (const st of stories) expect(st.about).toMatch(/of the agent's 6 runs.*Left out: MM3-\d+/);
  });
  it('carry the kickoff as the agent got it: the question verbatim, paths shortened, no play-area path', () => {
    expect(stories[0]!.task.question).toBe('Use MM3 to answer this: I want to add agentic UI (AUI) components to WordPress — UI elements an AI agent can drive. Where would the integration most likely need to go, what are the touch points, what would change, and which security areas does the change touch?');
    expect(stories[1]!.task.question).toMatch(/^Use MM3 to answer this: I've never worked in n8n and I want to make it faster\./);
    for (const st of stories) { expect(st.task.full.startsWith(st.task.question)).toBe(true); expect(st.task.full).toContain('run `mm3 agent` first'); expect(st.task.full).not.toMatch(/~\/[\w.-]*-play\b/); }
  });
  it('read every footer from a row: real model and endpoint, estimated cost, and the WordPress Abilities API check', () => {
    for (const s of scenes) {
      expect(s.footer.model).toMatch(/^jev-/);
      expect(s.footer.endpoint).toBe('api.typesafe.ai');
      expect(s.response).toContain(`id: ${s.id}`);
      expect(s.footer.date).toBe('2026-09-29');
    }
    const abilities = stories[0]!.scenes[2]!;
    expect(abilities.request).toContain('src/wp-includes/abilities-api.php');
    expect(sceneFooter(abilities)).toBe('jev-1.13.0 · api.typesafe.ai · 293 ms · ~$0.00012 · 12 questions · 1 call · MM3-0004');
    expect(abilities.knowledge.children).toEqual(['MM3-0005']);
    expect(stories[0]!.scenes[3]!.knowledge).toMatchObject({ parent: 'MM3-0004', from: 'access' });
  });
  it('show the n8n re-check at 2.41.3 as fully reused for $0.00000', () => {
    const last = stories[1]!.scenes[3]!;
    expect(sceneFooter(last)).toBe('jev-1.13.0 · api.typesafe.ai · 0 ms · $0.00000 · 0 asked · 81 reused from MM3-0001 · 0 calls · MM3-0006');
    expect(renderKnowledge(last)).toContain('81 answers reused from MM3-0001: no call, $0.00000, saved ~$0.00022');
    expect(renderVerdict(last)).toContain('<b>81</b> reused');
    expect(inferDecision(last.response).because.join('|')).toContain('answers were reused (4 files)');
  });
  it('infer a clear decision for every step, from its own response', () => {
    for (const s of scenes) {
      const d = inferDecision(s.response);
      expect(d.do, `${s.story} ${s.id}`).toMatch(/^(Drill into |Fix it, then replay)/);
      expect(d.cmd, `${s.story} ${s.id}`).toMatch(/^mm3 /);
      expect(d.because.length, `${s.story} ${s.id}`).toBeGreaterThan(0);
    }
  });
  it('carry no machine path, play-area path or old name', () => {
    for (const f of readdirSync('site/scenes')) {
      const raw = readFileSync(`site/scenes/${f}`, 'utf8');
      expect(raw, f).not.toMatch(/\/home\/|\/Users\/|-play\b|\/tmp\/|<path>/);
      expect(raw, f).not.toMatch(/\bSidewise\b|\bsidewise\b|\bSW-\d{4}\b|\bside:|\bwise:/);
    }
  });
  it('render every step with a bar for each numbered answer the response prints', () => {
    for (const s of scenes) {
      const html = renderVerdict(s);
      const answers = [...s.response.matchAll(/[ {,](\d+): (?:\d(?:\.\d+)?|\{top: "?[\w-]+"?, p: [\d.]+\})/g)].length;
      expect((html.match(/class="pb/g) ?? []).length, `${s.story} ${s.id}`).toBe(answers + (/goal: \{gate: \w+, p:/.test(s.response) ? 1 : 0));
    }
  });
  it('appear in the built site with the player script', () => {
    const page = builtPage();
    expect(page).toContain('data-player');
    expect(page).toContain('src="player.js"');
    expect(page.match(/class="pstab /g)).toHaveLength(2);
    for (const s of scenes) expect(page).toContain(sceneFooter(s));
  });
});

describe('checkDemo', () => {
  const scenes = loadScenes();
  const readme = readFileSync('README.md', 'utf8');
  const page = builtPage;
  it('passes for the real site and README', () => {
    expect(checkDemo(page(), readme, scenes)).toEqual([]);
  });
  it('fails when a scene footer drifts from the site', () => {
    const drifted = page().replace('293 ms · ~$0.00012 · 12 questions', '293 ms · ~$0.00099 · 12 questions');
    expect(checkDemo(drifted, readme, scenes).join('\n')).toMatch(/site demo MM3-0004: footer/);
  });
  it('fails when the README drops a card, or the label drifts from its scene', () => {
    const a = readme.replace('src="docs/assets/example-request.svg"', 'src="docs/assets/other.svg"');
    expect(checkDemo(page(), a, scenes).join('\n')).toMatch(/README request MM3-0008: no docs\/assets\/example-request\.svg/);
    const b = readme.replace('321 ms · ~$0.000063', '999 ms · ~$0.000063');
    expect(checkDemo(page(), b, scenes).join('\n')).toMatch(/label/);
  });
  it('fails when a committed card differs from what its scene builds', () => {
    const ex = stripScene();
    const drifted = { ...ex, response: ex.response.replace('escalate: true', 'escalate: false') };
    expect(checkDemo(page(), readme, scenes, drifted).join('\n')).toMatch(/README response MM3-0008: docs\/assets\/example-response\.svg differs/);
  });
});
