/**
 * Builds the mm3lab.dev landing page: fills site/template.html from site/story.yaml (so the site and the README
 * repeat the same phrases) and the two-story demo player from site/scenes/*.json, then copies site/style.css, site/player.js and docs/assets/* (the SVGs; the GIFs are the README's, the page runs the live player) next to it in site/dist/ (gitignored).
 * renderSite is pure so a unit test can pin the escaping and the lists; the main block does the file work.
 */
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { loadStories, renderPlayer } from './build-demo.ts';
import { loadStory, type Story } from './story.ts';

/** The site is served apart from the repo, so a number's method links to the GitHub copy of the doc. */
const BLOB = 'https://github.com/mvp-scale/mm3/blob/main/';
export const methodUrl = (method: string): string => BLOB + method;

export const VERB_BLURBS: Record<string, string> = {
  class: 'One class call, three angles per concern, a verdict for each.',
  replay: "Re-asks a past run's own questions across two commits, so you check the fix without re-checking everything.",
  scan: 'Sweeps a folder and ranks the files that most need a look.',
  loop: 'Puts a plan through the same checklist before anyone writes it.',
  view: 'Looks a request up in the ledger: free, no call.',
  drill: 'Digs into one weak spot a past run flagged.',
};

export const esc = (s: string): string => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

/** Fills `{{key}}` placeholders (story text HTML-escaped); an unknown key throws so a typo cannot ship blank. */
export function renderSite(story: Story, template: string, extra: Record<string, string> = {}): string {
  const values: Record<string, string> = {
    tagline: esc(story.tagline),
    identity: esc(story.identity),
    installClaude: esc(story.install.claude),
    installClaudeInstall: esc(story.install.claudeInstall),
    installNpm: esc(story.install.npm),
    installNpmInit: esc(story.install.npmInit),
    installEndpoint: esc(story.install.endpoint),
    numbers: story.numbers
      .map((n) => `    <li><a href="${esc(methodUrl(n.method))}"><span class="stat">${esc(n.text)}</span><span class="meth">How it was measured</span></a></li>`)
      .join('\n'),
    useCases: story.useCases
      .map((u) => `    <li class="card"><h3>${esc(u.title)}</h3><p>${esc(VERB_BLURBS[u.verb] ?? '')}</p><p class="start">Start with <code>mm3 template ${esc(u.verb)}</code></p></li>`)
      .join('\n'),
    demo: '',
    ...extra,
  };
  return template.replace(/\{\{(\w+)\}\}/g, (_m, key: string) => {
    if (!(key in values)) throw new Error(`✖ site template: unknown placeholder {{${key}}} → use one of ${Object.keys(values).join(', ')}`);
    return values[key]!;
  });
}

/** Demo slot: the interactive player, rendered from the frozen scene JSON in site/scenes/ (empty when there are none). */
export function demoSlot(playerHtml: string): string {
  return playerHtml ? `  ${playerHtml}` : '';
}

/** Writes site/dist/ (index.html, style.css, docs/assets/*) from site/story.yaml; returns the note to print. */
export function buildSite(story: Story = loadStory(), dist = 'site/dist'): string {
  rmSync(dist, { recursive: true, force: true });
  mkdirSync(dist, { recursive: true });
  const stories = existsSync('site/scenes') ? loadStories() : [];
  writeFileSync(path.join(dist, 'index.html'), renderSite(story, readFileSync('site/template.html', 'utf8'), { demo: demoSlot(stories.length ? renderPlayer(stories) : '') }));
  copyFileSync('site/style.css', path.join(dist, 'style.css'));
  copyFileSync('site/player.js', path.join(dist, 'player.js'));
  for (const f of readdirSync('docs/assets')) if (!f.endsWith('.gif')) cpSync(path.join('docs/assets', f), path.join(dist, f));
  return `site built: ${dist}/index.html (${stories.reduce((n, st) => n + st.scenes.length, 0)} player steps in ${stories.length} stories)`;
}

if (import.meta.url === `file://${process.argv[1]}`) console.log(buildSite());
