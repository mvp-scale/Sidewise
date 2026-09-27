// sidewise template <verb>: a copy-editable request, never a response; each one validates on its own.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { readRequestText } from '../../src/contract/read.ts';
import { VERBS, type Verb } from '../../src/contract/types.ts';
import { validateRequest } from '../../src/contract/validate.ts';
import { runTemplate } from '../../src/verbs/template.ts';
import { runClass } from '../../src/verbs/class.ts';
import { runScan } from '../../src/verbs/scan.ts';
import { tempProject } from '../helpers/project.ts';
import { stubProvider } from '../helpers/stub-provider.ts';

const env = { SIDEWISE_ACTOR: 'r' };

describe('runTemplate', () => {
  it.each(VERBS)('%s: prints a request that validates on its own', (verb) => {
    const r = runTemplate(verb);
    expect(r.exit).toBe(0);
    const parsed = readRequestText(r.text);
    expect(parsed.ok).toBe(true);
    const v = parsed.ok && validateRequest(parsed.value, verb);
    expect(v && v.ok).toBe(true);
  });

  it('an unknown verb: a clean stop', () => {
    expect(runTemplate('nope')).toEqual({ exit: 2, text: '✖ template: "nope" is not a verb → one of view, class, change, scan, drill, loop' });
  });

  it('--parent only applies to drill', () => {
    expect(runTemplate('class', { parent: 'SW-0001' })).toEqual({ exit: 2, text: '✖ template: --parent only applies to drill → sidewise template class' });
  });

  it('drill needs both flags together, or neither', () => {
    expect(runTemplate('drill', { parent: 'SW-0001' }).exit).toBe(2);
    expect(runTemplate('drill', { from: 'x' }).exit).toBe(2);
  });

  it('drill with both flags: overlays parent/from, keeps the rest, still validates', () => {
    const r = runTemplate('drill', { parent: 'SW-0099', from: 'access' });
    expect(r.exit).toBe(0);
    expect(r.text).toContain('parent: SW-0099');
    expect(r.text).toContain('from: access');
    expect(r.text).toContain('call: each'); // the sample over: is untouched
    const parsed = readRequestText(r.text);
    const v = parsed.ok && validateRequest(parsed.value, 'drill');
    expect(v && v.ok).toBe(true);
  });

  it('no ledger reachable: keeps the sweep sample (unchanged today-behaviour) [C-090]', () => {
    const r = runTemplate('drill', { parent: 'SW-0099', from: 'access' }, undefined);
    expect(r.text).toContain('over:');
    expect(r.text).toContain('call: each');
  });

  describe('drill --parent/--from shaped by the ledger, when one is reachable [C-090]', () => {
    const classReq =
      'side:\n  goal: check this code\n  depth: quick\n  where: [src/a.ts]\n  ask:\n    injection:\n      pass: no\n' +
      Array.from({ length: 10 }, (_, i) => `      ${i + 1}: is question ${i + 1} true?\n`).join('');
    const scanReq =
      'side:\n  goal: handlers stay safe\n  depth: quick\n  over:\n    file: src/*.ts\n    function: each\n  ask:\n    function:\n      injection:\n        pass: no\n        1: is it unsafe?\n';

    it('a one-subject parent (class): no over:, from: names the category, ask: shaped for it', async () => {
      const { paths } = tempProject({ 'src/a.ts': 'x' });
      await runClass(classReq, { paths, provider: stubProvider({ yes: () => 0.9 }), env }); // SW-0001
      const r = runTemplate('drill', { parent: 'SW-0001', from: 'injection' }, paths);
      expect(r.exit).toBe(0);
      expect(r.text).toContain('parent: SW-0001');
      expect(r.text).toContain('from: injection');
      expect(r.text).not.toContain('over:');
      const parsed = readRequestText(r.text);
      const v = parsed.ok && validateRequest(parsed.value, 'drill');
      expect(v && v.ok).toBe(true);
    });

    it('a sweep parent (scan): keeps the sweep sample, over: and all', async () => {
      const { paths } = tempProject({ 'src/a.ts': 'export function findUser(req) { return db.query(req.id); }\n' });
      await runScan(scanReq, { paths, provider: stubProvider({ yes: () => 0.9 }), env }); // SW-0001
      const r = runTemplate('drill', { parent: 'SW-0001', from: 'src/a.ts/findUser' }, paths);
      expect(r.exit).toBe(0);
      expect(r.text).toContain('parent: SW-0001');
      expect(r.text).toContain('from: src/a.ts/findUser');
      expect(r.text).toContain('over:');
      expect(r.text).toContain('call: each');
      const parsed = readRequestText(r.text);
      const v = parsed.ok && validateRequest(parsed.value, 'drill');
      expect(v && v.ok).toBe(true);
    });

    it('an unknown parent id, ledger reachable: keeps the sweep sample rather than stopping', () => {
      const { paths } = tempProject({});
      const r = runTemplate('drill', { parent: 'SW-9999', from: 'access' }, paths);
      expect(r.exit).toBe(0);
      expect(r.text).toContain('over:');
    });
  });

  // fix #16: --from alone (no --parent) names a request FILE, not an item/category — a frozen checklist
  // reused on a new subject without sed.
  describe('--from a request file (fix #16)', () => {
    const write = (root: string, text: string): string => {
      const file = path.join(root, 'saved.yaml');
      writeFileSync(file, text);
      return file;
    };
    const frozen = 'side:\n  goal: old goal\n  depth: quick\n  where: [src/old.ts]\n  ask:\n    injection:\n      pass: no\n' +
      Array.from({ length: 10 }, (_, i) => `      ${i + 1}: is question ${i + 1} true?\n`).join('') +
      'wise:\n  why: validate\n  area: data\n';

    it('[C-111] prints the file back unchanged with no overrides', () => {
      const { root } = tempProject({});
      const file = write(root, frozen);
      const r = runTemplate('class', { from: file });
      expect(r.exit).toBe(0);
      expect(r.text).toContain('goal: old goal');
      expect(r.text).toContain('where:');
      expect(r.text).toContain('injection:');
    });

    it('[C-112] --where/--goal overlay the frozen ask: onto a new subject', () => {
      const { root } = tempProject({});
      const file = write(root, frozen);
      const r = runTemplate('class', { from: file, goal: 'new goal', where: ['src/new.ts'] });
      expect(r.exit).toBe(0);
      expect(r.text).toContain('goal: new goal');
      expect(r.text).toContain('src/new.ts');
      expect(r.text).not.toContain('old.ts');
      const parsed = readRequestText(r.text);
      const v = parsed.ok && validateRequest(parsed.value, 'class');
      expect(v && v.ok).toBe(true);
    });

    it('a missing file: a clean stop', () => {
      const r = runTemplate('class', { from: '/no/such/file.yaml' });
      expect(r.exit).toBe(2);
      expect(r.text).toContain('not found');
    });

    it('a file with no side: block: a clean stop', () => {
      const { root } = tempProject({});
      const file = write(root, 'wise:\n  why: validate\n');
      const r = runTemplate('class', { from: file });
      expect(r).toEqual({ exit: 2, text: `✖ template: --from "${file}" has no side: block → point at a Sidewise request file` });
    });

    it('--where/--goal without --from: a clean stop', () => {
      expect(runTemplate('class', { goal: 'x' }).exit).toBe(2);
      expect(runTemplate('class', { where: ['a'] }).exit).toBe(2);
    });

    it('--where/--goal with --parent: a clean stop (they overlay --from, not a drill item lookup)', () => {
      const r = runTemplate('drill', { parent: 'SW-0001', from: 'access', goal: 'x' });
      expect(r.exit).toBe(2);
    });
  });

  // Templates push the envelope of WHAT a request can do: every field a verb's own schema allows it to carry
  // must show up in that verb's template (a value, or — for a field that's merely legal, not needed here — a
  // commented-out example), marked required/optional in a trailing comment. This table is src/contract/
  // validate.ts's own NEEDS/NEVER (plus side.verb and wise:, which are legal on every verb) restated as data,
  // so the test drives from the same rule the validator enforces instead of re-typing it six times. [C-174]
  const ENVELOPE: Record<Verb, { required: readonly string[]; optional: readonly string[] }> = {
    class: { required: ['goal', 'depth', 'where', 'ask'], optional: ['verb'] },
    view: { required: ['goal', 'where'], optional: ['depth', 'ask', 'verb'] },
    change: { required: ['goal', 'parent', 'compare'], optional: ['verb'] },
    scan: { required: ['goal', 'depth', 'over', 'ask'], optional: ['verb'] },
    loop: { required: ['goal', 'depth', 'over', 'ask'], optional: ['where', 'verb'] },
    drill: { required: ['goal', 'parent', 'from', 'ask'], optional: ['depth', 'over', 'verb'] },
  };
  const WISE_KEYS = ['why', 'area', 'stage', 'change', 'risk', 'parent'];

  describe('templates show the full field envelope [C-174]', () => {
    it.each(VERBS)('%s: every side.* field it accepts appears in its template (live or commented)', (verb) => {
      const raw = readFileSync(path.join('skills', 'sidewise', 'templates', `${verb}.yaml`), 'utf8');
      const parsed = readRequestText(raw);
      expect(parsed.ok).toBe(true);
      const side = (parsed.ok ? parsed.value.side : {}) as Record<string, unknown>;
      const { required, optional } = ENVELOPE[verb];
      for (const field of required) expect(Object.hasOwn(side, field)).toBe(true);
      for (const field of optional) expect(raw).toMatch(new RegExp(`\\b${field}:`));
    });

    it.each(VERBS)('%s: wise: mentions every catalog key, live or commented', (verb) => {
      const raw = readFileSync(path.join('skills', 'sidewise', 'templates', `${verb}.yaml`), 'utf8');
      for (const key of WISE_KEYS) expect(raw).toMatch(new RegExp(`\\b${key}:`));
    });

    it('class.yaml demonstrates the category-level fields (need:, tags:) once, for every verb to copy [C-175]', () => {
      const raw = readFileSync(path.join('skills', 'sidewise', 'templates', 'class.yaml'), 'utf8');
      const parsed = readRequestText(raw);
      expect(parsed.ok).toBe(true);
      const ask = (parsed.ok ? (parsed.value.side as Record<string, unknown>).ask : {}) as Record<string, Record<string, unknown>>;
      const categories = Object.values(ask);
      expect(categories.some((c) => 'need' in c)).toBe(true);
      expect(categories.some((c) => 'tags' in c)).toBe(true);
    });
  });

  // Pattern-shape samples (no new verb, no new option) — proof/rank/decide are files an agent copies directly,
  // not verbs runTemplate dispatches on; this just proves each one is a well-formed, valid request.
  describe.each([
    ['proof.yaml', 'class'],
    ['rank.yaml', 'scan'],
    ['decide.yaml', 'class'],
  ] as const)('pattern template %s', (file, verb) => {
    it(`validates as ${verb}`, () => {
      const raw = readFileSync(path.join('skills', 'sidewise', 'templates', file), 'utf8');
      const parsed = readRequestText(raw);
      expect(parsed.ok).toBe(true);
      const v = parsed.ok && validateRequest(parsed.value, verb);
      expect(v && v.ok).toBe(true);
    });
  });
});
