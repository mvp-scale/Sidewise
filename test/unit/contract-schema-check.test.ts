// The hand-written schema checks: each schema rule, worded as a fix. (Agreement with ajv is Task 5.)
import { describe, expect, it } from 'vitest';
import { checkSchema } from '../../src/contract/schema-check.ts';

const base = (): Record<string, any> => ({
  side: {
    goal: 'This login handler is safe to merge',
    depth: 'quick',
    where: ['src/user.ts:1-3'],
    ask: { concerns: { injection: { pass: 'no', 1: 'Is request text placed directly into the SQL query?' } } },
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

  it('the root: a mapping with side:, and only side: and wise: [C-004]', () => {
    expect(texts('hello')).toEqual(['✖ request: is not a mapping → start with side:']);
    expect(texts({ wise: {} })).toEqual(['✖ side: missing → start with side: and a goal']);
    expect(texts({ ...base(), focus: 'x' })).toEqual(['✖ focus: not a block → the request holds only side: and wise:; put fields under side:']);
  });

  it('side fields: unknown, goal, depth, where, parent, compare, verb, from, expect [C-010] [C-012]', () => {
    const r = base();
    r.side.level = 1;
    expect(texts(r)).toEqual(['✖ side.level: not a field → use goal, depth, where, parent, ask, over, from, compare, verb or expect']);
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
    // [C-012] where holds 1-5 paths: 0 and 6 both stop with the exact count message.
    const none = base();
    none.side.where = [];
    expect(texts(none)).toEqual(['✖ side.where: needs 1–5 paths → write where: [path/to/file.ts]']);
    const six = base();
    six.side.where = ['a.ts', 'b.ts', 'c.ts', 'd.ts', 'e.ts', 'f.ts'];
    expect(texts(six)).toEqual(['✖ side.where: needs 1–5 paths → write where: [path/to/file.ts]']);
    const p = base();
    p.side.parent = 'SW-1';
    expect(texts(p)).toEqual(['✖ side.parent: "SW-1" is not a run id → use SW-####']);
    const c = base();
    c.side.compare = { before: 'main' };
    expect(texts(c)).toEqual(['✖ side.compare: {"before":"main"} → write compare: {before: main, after: HEAD}']);
    const v = base();
    v.side.verb = 'judge';
    expect(texts(v)).toEqual(['✖ side.verb: "judge" → use view, class, change, scan, drill or loop, or leave it out']);
    const e = base();
    e.side.expect = [];
    expect(texts(e)).toEqual(['✖ side.expect: [] → give 1–9 concern names, lowercase kebab-case, ≤ 20 characters']);
    const e2 = base();
    e2.side.expect = ['Not A Tag'];
    expect(texts(e2)).toEqual(['✖ side.expect: ["Not A Tag"] → give 1–9 concern names, lowercase kebab-case, ≤ 20 characters']);
  });

  it('questions: not a question, no "?", too long, a broken scale or choice [C-021] [C-022]', () => {
    const at = (q: unknown): string[] => {
      const r = base();
      r.side.ask.concerns.injection[1] = q;
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

  it('categories: pass, need, tags, family, keys, names [C-019]', () => {
    const r = base();
    r.side.ask.concerns.injection.pass = 'maybe';
    expect(texts(r)).toEqual(['✖ side.ask.concerns.injection.pass: "maybe" → use yes, no, or a list of the passing levels or options']);
    const n = base();
    n.side.ask.concerns.injection.need = 'some';
    expect(texts(n)).toEqual(['✖ side.ask.concerns.injection.need: "some" → use all, most or any']);
    const k = base();
    k.side.ask.concerns.injection.description = 'x';
    expect(texts(k)).toEqual(['✖ side.ask.concerns.injection.description: not a question number or category key → a category holds pass, need, tags, family and numbered questions']);
    const z = base();
    z.side.ask.concerns.injection[0] = 'Is it?';
    expect(texts(z)).toEqual(['✖ side.ask.concerns.injection.0: not a question number or category key → number questions from 1']);
    const fam = base();
    fam.side.ask.concerns.injection.family = 'nonsense';
    expect(texts(fam)).toEqual(['✖ side.ask.concerns.injection.family: "nonsense" → use access, injection, secrets, input, output, availability, correctness, design, design-risk, done or other']);
    const name = base();
    name.side.ask = { concerns: { SQL: { pass: 'no', 1: 'Is it?' } } };
    expect(texts(name)).toEqual(['✖ side.ask.concerns.SQL: "SQL" is not a category name → use lowercase letters and digits, one word or kebab-case, ≤ 20 characters']);
    const nopass = base();
    nopass.side.ask = { concerns: { injection: { 1: 'Is it?' } } };
    expect(texts(nopass)).toEqual(['✖ side.ask.concerns.injection: is not a category → give it pass: and numbered questions']);
  });

  it('ask: a legacy flat category (no concerns:/decisions: wrapper) is refused outright', () => {
    const flat = base();
    flat.side.ask = { injection: { pass: 'no', 1: 'Is it?' } };
    expect(texts(flat)).toEqual(['✖ side.ask: put categories under concerns: (yes/no) and decisions: (scale/choice) → sidewise template <verb>']);
  });

  it('ask: a sweep keys concerns:/decisions: by layer, and "concerns"/"decisions" can\'t be a layer name [C-013]', () => {
    const r = base();
    r.side.ask = { part: { concerns: { boundaries: { pass: 'yes', 1: 'Does {part} own one thing?' } } } };
    r.side.over = { part: ['a', 'b'] };
    delete r.side.depth;
    delete r.side.where;
    expect(checkSchema(r)).toEqual([]);
    r.side.over = { part: 3 };
    expect(texts(r)).toEqual(['✖ side.over.part: is not a list or a pattern → write a list of items, a file pattern, or each']);
    r.side.over = { part: [] };
    expect(texts(r)).toEqual(['✖ side.over.part: 0 items → give 1–30 items']);

    const reserved = base();
    reserved.side.over = { concerns: ['a'] };
    reserved.side.ask = { concerns: { boundaries: { pass: 'yes', 1: 'Does {concerns} own one thing?' } } };
    expect(texts(reserved)).toContain('✖ side.over.concerns: "concerns"/"decisions" are reserved for ask sections → use a different layer name');
  });

  it('wise: only why, area, stage, change, risk, parent, problem, nodes, touches, blast [C-016] [C-017]', () => {
    const r = base();
    r.wise = { why: 'explore', area: 'backend', mood: 'x' };
    expect(texts(r)).toEqual([
      '✖ wise.mood: not a field → use why, area, stage, change, risk, parent, problem, nodes, touches or blast',
      '✖ wise.why: "explore" → use validate, find or debug',
      '✖ wise.area: "backend" → use data, api, ui, auth, hosting, build or tests',
    ]);
  });

  // [C-108] wise.stage is one of design, build, review, pre-merge, post-fix, release
  // [C-109] wise.change is one of feature, fix, refactor, dependency, config
  // [C-110] wise.risk is one of low, medium, high
  it('wise: stage, change and risk are optional and closed [C-108] [C-109] [C-110]', () => {
    const r = base();
    r.wise = { stage: 'pre-merge', change: 'fix', risk: 'high' };
    expect(texts(r)).toEqual([]);
    r.wise = { stage: 'staging', change: 'rewrite', risk: 'severe' };
    expect(texts(r)).toEqual([
      '✖ wise.stage: "staging" → use design, build, review, pre-merge, post-fix or release',
      '✖ wise.change: "rewrite" → use feature, fix, refactor, dependency or config',
      '✖ wise.risk: "severe" → use low, medium or high',
    ]);
  });

  it('wise: problem, nodes, touches, blast (the new knowledge fields)', () => {
    const r = base();
    r.wise = { problem: 'x', nodes: 'a:b', touches: [] };
    expect(texts(r)).toEqual(['✖ wise.problem: is too short → write one line of 3–160 characters: what you\'re solving now', '✖ wise.nodes: "a:b" is not a level:name chain → use level:name ( -> level:name)*, joined by "; " (level: person, system, container, component or code)']);

    const ok = base();
    ok.wise = { problem: 'Fixing the SQL injection in findUser', nodes: 'container:api -> component:contributions-dao -> container:db; container:api -> component:views', touches: ['userId'], blast: 'component' };
    expect(texts(ok)).toEqual([]);

    const badTouch = base();
    badTouch.wise = { touches: ['a'.repeat(41)] };
    expect(texts(badTouch)).toEqual([`✖ wise.touches[0]: "${'a'.repeat(38)}… → each entry is 1–40 characters, one line`]);

    const badBlast = base();
    badBlast.wise = { blast: 'process' };
    expect(texts(badBlast)).toEqual(['✖ wise.blast: "process" → use code, component, container, system or person']);
  });
});
