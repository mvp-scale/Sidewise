/**
 * README drift protection (mechanical layer): the README formula's checkable rules as one pure function, so a
 * README edit that breaks the story, an example, a link or the shape fails `npm run check:readme` in CI.
 * The judgment rules (tone, clarity) are graded by the MM3 request in scripts/readme-judgment.yaml instead.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
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

const OLD = /\b(?:side|wise):|\bsidewise\b(?!-?play)|\bSW-\d{4}\b/;
const VERBS = 'view|class|replay|scan|drill|loop';

/** Shape check for docs/story.yaml: a bad file becomes problem lines, not a TypeError. */
export function checkStory(raw: unknown): string[] {
  const out: string[] = [];
  const o = (raw ?? {}) as Record<string, unknown>;
  const str = (v: unknown) => typeof v === 'string' && v.trim() !== '';
  for (const k of ['tagline', 'identity']) if (!str(o[k])) out.push(`✖ story.yaml: ${k} must be a non-empty string → fix docs/story.yaml`);
  const inst = (o.install ?? {}) as Record<string, unknown>;
  for (const k of ['claude', 'npm', 'nokey']) if (!str(inst[k])) out.push(`✖ story.yaml: install.${k} must be a non-empty string → fix docs/story.yaml`);
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
    ['story.install.claude', story.install.claude], ['story.install.npm', story.install.npm], ['story.install.nokey', story.install.nokey],
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

/** The real dry-run: the built CLI in a throwaway project (a temp dir with .mm3 and links to the repo's top-level folders, so `where:` paths resolve), free (no call, no spend). Returns the first ✖ line or null. */
export function cliDryRun(verb: string, yaml: string): string | null {
  const cli = path.resolve('dist/cli.js');
  if (!existsSync(cli)) return '✖ build: dist/cli.js missing → run npm run build';
  const tmp = mkdtempSync(path.join(tmpdir(), 'mm3-readme-'));
  try {
    mkdirSync(path.join(tmp, '.mm3'));
    for (const d of ['src', 'docs', 'scripts', 'test', 'skills', 'templates', 'package.json']) if (existsSync(d)) symlinkSync(path.resolve(d), path.join(tmp, d));
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
  if (!problems.length) problems = checkReadme(readFileSync('README.md', 'utf8'), story!, { root: '.', dryRun: cliDryRun, published: false });
  for (const p of problems) console.log(p);
  console.log(problems.length ? `readme: ${problems.length} problem(s)` : 'readme OK');
  process.exit(problems.length ? 1 : 0);
}
