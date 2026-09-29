/**
 * Builds the mm3lab.dev landing page: fills site/template.html from docs/story.yaml (so the site and the README
 * repeat the same phrases), then copies site/style.css and docs/assets/* next to it in site/dist/ (gitignored).
 * renderSite is pure so a unit test can pin the escaping and the lists; the main block does the file work.
 */
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { loadStory, type Story } from './check-readme.ts';

/** The site is served apart from the repo, so a number's method links to the GitHub copy of the doc. */
const BLOB = 'https://github.com/mvp-scale/Sidewise/blob/nightly/';
export const methodUrl = (method: string): string => BLOB + method;

const VERB_BLURBS: Record<string, string> = {
  class: 'One call, three angles per concern, a verdict for each.',
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
    installNpm: esc(story.install.npm),
    installNokey: esc(story.install.nokey),
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

/** Demo slot: the README's GIF, full width, when docs/assets/demo.gif exists; nothing otherwise. */
export function demoSlot(hasGif: boolean): string {
  return hasGif
    ? '  <figure class="demo"><img src="demo.gif" alt="A terminal recording: an agent writes a request, runs mm3 class, and reads the verdict" loading="lazy"></figure>'
    : '';
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dist = 'site/dist';
  rmSync(dist, { recursive: true, force: true });
  mkdirSync(dist, { recursive: true });
  const hasGif = existsSync('docs/assets/demo.gif');
  const html = renderSite(loadStory(), readFileSync('site/template.html', 'utf8'), { demo: demoSlot(hasGif) });
  writeFileSync(path.join(dist, 'index.html'), html);
  copyFileSync('site/style.css', path.join(dist, 'style.css'));
  for (const f of readdirSync('docs/assets')) cpSync(path.join('docs/assets', f), path.join(dist, f));
  console.log(`site built: ${dist}/index.html${hasGif ? ' (with demo.gif)' : ' (no demo.gif yet)'}`);
}
