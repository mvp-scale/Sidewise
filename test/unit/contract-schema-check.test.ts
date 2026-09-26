// The hand-written schema checks: each schema rule, worded as a fix. (Agreement with ajv is Task 5.)
import { describe, expect, it } from 'vitest';
import { checkSchema } from '../../src/contract/schema-check.ts';

const base = (): Record<string, any> => ({
  side: {
    goal: 'This login handler is safe to merge',
    depth: 'quick',
    where: ['src/user.ts:1-3'],
    ask: { injection: { pass: 'no', 1: 'Is request text placed directly into the SQL query?' } },
  },
  wise: { why: 'validate', area: 'data' },
});
const texts = (v: unknown): string[] => checkSchema(v).map((s) => s.text);

describe('checkSchema', () => {
  it('accepts a valid request; every stop it makes is schema-class', () => {
    expect(checkSchema(base())).toEqual([]);
    const bad = base();
    bad.side.goal = 'x';
    expect(checkSchema(bad).every((s) => s.cls === 'schema')).toBe(true);
  });

  it('the root: a mapping with side:, and only side: and wise:', () => {
    expect(texts('hello')).toEqual(['✖ request: is not a mapping → start with side:']);
    expect(texts({ wise: {} })).toEqual(['✖ side: missing → start with side: and a goal']);
    expect(texts({ ...base(), focus: 'x' })).toEqual(['✖ focus: not a block → the request holds only side: and wise:; put fields under side:']);
  });

  it('side fields: unknown, goal, depth, where, parent, compare, verb, from', () => {
    const r = base();
    r.side.level = 1;
    expect(texts(r)).toEqual(['✖ side.level: not a field → use goal, depth, where, parent, ask, over, from, compare or verb']);
    const g = base();
    delete g.side.goal;
    expect(texts(g)).toEqual(['✖ side.goal: missing → add one line: what you want to be true']);
    const long = base();
    long.side.goal = 'x'.repeat(161);
    expect(texts(long)).toEqual(['✖ side.goal: is longer than 160 characters → write one line of 3–160 characters: what you want to be true']);
    const d = base();
    d.side.depth = 'deep';
    expect(texts(d)).toEqual(['✖ side.depth: "deep" → use quick, standard or thorough']);
    const w = base();
    w.side.where = ['src/a b.ts'];
    expect(texts(w)).toEqual(['✖ side.where: "src/a b.ts" is not a path → use a project path, optionally :start-end, with no spaces']);
    const p = base();
    p.side.parent = 'SW-1';
    expect(texts(p)).toEqual(['✖ side.parent: "SW-1" is not a run id → use SW-####']);
    const c = base();
    c.side.compare = { before: 'main' };
    expect(texts(c)).toEqual(['✖ side.compare: {"before":"main"} → write compare: {before: main, after: HEAD}']);
    const v = base();
    v.side.verb = 'judge';
    expect(texts(v)).toEqual(['✖ side.verb: "judge" → use view, class, change, scan, drill or loop, or leave it out']);
  });

  it('questions: not a question, no "?", too long, a broken scale or choice', () => {
    const at = (q: unknown): string[] => {
      const r = base();
      r.side.ask.injection[1] = q;
      return texts(r);
    };
    expect(at('no')).toEqual(['✖ question 1: is not a question → write it as text']);
    expect(at(false)).toEqual(['✖ question 1: is not a question → write it as text']);
    expect(at('Is it')).toEqual(['✖ question 1: doesn\'t end in "?" → put it in quotes']);
    expect(at(`${'x'.repeat(170)}?`)).toEqual(['✖ question 1: is longer than 160 characters → ask one short thing on one line']);
    expect(at({ scale: 'How bad?', levels: ['low'] })).toEqual(['✖ question 1: 1 levels → give 2–10']);
    expect(at({ choice: 'Where to?', options: ['a', 'a'] })).toEqual(['✖ question 1: repeated options → make each one different']);
    expect(at({ scale: 'How bad?', levels: ['low', 1] })).toEqual(['✖ question 1: 1 is not text → quote it: "1"']);
    expect(at({ scale: 'How bad?' })).toEqual(['✖ question 1: a scale needs levels: → add levels: [a, b]']);
    expect(at({ ask: 'x?' })).toEqual(['✖ question 1: is not a question → write "N: <question>?", or scale: + levels:, or choice: + options:']);
  });

  it('categories: pass, need, tags, keys, names', () => {
    const r = base();
    r.side.ask.injection.pass = 'maybe';
    expect(texts(r)).toEqual(['✖ side.ask.injection.pass: "maybe" → use yes, no, or a list of the passing levels or options']);
    const n = base();
    n.side.ask.injection.need = 'some';
    expect(texts(n)).toEqual(['✖ side.ask.injection.need: "some" → use all, most or any']);
    const k = base();
    k.side.ask.injection.description = 'x';
    expect(texts(k)).toEqual(['✖ side.ask.injection.description: not a question number or category key → a category holds pass, need, tags and numbered questions']);
    const z = base();
    z.side.ask.injection[0] = 'Is it?';
    expect(texts(z)).toEqual(['✖ side.ask.injection.0: not a question number or category key → number questions from 1']);
    const name = base();
    name.side.ask = { SQL: { pass: 'no', 1: 'Is it?' } };
    expect(texts(name)).toEqual(['✖ side.ask.SQL: "SQL" is not a category or layer name → use lowercase letters and digits, one word or kebab-case, ≤ 20 characters']);
    const nopass = base();
    nopass.side.ask = { injection: { 1: 'Is it?' } };
    expect(texts(nopass)).toEqual(['✖ side.ask.injection: has questions but no pass → add "pass: yes" or "pass: no"']);
  });

  it('a sweep: layer → categories; over holds lists or patterns', () => {
    const r = base();
    r.side.over = { part: ['a', 'b'] };
    r.side.ask = { part: { boundaries: { pass: 'yes', 1: 'Does {part} own one thing?' } } };
    expect(checkSchema(r)).toEqual([]);
    r.side.over = { part: 3 };
    expect(texts(r)).toEqual(['✖ side.over.part: is not a list or a pattern → write a list of items, a file pattern, or each']);
    r.side.over = { part: [] };
    expect(texts(r)).toEqual(['✖ side.over.part: 0 items → give 1–30 items']);
  });

  it('wise: only why, area, parent', () => {
    const r = base();
    r.wise = { why: 'explore', area: 'backend', mood: 'x' };
    expect(texts(r)).toEqual([
      '✖ wise.mood: not a field → use why, area or parent',
      '✖ wise.why: "explore" → use validate, find or debug',
      '✖ wise.area: "backend" → use data, api, ui, auth, hosting, build or tests',
    ]);
  });
});
