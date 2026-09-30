/**
 * Requirement -> test trace. docs/contract.md tags every normative claim [C-###]; a test proves one by
 * carrying the same tag in its title or a nearby comment. `npm run check:trace` fails (exit 1) on any claim
 * with zero covering tests, printing one help-first line per gap. `--md <path>` also writes docs/evidence/trace.md,
 * a readable page: each claim in full, grouped by the contract's own sections, with the test that proves it.
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export interface Claim {
  id: string;
  text: string;
  line: number;
}
export interface TestTag {
  id: string;
  file: string;
}

const TAG = /\[C-(\d{3})\]/gu;

export function parseClaims(md: string): Claim[] {
  const lines = md.split('\n');
  const claims: Claim[] = [];
  lines.forEach((line, i) => {
    for (const m of line.matchAll(TAG)) claims.push({ id: `C-${m[1]}`, text: line.trim(), line: i + 1 });
  });
  return claims;
}

export interface DescribedClaim {
  id: string;
  line: number;
  section: string; // the contract's own ## heading the claim sits under
  sub: string; // its ### heading, or ''
  text: string; // the whole sentence the tag ends, not just the line it sits on
}

const clean = (t: string): string => t.replace(/\s+/gu, ' ').replace(/\*\*/gu, '').trim();

/** Each tag with the full sentence it ends and the section it lives in. Unlike parseClaims (the physical line), this joins a
 *  sentence that wraps over several lines and splits two tags on one line, so a claim reads whole. */
export function describeClaims(md: string): DescribedClaim[] {
  const out: DescribedClaim[] = [];
  let section = 'Overview';
  let sub = '';
  let buf = '';
  let fence = false;
  md.split('\n').forEach((raw, i) => {
    const line = raw.trim();
    if (line.startsWith('```')) {
      fence = !fence;
      buf = '';
      return;
    }
    const h = /^(#{1,3})\s+(.*)$/u.exec(line);
    if (!fence && h) {
      if (h[1] === '##') [section, sub] = [h[2]!, ''];
      else if (h[1] === '###') sub = h[2]!;
      buf = '';
      return;
    }
    if (line === '') {
      buf = '';
      return;
    }
    const row = line.startsWith('|');
    const item = /^([-*]|\d+\.)\s+/u.test(line);
    if (fence || row || item) buf = ''; // a table row, list item or code line starts its own claim
    const body = row ? line.replace(/^\||\|$/gu, '').split('|').map((c) => c.trim()).join(' · ') : line.replace(/^([-*]|\d+\.)\s+/u, '');
    const parts = body.split(/\[C-(\d{3})\]/u); // [text, digits, text, digits, ..., text]
    for (let k = 0; k < parts.length; k += 2) {
      buf += `${buf ? ' ' : ''}${parts[k]}`;
      if (k + 1 < parts.length) {
        out.push({ id: `C-${parts[k + 1]}`, line: i + 1, section, sub, text: clean(buf) });
        buf = '';
      }
    }
  });
  return out;
}

// Skips any "fixtures" directory: test/fixtures/trace/tests/*.test.ts are trace.ts's OWN tiny synthetic
// fixtures (test/unit/trace.test.ts calls findTags on that folder directly), not the real corpus. Without
// this, a real run over 'test' would also walk into them, and their [C-001]/[C-002] tags — reused on purpose,
// to pin the id format — would falsely "cover" docs/contract.md's real C-001/C-002 claims.
function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory() && e.name === 'fixtures') continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (e.name.endsWith('.test.ts')) out.push(full);
  }
  return out;
}

export function findTags(testRoot: string): TestTag[] {
  const out: TestTag[] = [];
  for (const file of walk(testRoot)) {
    const text = readFileSync(file, 'utf8');
    for (const m of text.matchAll(TAG)) out.push({ id: `C-${m[1]}`, file: file.split(path.sep).join('/') });
  }
  return out;
}

export interface TraceReport {
  claims: Claim[];
  covered: Set<string>;
  untraced: Claim[];
  unknownTags: TestTag[];
  described: DescribedClaim[];
  tests: Map<string, string[]>; // claim id -> the test files that carry its tag
}

export function trace(claimsMd: string, testRoot: string): TraceReport {
  const claims = parseClaims(claimsMd);
  const claimIds = new Set(claims.map((c) => c.id));
  const tags = findTags(testRoot);
  const covered = new Set(tags.filter((t) => claimIds.has(t.id)).map((t) => t.id));
  const tests = new Map<string, string[]>();
  for (const t of tags) if (claimIds.has(t.id) && !tests.get(t.id)?.includes(t.file)) tests.set(t.id, [...(tests.get(t.id) ?? []), t.file]);
  return { claims, covered, untraced: claims.filter((c) => !covered.has(c.id)), unknownTags: tags.filter((t) => !claimIds.has(t.id)), described: describeClaims(claimsMd), tests };
}

/** How many distinct claims: a claim can carry its tag twice, so this is not claims.length. */
export const claimCount = (report: TraceReport): number => new Set(report.claims.map((c) => c.id)).size;

const shortTest = (f: string): string => f.replace(/^test\//u, '');

export function renderTraceDoc(report: TraceReport): string {
  const total = claimCount(report);
  const sections: { name: string; claims: DescribedClaim[] }[] = [];
  for (const c of report.described) {
    let s = sections.find((x) => x.name === c.section);
    if (!s) sections.push((s = { name: c.section, claims: [] }));
    s.claims.push(c);
  }
  const proved = (c: DescribedClaim): boolean => report.covered.has(c.id);
  const count = (cs: DescribedClaim[]): string => `${new Set(cs.filter(proved).map((c) => c.id)).size} of ${new Set(cs.map((c) => c.id)).size}`;
  const toc = sections.map((s) => `| ${s.name} | ${count(s.claims)} |`).join('\n');
  const shown = new Set<string>(); // the test is named once per id: the same id on several bullets is one claim with one proof
  const body = sections.map((s) => {
    let lastSub = '';
    const lines = s.claims.map((c) => {
      const head = c.sub && c.sub !== lastSub ? `\n#### ${c.sub}\n\n` : '';
      lastSub = c.sub;
      const tests = report.tests.get(c.id) ?? [];
      const by = tests.length ? `\`${shortTest(tests[0]!)}\`${tests.length > 1 ? ` +${tests.length - 1} more` : ''}` : '✖ no test';
      const proof = shown.has(c.id) ? '' : ` · ${by}`;
      shown.add(c.id);
      return `${head}- **${c.id}** ${c.text.replace(/\|/gu, '\\|')}${proof}`;
    });
    return `## ${s.name}\n\n${count(s.claims)} claims have a test.\n\n${lines.join('\n')}`;
  });
  return `# Contract trace

\`docs/contract.md\` states every promise the answer format makes, and tags each one with an id like \`[C-001]\`. A test proves a promise by carrying the same id. This page lists every claim in full, grouped by the contract's own sections, with the test that proves it.

**${report.covered.size} of ${total} claims have a test.** Generated by \`scripts/trace.ts\`; do not hand-edit. Run \`npm run check:trace\` to fail on any claim without one.

| Section | Claims with a test |
|---|---|
${toc}

${body.join('\n\n')}
`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const report = trace(readFileSync('docs/contract.md', 'utf8'), 'test');
  const mdIdx = process.argv.indexOf('--md');
  if (mdIdx >= 0) writeFileSync(process.argv[mdIdx + 1]!, renderTraceDoc(report));
  for (const c of report.untraced) console.error(`✖ trace: ${c.id} is not covered by any test → tag the test that proves it with "[${c.id}]" in its title or a nearby comment`);
  if (report.untraced.length) {
    console.error(`✖ trace: ${report.untraced.length} untraced claim${report.untraced.length === 1 ? '' : 's'} → see above`);
    process.exit(1);
  }
  console.log(`${report.covered.size}/${claimCount(report)} claims traced`);
}
