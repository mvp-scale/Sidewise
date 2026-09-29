// Fixtures for scripts/check-readme.ts's pure checker: each rule fails on a small bad README and passes on a good one.
import { describe, expect, it } from 'vitest';
import { checkReadme, checkStory, type Story } from '../../scripts/check-readme.ts';

const story: Story = {
  tagline: 'Checklists in. Calibrated verdicts out.',
  identity: 'MM3 turns a checklist into a verdict.',
  numbers: [],
  install: { claude: '/plugin marketplace add x/y', npm: 'npm install -g @mvpscale/mm3', nokey: 'MM3_PROVIDER=fake mm3 class r.yaml' },
  useCases: [],
};
const ok = (): string | null => null;
const good = [
  '# MM3', '', 'Checklists in. Calibrated verdicts out.', '', 'MM3 turns a checklist into a verdict.', '',
  '<picture><source media="(prefers-color-scheme: dark)" srcset="docs/assets/a.svg"><img src="docs/assets/a.svg" alt="how"></picture>',
  '', '## Install', '', '```bash', '/plugin marketplace add x/y', 'npm install -g @mvpscale/mm3', 'MM3_PROVIDER=fake mm3 class r.yaml', '```',
  '', '## License', '', 'Apache-2.0 · [contract](docs/contract.md)',
].join('\n');
const opts = (dryRun: (verb: string, yaml: string) => string | null = ok) => ({ root: 'test/unit/fixtures/readme', dryRun });

describe('checkReadme', () => {
  it('passes a README that follows every rule', () => {
    expect(checkReadme(good, story, opts())).toEqual([]);
  });
  it('needs a visual before the first H2', () => {
    const md = good.replace(/<picture>.*<\/picture>\n/, '');
    expect(checkReadme(md, story, opts())).toContainEqual(expect.stringMatching(/^✖ visual: .*before the first ## heading/));
  });
  it('needs the story phrases verbatim', () => {
    const md = good.replace('Calibrated verdicts out.', 'Verdicts.');
    expect(checkReadme(md, story, opts())).toContainEqual(expect.stringMatching(/^✖ story\.tagline: /));
  });
  it('runs every request example through the dry-run and reports its stop', () => {
    const md = good + '\n\n```yaml\nmak:\n  goal: x\n```\n';
    const bad = (): string | null => '✖ mak.goal: is too short';
    expect(checkReadme(md, story, opts(bad))).toContainEqual('✖ example 1 (line 22): ✖ mak.goal: is too short');
  });
  it('flags a broken relative link or asset', () => {
    const md = good.replace('docs/contract.md', 'docs/nope.md');
    expect(checkReadme(md, story, opts())).toContainEqual(expect.stringMatching(/^✖ link: docs\/nope\.md does not exist/));
  });
  it('flags old names and an npm badge while unpublished', () => {
    const md = good + '\nside: x\n[![npm](https://img.shields.io/npm/v/@mvpscale/mm3)](x)\n';
    const out = checkReadme(md, story, { ...opts(), published: false });
    expect(out).toContainEqual(expect.stringMatching(/^✖ old name: /));
    expect(out).toContainEqual(expect.stringMatching(/^✖ badge: npm badge for an unpublished package/));
  });
  it('needs the first command within 30 lines', () => {
    const md = good.replace('## Install', Array(40).fill('filler').join('\n') + '\n## Install');
    expect(checkReadme(md, story, opts())).toContainEqual(expect.stringMatching(/^✖ first command: line \d+ → move install up/));
  });
  const rec = () => { const calls: string[] = []; return { calls, fn: (v: string): string | null => { calls.push(v); return null; } }; };
  const req = '```yaml verb=scan\nmak:\n  goal: x\n```\n';
  it('takes the verb from the fence info string', () => {
    const r = rec();
    checkReadme(good + '\n\n' + req, story, opts(r.fn));
    expect(r.calls).toEqual(['scan']);
  });
  it('takes the verb from mak.verb first', () => {
    const r = rec();
    checkReadme(good + '\n\n```yaml verb=scan\nmak:\n  verb: drill\n  goal: x\n```\n', story, opts(r.fn));
    expect(r.calls).toEqual(['drill']);
  });
  it('takes the verb from the nearest preceding mm3 <verb> line, else class', () => {
    const r = rec();
    checkReadme(good + '\n\nRun mm3 replay r.yaml first.\n\n```yaml\nmak:\n  goal: x\n```\n', story, opts(r.fn));
    checkReadme(good + '\n\n```yaml\nmak:\n  goal: x\n```\n', story, opts(r.fn));
    expect(r.calls).toEqual(['replay', 'class']);
  });
  it('skips a yaml block that is not a request', () => {
    const r = rec();
    checkReadme(good + '\n\n```yaml\nnext: x\n```\n', story, opts(r.fn));
    expect(r.calls).toEqual([]);
  });
  it('flags more than 4 badges', () => {
    const md = good + '\n' + Array(5).fill('![b](https://img.shields.io/x)').join('\n');
    expect(checkReadme(md, story, opts())).toContainEqual(expect.stringMatching(/^✖ badge: 5 badges/));
  });
  it('needs a License section', () => {
    expect(checkReadme(good.replace('## License', '## Legal'), story, opts())).toContainEqual(expect.stringMatching(/^✖ footer: /));
  });
  it('needs install, use-case and number phrases', () => {
    const s2: Story = { ...story, numbers: [{ text: '42 checks', method: 'm' }], useCases: [{ title: 'Do a thing', verb: 'class' }] };
    const out = checkReadme(good.replace('npm install -g @mvpscale/mm3', 'x'), s2, opts());
    expect(out).toContainEqual(expect.stringMatching(/^✖ story\.install\.npm: /));
    expect(out).toContainEqual(expect.stringMatching(/^✖ story\.numbers\[0\]: /));
    expect(out).toContainEqual(expect.stringMatching(/^✖ story\.useCases\[0\]: /));
  });
  it('still flags another old name on the same line as the repo URL, but not prose Side:', () => {
    const out = checkReadme(good + '\nmvp-scale/Sidewise and sidewise class\nSide: prose\n', story, opts());
    expect(out.filter((l) => l.startsWith('✖ old name'))).toHaveLength(1);
  });
  it('flags the capitalised old name Sidewise, but not the repo URL', () => {
    const out = checkReadme(good + '\nSidewise turns a checklist\nsee mvp-scale/Sidewise\n', story, opts());
    expect(out.filter((l) => l.startsWith('✖ old name'))).toHaveLength(1);
  });
});

describe('checkStory', () => {
  it('accepts a good story and names each bad field', () => {
    expect(checkStory(story)).toEqual([]);
    const out = checkStory({ tagline: 1, install: {}, numbers: 'x' });
    expect(out).toContainEqual(expect.stringMatching(/^✖ story\.yaml: tagline /));
    expect(out).toContainEqual(expect.stringMatching(/^✖ story\.yaml: install\.npm /));
    expect(out).toContainEqual(expect.stringMatching(/^✖ story\.yaml: numbers /));
    expect(out).toContainEqual(expect.stringMatching(/^✖ story\.yaml: useCases /));
  });
});
