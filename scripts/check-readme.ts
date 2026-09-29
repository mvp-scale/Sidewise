/**
 * README drift protection (mechanical layer): the README formula's checkable rules as one pure function, so a
 * README edit that breaks the story, an example, a link or the shape fails `npm run check:readme` in CI.
 * The judgment rules (tone, clarity) are graded by the MM3 request in scripts/readme-judgment.yaml instead.
 */
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { parse } from 'yaml';

export type Story = {
  tagline: string;
  identity: string;
  numbers: { text: string; method: string }[];
  install: { claude: string; npm: string; nokey: string };
  useCases: { title: string; verb: string }[];
};
type Opts = { root: string; dryRun: (verb: string, yaml: string) => string | null; published?: boolean };

export function loadStory(file = 'docs/story.yaml'): Story {
  return parse(readFileSync(file, 'utf8')) as Story;
}

const OLD = /\b(?:side|wise):|\bsidewise\b(?!-?play)|\bSW-\d{4}\b/i;

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
    ['story.install.claude', story.install.claude], ['story.install.npm', story.install.npm], ['story.install.nokey', story.install.nokey],
    ...story.numbers.map((n, i): [string, string] => [`story.numbers[${i}]`, n.text]),
    ...story.useCases.map((u, i): [string, string] => [`story.useCases[${i}]`, u.title]),
  ];
  for (const [key, text] of phrases) if (!md.includes(text)) out.push(`✖ ${key}: "${text}" is not in the README → copy it verbatim from docs/story.yaml`);
  let n = 0;
  for (const m of md.matchAll(/```yaml\n([\s\S]*?)```/g)) {
    const body = m[1]!;
    if (!/^mak:/m.test(body)) continue; // a response block (next:/notes:) or config, not a request
    n++;
    const line = md.slice(0, m.index).split('\n').length + 1;
    const verb = /^\s*verb:\s*([a-z]+)/m.exec(body)?.[1] ?? 'class';
    const stop = opts.dryRun(verb, body);
    if (stop) out.push(`✖ example ${n} (line ${line}): ${stop}`);
  }
  for (const m of md.matchAll(/(?:\]\(|src="|srcset=")((?!https?:|#|mailto:)[^)"\s#]+)/g)) {
    if (!existsSync(path.join(opts.root, m[1]!))) out.push(`✖ link: ${m[1]} does not exist → fix the path`);
  }
  lines.forEach((l, i) => { if (OLD.test(l) && !l.includes('mvp-scale/Sidewise')) out.push(`✖ old name: line ${i + 1} → use mak:/mdl:/mm3/MM3-`); });
  const badges = md.match(/img\.shields\.io|badge\.svg/g)?.length ?? 0;
  if (badges > 4) out.push(`✖ badge: ${badges} badges → keep 4 or fewer`);
  if (opts.published === false && /shields\.io\/npm\//.test(md)) out.push('✖ badge: npm badge for an unpublished package → remove it until the first publish');
  if (!/^## License/m.test(md)) out.push('✖ footer: no ## License section → add the short footer');
  return out;
}

/** The real dry-run: the built CLI in a throwaway project, free (no call, no spend). Returns the first ✖ line or null. */
export function cliDryRun(verb: string, yaml: string): string | null {
  const r = spawnSync(process.execPath, [path.resolve('dist/cli.js'), verb, '-', '--dry-run'], { input: yaml, encoding: 'utf8', env: { ...process.env, MM3_PROVIDER: 'fake' } });
  if (r.status === 0) return null;
  return (r.stdout + r.stderr).split('\n').find((l) => l.startsWith('✖')) ?? `exit ${r.status}`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const problems = checkReadme(readFileSync('README.md', 'utf8'), loadStory(), { root: '.', dryRun: cliDryRun, published: false });
  for (const p of problems) console.log(p);
  console.log(problems.length ? `readme: ${problems.length} problem(s)` : 'readme OK');
  process.exit(problems.length ? 1 : 0);
}
