// Unit tests for scripts/build-site.ts (the {{key}} filler) and checkSite (the site drift check); no build, no network.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { demoSlot, methodUrl, renderSite } from '../../scripts/build-site.ts';
import { checkSite, loadStory, type Story } from '../../scripts/check-readme.ts';

const story: Story = {
  tagline: 'Checklists in. Calibrated verdicts out.',
  identity: 'MM3 turns a checklist into a verdict.',
  numbers: [{ text: '$0.000065 per check & more', method: 'docs/numbers.md#cost-per-check' }],
  install: { claude: '/plugin marketplace add x/y', claudeInstall: '/plugin install x@y', npm: 'npm install -g @mvpscale/mm3', npmInit: 'mm3 init', endpoint: 'MM3_BASE_URL=https://x.example mm3 class r.yaml' },
  useCases: [{ title: 'Check a change', verb: 'class' }, { title: 'Find <where> it lives', verb: 'scan' }],
};

describe('renderSite', () => {
  it('fills the tagline and one <li> per use case', () => {
    const html = renderSite(story, '<h1>{{tagline}}</h1>{{useCases}}');
    expect(html).toContain('<h1>Checklists in. Calibrated verdicts out.</h1>');
    expect(html.match(/<li/g)).toHaveLength(2);
  });
  it('escapes markup in story text', () => {
    const html = renderSite(story, '{{useCases}}');
    expect(html).toContain('Find &lt;where&gt; it lives');
    expect(html).not.toContain('<where>');
  });
  it('keeps a "$" in story text literal and links each number to the GitHub copy of its method', () => {
    const html = renderSite(story, '{{numbers}}');
    expect(html).toContain('$0.000065 per check &amp; more');
    expect(html).toContain('href="https://github.com/mvp-scale/mm3/blob/nightly/docs/numbers.md#cost-per-check"');
  });
  it('throws on an unknown placeholder, and fills the demo slot only when given', () => {
    expect(() => renderSite(story, '{{nope}}')).toThrow(/unknown placeholder/);
    expect(renderSite(story, '[{{demo}}]')).toBe('[]');
    expect(demoSlot('<div class="player"></div>')).toContain('class="player"');
    expect(demoSlot('')).toBe('');
  });
});

describe('checkSite', () => {
  const html = renderSite(story, '<title>MM3</title>{{tagline}}{{identity}}{{installClaude}}{{installClaudeInstall}}{{installNpm}}{{installNpmInit}}{{installEndpoint}}{{numbers}}{{useCases}}');
  it('passes a page that carries every story phrase and a linked method', () => {
    expect(checkSite(html, story)).toEqual([]);
  });
  it('names a missing phrase, a missing link and an old name', () => {
    const bad = html.replace(story.tagline, 'Something else').replace(methodUrl(story.numbers[0]!.method), 'x') + '\nside: goal';
    const problems = checkSite(bad, story).join('\n');
    expect(problems).toMatch(/story\.tagline/);
    expect(problems).toMatch(/story\.numbers\[0\]: no link/);
    expect(problems).toMatch(/old name/);
  });
  it('renders the real template from the real story with no drift', () => {
    const real = loadStory();
    const page = renderSite(real, readFileSync('site/template.html', 'utf8'), { demo: demoSlot('') });
    expect(checkSite(page, real)).toEqual([]);
    expect(page).toContain('<title>MM3: ');
    expect(page).not.toMatch(/https?:\/\/(?!github\.com|mm3lab\.dev|www\.w3\.org|api\.example\.com)/);
  });
  describe('prose drift against the README', () => {
    const real = loadStory();
    const readme = readFileSync('README.md', 'utf8');
    const page = renderSite(real, readFileSync('site/template.html', 'utf8'), { demo: demoSlot('') });
    it('passes for the real README and template', () => {
      expect(checkSite(page, real, undefined, readme)).toEqual([]);
    });
    it('fails when a Limits bullet in the README is edited', () => {
      const drifted = readme.replace('0.9 is wrong about one time in ten.', '0.9 is wrong about one time in twenty.');
      expect(drifted).not.toBe(readme);
      expect(checkSite(page, real, undefined, drifted).join('\n')).toMatch(/Limits and alternatives/);
    });
    it('fails when See it run prose or a Why paragraph drifts', () => {
      const a = readme.replace('Each concern gets its own verdict and odds.', 'Each concern gets a verdict.');
      expect(checkSite(page, real, undefined, a).join('\n')).toMatch(/See it run/);
      const b = readme.replace('each answer is untraceable and never reused', 'each answer is anonymous and never reused');
      expect(checkSite(page, real, undefined, b).join('\n')).toMatch(/Why we built it/);
    });
    it('treats the README-only link to the site as not prose the site must carry', () => {
      expect(readme).toContain('<p align="center"><a href="https://mm3lab.dev/#run">Step through both stories on mm3lab.dev →</a></p>');
      expect(checkSite(page, real, undefined, readme)).toEqual([]);
      const other = readme.replace('<p align="center"><a href="https://mm3lab.dev/#run">Step through both stories on mm3lab.dev →</a></p>', '<p align="center">Step through both stories somewhere else.</p>');
      expect(checkSite(page, real, undefined, other).join('\n')).toMatch(/See it run/);
    });
    it('fails when a table cell or a use-case blurb drifts', () => {
      const a = readme.replace('recheck after a fix', 'recheck after any fix');
      expect(checkSite(page, real, undefined, a).join('\n')).toMatch(/What you get/);
      const b = readme.replace('ranks the files that most need a look', 'ranks the files');
      expect(checkSite(page, real, undefined, b).join('\n')).toMatch(/blurb for scan/);
    });
  });
});
