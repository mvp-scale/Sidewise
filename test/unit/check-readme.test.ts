// Fixtures for scripts/check-readme.ts's pure checker: each rule fails on a small bad README and passes on a good one.
import { describe, expect, it } from 'vitest';
import { checkReadme, type Story } from '../../scripts/check-readme.ts';

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
const opts = (dryRun = ok) => ({ root: 'test/unit/fixtures/readme', dryRun });

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
});
