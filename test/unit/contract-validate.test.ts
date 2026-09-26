// Validation after the schema: the verb's fields, numbering, kinds, depth, layers and blanks. Stops say what to change.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { readRequestText } from '../../src/contract/read.ts';
import { validateRequest } from '../../src/contract/validate.ts';
import type { Verb } from '../../src/contract/types.ts';

const parse = (text: string): Record<string, unknown> => {
  const r = readRequestText(text);
  if (!r.ok) throw new Error(r.stops.join('\n'));
  return r.value;
};
const stops = (text: string, verb: Verb): string[] => {
  const v = validateRequest(parse(text), verb);
  if (v.ok) throw new Error('expected stops');
  return v.stops.map((s) => s.text);
};
const yesno = (nums: number[], word = 'wrong'): string => nums.map((n) => `      ${n}: Is thing ${n} ${word}?\n`).join('');
const cls = (body: string, extra = ''): string => `side:\n${extra}  goal: The handler is safe to merge\n  depth: quick\n  where: [src/a.ts]\n  ask:\n${body}`;
const one = (nums: number[]): string => cls(`    leaks:\n      pass: no\n${yesno(nums)}`);
const TEN = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

describe('validateRequest', () => {
  it('normalizes the contract class example [C-006]', () => {
    const v = validateRequest(parse(readFileSync('test/fixtures/requests/valid/class.yaml', 'utf8')), 'class');
    if (!v.ok) throw new Error(v.stops.map((s) => s.text).join('\n'));
    expect(v.request.side.categories.map((c) => [c.name, c.pass, c.questions.map((q) => q.n)])).toEqual([
      ['injection', 'no', [1, 2, 10]],
      ['guards', 'yes', [3, 6, 9]],
      ['access', 'no', [4, 5]],
      ['leaks', 'no', [7, 8]],
      ['severity', ['none', 'low'], [11]],
      ['route', ['ship'], [12]],
    ]);
    expect(v.request.side.categories[4]!.questions[0]).toEqual({ n: 11, kind: 'scale', text: 'How severe is the worst issue?', levels: ['none', 'low', 'medium', 'high', 'critical'] });
    expect(v.request.wise).toEqual({ why: 'validate', area: 'data' });
    expect(v.notes).toEqual([]);
  });

  it('pass: true / false (older parsers) mean yes / no [C-042]', () => {
    const v = validateRequest(parse(cls(`    leaks:\n      pass: false\n${yesno(TEN)}`)), 'class');
    expect(v.ok && v.request.side.categories[0]!.pass).toBe('no');
  });

  it('____ blanks from a template come first, and alone', () => {
    const text = 'side:\n  goal: ____\n  depth: quick\n  where: [____]\n  ask:\n    ____1:\n      pass: no\n      1: ____?\nwise:\n  area: ____\n';
    expect(stops(text, 'class')).toEqual([
      '✖ side.goal: still a ____ blank → fill it in',
      '✖ side.where[0]: still a ____ blank → fill it in',
      '✖ side.ask.____1: still a ____ blank → fill it in',
      '✖ wise.area: still a ____ blank → fill it in',
    ]);
  });

  it('the YAML traps that parse: "#" cut a question short, "no" is not a question [C-039] [C-041]', () => {
    expect(stops(cls('    leaks:\n      pass: no\n      1: Is it # really safe?\n'), 'class')).toEqual(['✖ question 1: doesn\'t end in "?" → put it in quotes']);
    expect(stops(cls('    leaks:\n      pass: no\n      1: no\n'), 'class')).toEqual(['✖ question 1: is not a question → write it as text']);
  });

  it('the verb\'s own fields [C-015] [C-062] [C-085]', () => {
    expect(stops(one(TEN).replace('side:\n', 'side:\n  verb: view\n'), 'class')).toEqual(['✖ side.verb: says "view" but you ran class → remove side.verb, or run sidewise view']);
    expect(stops('side:\n  goal: The handler is safe\n', 'class')).toEqual([
      '✖ side.depth: class needs it → add "depth: quick" (10 yes/no questions; standard 20, thorough 30)',
      '✖ side.where: class needs it → add "where: [path/to/file.ts]"',
      '✖ side.ask: class needs it → add ask: with a category, its pass: and numbered questions (sidewise template class)',
    ]);
    expect(stops('side:\n  goal: The fix works\n  parent: SW-0042\n  compare: {before: main, after: HEAD}\n  ask:\n    a:\n      pass: yes\n      1: Is it fixed?\n', 'change')).toEqual([
      "✖ side.ask: change replays the parent's questions → remove ask; for new questions, use class",
    ]);
    expect(stops(one(TEN).replace('side:\n', 'side:\n  parent: SW-0001\n'), 'class')).toEqual(['✖ side.parent: only drill and change build on a parent → move it to wise.parent (lineage)']);
  });

  it('wise is entirely optional: omitting it validates, and request.wise is null (nothing recorded for it) [C-005]', () => {
    const v = validateRequest(parse(one(TEN)), 'class'); // no wise: block at all
    expect(v.ok && v.request.wise).toBeNull();
  });

  it('over is sweep-only: a one-subject verb (class) refuses it even when it is validly shaped [C-007] [C-014]', () => {
    const bad = cls(`    leaks:\n      pass: no\n${yesno(TEN)}`, '  over: {part: [a, b]}\n');
    expect(stops(bad, 'class')).toContain('✖ side.over: class asks about one subject → remove over, or use loop or scan to sweep');
  });

  it('numbering: twice across categories, gaps [C-020]', () => {
    expect(stops(cls(`    a:\n      pass: no\n${yesno([1, 2, 3, 4, 5])}    b:\n      pass: yes\n${yesno([5, 6, 7, 8, 9], 'right')}`), 'class')).toEqual([
      '✖ question 5: numbered twice → give each question its own number',
    ]);
    expect(stops(one([1, 2, 3, 4, 5, 6, 7, 8, 9, 11]), 'class')).toEqual(['✖ question numbers: 1 2 3 4 5 6 7 8 9 11 → number them 1…10 with no gaps']);
  });

  it('depth counts yes/no questions only, exactly, for class [C-011] [C-086]', () => {
    expect(stops(one([1, 2, 3, 4, 5, 6, 7]), 'class')).toEqual(['✖ side.depth: quick needs 10 yes/no questions, got 7 → add 3']);
    expect(stops(one([...TEN, 11, 12]), 'class')).toEqual(['✖ side.depth: quick needs 10 yes/no questions, got 12 → remove 2, or raise the depth']);
    const scaled = cls(`    leaks:\n      pass: no\n${yesno(TEN)}    sev:\n      pass: [low]\n      11:\n        scale: How bad is it?\n        levels: [low, high]\n`);
    expect(validateRequest(parse(scaled), 'class').ok).toBe(true);
  });

  it('one kind per category, a pass that fits it, at most 5 scale/choice [C-022]', () => {
    const mixed = cls(`    leaks:\n      pass: no\n${yesno(TEN)}      11:\n        scale: How bad is it?\n        levels: [low, high]\n`);
    expect(stops(mixed, 'class')).toEqual(['✖ side.ask.leaks: mixes yes/no and scale questions → one kind per category']);
    const unknown = cls(`    leaks:\n      pass: no\n${yesno(TEN)}    sev:\n      pass: [severe]\n      11:\n        scale: How bad is it?\n        levels: [low, high]\n`);
    expect(stops(unknown, 'class')).toEqual(['✖ side.ask.sev.pass: "severe" is not a level of question 11 → use some of low, high']);
    const yn = cls(`    leaks:\n      pass: no\n${yesno(TEN)}    sev:\n      pass: no\n      11:\n        scale: How bad is it?\n        levels: [low, high]\n`);
    expect(stops(yn, 'class')).toEqual(['✖ side.ask.sev.pass: scale questions need the passing levels → e.g. pass: [none, low]']);
    const six = Array.from({ length: 6 }, (_, i) => `    c${i}:\n      pass: [a]\n      ${11 + i}:\n        choice: Which one is it?\n        options: [a, b]\n`).join('');
    expect(stops(cls(`    leaks:\n      pass: no\n${yesno(TEN)}${six}`), 'class')).toEqual(['✖ side.ask: 6 scale/choice questions → at most 5']);
  });

  it('a category may not use a word the answer uses', () => {
    expect(stops(cls(`    gate:\n      pass: no\n${yesno(TEN)}`), 'class')).toEqual(['✖ side.ask.gate: "gate" is a word the answer uses → rename the category']);
  });

  it('blanks: none in one subject; in a sweep only the layer or one above', () => {
    expect(stops(cls(`    leaks:\n      pass: no\n${TEN.map((n) => `      ${n}: Does {part} ${n} fail?\n`).join('')}`), 'class')[0]).toBe(
      '✖ question 1: {part} has nothing to fill it → blanks are for sweeps (over:); write the name out',
    );
    const loop = 'side:\n  goal: Ideas hold up\n  depth: quick\n  over:\n    part:\n      - name: a\n        story: [s1]\n  ask:\n    part:\n      x:\n        pass: yes\n        1: Is {part} ok?\n        2: Is {story} ok?\n';
    expect(stops(loop, 'loop')).toEqual(["✖ question 2: {story} is not part's layer or above it → use {part}"]);
  });

  it('a sweep: ask keyed by existing layers; one subject: categories straight under ask', () => {
    const noLayer = 'side:\n  goal: Ideas hold up\n  depth: quick\n  over:\n    part: [a, b]\n  ask:\n    stories:\n      x:\n        pass: yes\n        1: Is it ok?\n';
    expect(stops(noLayer, 'loop')).toEqual(['✖ side.ask.stories: not a layer in over → use one of part']);
    const flat = 'side:\n  goal: Ideas hold up\n  depth: quick\n  over:\n    part: [a, b]\n  ask:\n    x:\n      pass: yes\n      1: Is {part} ok?\n';
    expect(stops(flat, 'loop')).toEqual(['✖ side.ask.x: a sweep keys categories by layer → ask: {<layer>: {x: ...}}']);
  });

  it('item names can\'t hold / or # (ids join names with /)', () => {
    const t = 'side:\n  goal: Ideas hold up\n  depth: quick\n  over:\n    part: [a/b, "c#1"]\n  ask:\n    part:\n      x:\n        pass: yes\n        1: Is {part} ok?\n';
    expect(stops(t, 'loop')).toEqual([
      '✖ side.over.part: item "a/b" → names are 1–80 characters, without "/" or "#"',
      '✖ side.over.part: item "c#1" → names are 1–80 characters, without "/" or "#"',
    ]);
  });

  it('a sweep request: layers normalized in over\'s order [C-008]', () => {
    const v = validateRequest(parse(readFileSync('test/fixtures/requests/valid/loop.yaml', 'utf8')), 'loop');
    if (!v.ok) throw new Error(v.stops.map((s) => s.text).join('\n'));
    expect(v.request.side.layers.map((l) => [l.name, l.categories.map((c) => c.name)])).toEqual([
      ['part', ['boundaries']],
      ['story', ['done', 'risk']],
    ]);
    expect(v.request.side.categories).toEqual([]);
  });

  it('notes, never stops: an irreversible goal; a view draft whose count is off [C-034]', () => {
    const v = validateRequest(parse(one(TEN).replace('The handler is safe to merge', 'It is safe to deploy this migration')), 'class');
    expect(v.ok && v.notes).toEqual(['looks irreversible; don\'t act on this alone ("deploy")']);
    const view = validateRequest(parse(one([1, 2, 3])), 'view');
    expect(view.ok && view.notes).toEqual(['quick expects 10 yes/no questions, got 3; class will stop on this']);
  });

  it('scan: where duplicates over (scan reads the files it sweeps)', () => {
    const text =
      'side:\n  goal: Handlers stay safe\n  depth: quick\n  where: [src/a.ts]\n  over:\n    file: src/handlers/*.ts\n    function: each\n  ask:\n    function:\n      injection:\n        pass: no\n        1: Does {function} put request text straight into a query?\nwise:\n  why: find\n  area: api\n';
    expect(stops(text, 'scan')).toEqual(['✖ side.where: scan reads the files in over → remove where']);
  });

  it('drill: a blank that is not one of the sweep\'s own layers is deferred, not stopped (the verb resolves it against the parent)', () => {
    const text =
      'side:\n  goal: Find where the leak happens\n  parent: SW-0060\n  from: src/handlers/user.ts/findUser\n  over:\n    call: each\n  ask:\n    call:\n      injection:\n        pass: no\n        1: Does {call} pass request text into SQL?\n        2: Does {resource} get checked for ownership?\n';
    const v = validateRequest(parse(text), 'drill');
    if (!v.ok) throw new Error(v.stops.map((s) => s.text).join('\n'));
    expect(v.request.side.layers.map((l) => [l.name, l.categories.map((c) => c.name)])).toEqual([['call', ['injection']]]);
    expect(v.notes).toEqual([]);
  });

  it('loop: the same shape blank, but with no parent to defer to, IS stopped', () => {
    const text = 'side:\n  goal: Ideas hold up\n  depth: quick\n  over:\n    part: [a]\n  ask:\n    part:\n      x:\n        pass: yes\n        1: Is {part} ok?\n        2: Does {resource} check out?\n';
    expect(stops(text, 'loop')).toEqual(["✖ question 2: {resource} is not part's layer or above it → use {part}"]);
  });

  it('a valid scan and a valid drill fixture pass validation', () => {
    const scan = validateRequest(parse(readFileSync('test/fixtures/requests/valid/scan.yaml', 'utf8')), 'scan');
    if (!scan.ok) throw new Error(scan.stops.map((s) => s.text).join('\n'));
    expect(scan.request.side.layers.map((l) => l.name)).toEqual(['function']);

    const drill = validateRequest(parse(readFileSync('test/fixtures/requests/valid/drill.yaml', 'utf8')), 'drill');
    if (!drill.ok) throw new Error(drill.stops.map((s) => s.text).join('\n'));
    expect(drill.request.side.layers.map((l) => l.name)).toEqual(['call']);
  });
});
