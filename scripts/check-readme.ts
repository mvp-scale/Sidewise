/**
 * README drift protection (mechanical layer): the README formula's checkable rules as one pure function, so a
 * README edit that breaks the story, an example, a link or the shape fails `npm run check:readme` in CI.
 * The judgment rules (tone, clarity) are graded by the MM3 request in scripts/readme-judgment.yaml instead.
 */
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { loadScenes, sceneFooter, sceneLabel, type Scene } from './build-demo.ts';
import { buildSite, esc, methodUrl, VERB_BLURBS } from './build-site.ts';
import { loadStory, type Story } from './story.ts';

export { loadStory };
export type { Story };

type Opts = { root: string; dryRun: (verb: string, yaml: string) => string | null; published?: boolean };

const OLD = /\b(?:side|wise):|\bsidewise\b|\bSidewise\b|\bSW-\d{4}\b/;
const VERBS = 'view|class|replay|scan|drill|loop';

/** Shape check for docs/story.yaml: a bad file becomes problem lines, not a TypeError. */
export function checkStory(raw: unknown): string[] {
  const out: string[] = [];
  const o = (raw ?? {}) as Record<string, unknown>;
  const str = (v: unknown) => typeof v === 'string' && v.trim() !== '';
  for (const k of ['tagline', 'identity']) if (!str(o[k])) out.push(`✖ story.yaml: ${k} must be a non-empty string → fix docs/story.yaml`);
  const inst = (o.install ?? {}) as Record<string, unknown>;
  for (const k of ['claude', 'claudeInstall', 'npm', 'npmInit', 'nokey']) if (!str(inst[k])) out.push(`✖ story.yaml: install.${k} must be a non-empty string → fix docs/story.yaml`);
  if (!Array.isArray(o.numbers)) out.push('✖ story.yaml: numbers must be a list → use numbers: [] for none');
  else o.numbers.forEach((n: unknown, i) => { if (!str((n as { text?: unknown } | null)?.text)) out.push(`✖ story.yaml: numbers[${i}].text must be a non-empty string → fix docs/story.yaml`); });
  if (!Array.isArray(o.useCases)) out.push('✖ story.yaml: useCases must be a list → use useCases: [] for none');
  else o.useCases.forEach((u: unknown, i) => { if (!str((u as { title?: unknown } | null)?.title)) out.push(`✖ story.yaml: useCases[${i}].title must be a non-empty string → fix docs/story.yaml`); });
  return out;
}

function nearestVerb(lines: string[], before: number): string | undefined {
  const re = new RegExp(`\\bmm3 (${VERBS})\\b`);
  for (let i = before; i >= 0; i--) { const v = re.exec(lines[i]!)?.[1]; if (v) return v; }
  return undefined;
}

export function checkReadme(md: string, story: Story, opts: Opts): string[] {
  const out: string[] = [];
  const lines = md.split('\n');
  const firstH2 = lines.findIndex((l) => l.startsWith('## '));
  const head = lines.slice(0, firstH2 < 0 ? lines.length : firstH2).join('\n');
  if (!/<picture>|!\[[^\]]*\]\([^)]+\.(?:svg|gif|png)\)/.test(head)) out.push('✖ visual: no image before the first ## heading → put the how-it-works picture above it');
  const firstCmd = lines.findIndex((_l, i) => i > 0 && lines[i - 1]!.startsWith('```bash'));
  if (firstCmd < 0 || firstCmd + 1 > 30) out.push(`✖ first command: line ${firstCmd + 1} → move install up to within 30 lines`);
  const phrases: [string, string][] = [
    ['story.tagline', story.tagline], ['story.identity', story.identity],
    ['story.install.claude', story.install.claude], ['story.install.claudeInstall', story.install.claudeInstall], ['story.install.npm', story.install.npm], ['story.install.npmInit', story.install.npmInit], ['story.install.nokey', story.install.nokey],
    ...story.numbers.map((n, i): [string, string] => [`story.numbers[${i}]`, n.text]),
    ...story.useCases.map((u, i): [string, string] => [`story.useCases[${i}]`, u.title]),
  ];
  for (const [key, text] of phrases) if (!md.includes(text)) out.push(`✖ ${key}: "${text}" is not in the README → copy it verbatim from docs/story.yaml`);
  let n = 0;
  for (const m of md.matchAll(/```yaml([^\n]*)\n([\s\S]*?)```/g)) {
    const body = m[2]!;
    if (!/^mak:/m.test(body)) continue; // a response block (next:/notes:) or config, not a request
    n++;
    const line = md.slice(0, m.index).split('\n').length + 1;
    const fenceLine = md.slice(0, m.index).split('\n').length - 1;
    const verb = /^\s+verb:\s*(view|class|replay|scan|drill|loop)\b/m.exec(body)?.[1]
      ?? new RegExp(`verb=(${VERBS})\\b`).exec(m[1]!)?.[1]
      ?? nearestVerb(lines, fenceLine) ?? 'class';
    const stop = opts.dryRun(verb, body);
    if (stop) out.push(`✖ example ${n} (line ${line}): ${stop}`);
  }
  for (const m of md.matchAll(/(?:\]\(|src="|srcset=")((?!https?:|#|mailto:)[^)"\s#]+)/g)) {
    if (!existsSync(path.join(opts.root, m[1]!))) out.push(`✖ link: ${m[1]} does not exist → fix the path`);
  }
  lines.forEach((l, i) => { if (OLD.test(l.replaceAll('mvp-scale/Sidewise', ''))) out.push(`✖ old name: line ${i + 1} → use mak:/mdl:/mm3/MM3-`); });
  const badges = md.match(/img\.shields\.io|badge\.svg/g)?.length ?? 0;
  if (badges > 4) out.push(`✖ badge: ${badges} badges → keep 4 or fewer`);
  if (opts.published === false && /shields\.io\/npm\//.test(md)) out.push('✖ badge: npm badge for an unpublished package → remove it until the first publish');
  if (!/^## License/m.test(md)) out.push('✖ footer: no ## License section → add the short footer');
  return out;
}

/** The site's drift check: every story phrase verbatim in the built page, each number linked to its method, no old names, and (given the dist folder) every relative asset present. */
export function checkSite(html: string, story: Story, dist?: string, readme?: string, scenes?: Scene[]): string[] {
  const out: string[] = [];
  const phrases: [string, string][] = [
    ['story.tagline', story.tagline], ['story.identity', story.identity],
    ['story.install.claude', story.install.claude], ['story.install.claudeInstall', story.install.claudeInstall], ['story.install.npm', story.install.npm], ['story.install.npmInit', story.install.npmInit], ['story.install.nokey', story.install.nokey],
    ...story.numbers.map((n, i): [string, string] => [`story.numbers[${i}]`, n.text]),
    ...story.useCases.map((u, i): [string, string] => [`story.useCases[${i}]`, u.title]),
  ];
  for (const [key, text] of phrases) if (!html.includes(text) && !html.includes(esc(text))) out.push(`✖ site ${key}: "${text}" is not in site/dist/index.html → build the site from docs/story.yaml (npm run build:site)`);
  story.numbers.forEach((n, i) => { if (!html.includes(`href="${methodUrl(n.method)}"`)) out.push(`✖ site story.numbers[${i}]: no link to ${methodUrl(n.method)} → check site/template.html`); });
  if (!/<title>[^<]+<\/title>/.test(html)) out.push('✖ site: no <title> → add one to site/template.html');
  html.split('\n').forEach((l, i) => { if (OLD.test(l.replaceAll('mvp-scale/Sidewise', ''))) out.push(`✖ site old name: line ${i + 1} → use mak:/mdl:/mm3/MM3-`); });
  if (dist) for (const m of html.matchAll(/(?:href|src|srcset)="((?!https?:|data:|#|mailto:)[^"\s#]+)/g)) {
    if (!existsSync(path.join(dist, m[1]!))) out.push(`✖ site link: ${m[1]} is not in ${dist} → fix the path or copy the asset`);
  }
  if (readme !== undefined) out.push(...checkSiteProse(html, readme, story));
  if (scenes) out.push(...checkDemo(html, readme, scenes));
  return out;
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", ldquo: '"', rdquo: '"', lsquo: "'", rsquo: "'", middot: '·', nbsp: ' ' };
const quotes = (t: string): string => t.replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"');
const squash = (t: string): string => quotes(t).replace(/\s+/g, ' ').trim();
/** The page's visible text: scripts and styles dropped, tags removed, entities decoded, whitespace squashed. */
function siteText(html: string): string {
  const bare = html.replace(/<(script|style)[\s\S]*?<\/\1>/g, '').replace(/<[^>]+>/g, '');
  return squash(bare.replace(/&#(\d+);/g, (_m, n: string) => String.fromCharCode(+n)).replace(/&(\w+);/g, (m, k: string) => ENTITIES[k] ?? m));
}
const plain = (md: string): string => squash(md.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\*([^*]+)\*/g, '$1').replace(/`/g, ''));
/** The demo player's drift check: each scene's footer is on the site, and the README's one frozen response is that scene's text with its label (model, endpoint, latency, cost), and its frozen request is that scene's request; run ids repeat across the two stories, so a scene is matched by id and then by text. */
export function checkDemo(html: string, readme: string | undefined, scenes: Scene[]): string[] {
  const out: string[] = [];
  if (!scenes.length) return ['✖ demo: no scenes in docs/demo/scenes/ → run tsx scripts/build-demo.ts extract'];
  const text = siteText(html);
  for (const s of scenes) {
    const footer = sceneFooter(s);
    if (!text.includes(squash(footer))) out.push(`✖ site demo ${s.id}: footer "${footer}" is not in site/dist/index.html → rebuild the site from docs/demo/scenes (npm run build:site)`);
  }
  if (readme === undefined) return out;
  const blocks = [...readme.matchAll(/```text\n([\s\S]*?)```/g)].map((m) => m[1]!.trim());
  const idOf = (b: string): string | undefined => /^ {2}id: (MM3-\d+)$/m.exec(b)?.[1];
  const hit = blocks.map((b) => ({ b, cands: scenes.filter((s) => s.id === idOf(b)) })).find((x) => x.cands.length);
  if (!hit) out.push('✖ README response: no frozen response in ## See it run matches a demo scene → paste one scene\'s response text under the player');
  else {
    const s = hit.cands.find((c) => c.response.trim() === hit.b) ?? hit.cands[0]!; // two stories can share a run id: prefer the scene whose text matches
    if (hit.b !== s.response.trim()) out.push(`✖ README response ${s.id}: differs from docs/demo/scenes → copy the scene's response text verbatim`);
    if (!plain(readme).includes(sceneLabel(s))) out.push(`✖ README response ${s.id}: label "${sceneLabel(s)}" is not in the README → copy it from the scene footer`);
    const req = blocks.find((b) => /^ {2}goal:/m.test(b) && !idOf(b)); // the frozen request: the block with a goal: line and no run id (the response has both)
    if (req === undefined) out.push(`✖ README request ${s.id}: no frozen request in ## See it run → paste the scene's request text under "The request the agent wrote"`);
    else if (req !== s.request.trim()) out.push(`✖ README request ${s.id}: differs from docs/demo/scenes → copy the scene's request text verbatim`);
  }
  return out;
}

const PROSE_SECTIONS = ['See it run', 'What you get', 'Why we built it', 'Limits and alternatives'];

/** Prose the README and the site both carry (hand-copied, not in story.yaml): each block of these README sections must appear in the page's text, so a README edit that the site missed fails. */
function checkSiteProse(html: string, readme: string, story: Story): string[] {
  const out: string[] = [];
  const text = siteText(html);
  const want = (section: string, block: string): void => {
    const t = squash(block);
    if (t && !text.includes(t)) out.push(`✖ site prose: "${t.slice(0, 60)}…" (README "${section}") is not in site/dist/index.html → copy it from README.md into site/template.html`);
  };
  for (const section of PROSE_SECTIONS) {
    const start = readme.indexOf(`\n## ${section}\n`);
    if (start < 0) { out.push(`✖ site prose: README has no "## ${section}" section → restore it`); continue; }
    const rest = readme.slice(start + 1);
    const body = rest.slice(rest.indexOf('\n') + 1).split(/\n## /)[0]!;
    for (const m of body.matchAll(/```[^\n]*\n([\s\S]*?)```/g)) if (!m[1]!.includes('verb=')) want(section, m[1]!);
    const prose = body.replace(/```[\s\S]*?```/g, '').replace(/<!--[\s\S]*?-->/g, '').replace(/<picture>[\s\S]*?<\/picture>/g, '').replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/<\/?details>|<summary>[\s\S]*?<\/summary>/g, '');
    for (const block of prose.split(/\n\s*\n/)) {
      const lines = block.split('\n').filter((l) => l.trim());
      if (lines[0]?.startsWith('|')) {
        for (const row of lines) {
          if (/^\|[\s|:-]+\|?$/.test(row)) continue;
          for (const cell of row.split('|').slice(1, -1)) want(section, plain(cell).replace(/^(\w+): /, '$1 ').replace(' · ', ' '));
        }
      } else for (const item of block.split(/\n(?=- )/)) want(section, plain(item.replace(/^\s*- /, '')));
    }
  }
  for (const u of story.useCases) {
    const blurb = VERB_BLURBS[u.verb];
    if (blurb && !plain(readme).toLowerCase().includes(blurb.toLowerCase())) out.push(`✖ site prose: use-case blurb for ${u.verb} ("${blurb}") is not in the README → make build-site.ts's VERB_BLURBS match the README bullet`);
  }
  return out;
}

/** The real dry-run: the built CLI in a throwaway project (a temp dir with .mm3 and copies of the repo's top-level folders, so `where:` paths resolve; a symlink would be refused as outside the project), free (no call, no spend). Returns the first ✖ line or null. */
export function cliDryRun(verb: string, yaml: string): string | null {
  const cli = path.resolve('dist/cli.js');
  if (!existsSync(cli)) return '✖ build: dist/cli.js missing → run npm run build';
  const tmp = mkdtempSync(path.join(tmpdir(), 'mm3-readme-'));
  try {
    mkdirSync(path.join(tmp, '.mm3'));
    for (const d of ['src', 'docs', 'scripts', 'test', 'skills', 'templates', 'package.json']) if (existsSync(d)) cpSync(path.resolve(d), path.join(tmp, d), { recursive: true });
    const r = spawnSync(process.execPath, [cli, verb, '-', '--dry-run'], { cwd: tmp, input: yaml, encoding: 'utf8', env: { ...process.env, MM3_PROVIDER: 'fake' } });
    if (r.error) return '✖ build: dist/cli.js missing → run npm run build';
    if (r.status === 0) return null;
    return (r.stdout + r.stderr).split('\n').find((l) => l.startsWith('✖')) ?? `exit ${r.status}`;
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  let story: Story | undefined;
  let problems: string[];
  try { story = loadStory(); problems = checkStory(story); } catch (e) { problems = [`✖ story.yaml: ${(e as Error).message.split('\n')[0]} → fix docs/story.yaml`]; }
  if (!problems.length) {
    const md = readFileSync('README.md', 'utf8');
    problems = checkReadme(md, story!, { root: '.', dryRun: cliDryRun, published: false });
    buildSite(story!); // the site is built here so CI and a clean checkout check the page they would ship
    problems.push(...checkSite(readFileSync('site/dist/index.html', 'utf8'), story!, 'site/dist', md, loadScenes()));
  }
  for (const p of problems) console.log(p);
  console.log(problems.length ? `readme: ${problems.length} problem(s)` : 'readme OK');
  process.exit(problems.length ? 1 : 0);
}
