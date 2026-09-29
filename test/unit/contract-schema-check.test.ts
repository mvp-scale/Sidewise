// The hand-written schema checks: each schema rule, worded as a fix. (Agreement with ajv is Task 5.)
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { readRequestText } from '../../src/contract/read.ts';
import { checkSchema } from '../../src/contract/schema-check.ts';
import { effectiveWiseFields, WISE_FIELDS } from '../../src/contract/wise-fields.ts';

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

  it('side fields: unknown, goal, depth, where, parent, compare, verb, from, expect [C-010] [C-012] [C-210]', () => {
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
    expect(texts(v)).toEqual(['✖ side.verb: "judge" → use view, class, replay, scan, drill or loop, or leave it out']);
    const e = base();
    e.side.expect = [];
    expect(texts(e)).toEqual(['✖ side.expect: [] → give 1–9 concern names, lowercase kebab-case, ≤ 20 characters, or the word "none"']);
    const e2 = base();
    e2.side.expect = ['Not A Tag'];
    expect(texts(e2)).toEqual(['✖ side.expect: ["Not A Tag"] → give 1–9 concern names, lowercase kebab-case, ≤ 20 characters, or the word "none"']);
    const e3 = base();
    e3.side.expect = 'none';
    expect(texts(e3)).toEqual([]); // plan 2c N4: "none" predicts no flips at all
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

  it('wise: only why, area, stage, change, risk, parent, problem, uses, touches, blast, or a valid custom key [C-016] [C-017] [C-207]', () => {
    const r = base();
    r.wise = { why: 'explore', area: 'backend', Mood: 'x' };
    expect(texts(r)).toEqual([
      '✖ wise.Mood: not a field → use why, area, stage, change, risk, problem, uses, blast, touches or parent, or a lower-kebab key ≤20 characters → see: sidewise agent wise',
      '✖ wise.why: "explore" → use validate, find or debug → see: sidewise agent wise',
      '✖ wise.area: "backend" → use data, api, ui, auth, hosting, build or tests, or a list of ≤2 → see: sidewise agent wise',
    ]);
  });

  it('wise: unknown key stops always precede catalog-field value stops, regardless of object order', () => {
    const r = base();
    r.wise = { area: 'backend', Mood: 'x', why: 'explore' };
    expect(texts(r)).toEqual([
      '✖ wise.Mood: not a field → use why, area, stage, change, risk, problem, uses, blast, touches or parent, or a lower-kebab key ≤20 characters → see: sidewise agent wise',
      '✖ wise.why: "explore" → use validate, find or debug → see: sidewise agent wise',
      '✖ wise.area: "backend" → use data, api, ui, auth, hosting, build or tests, or a list of ≤2 → see: sidewise agent wise',
    ]);
  });

  it('wise: a custom (non-catalog) key is accepted when lower-kebab and short enough [C-207]', () => {
    const r = base();
    r.wise = { why: 'validate', 'ticket-id': 'SW-1', tags: ['a', 'b'] };
    expect(texts(r)).toEqual([]);
    const bad = base();
    bad.wise = { 'ticket-id': 'x'.repeat(161) };
    expect(texts(bad)).toEqual([`✖ wise.ticket-id: "${'x'.repeat(38)}… → write one line ≤160 characters, or a list of ≤5 → see: sidewise agent wise`]);
    const tooLong = base();
    tooLong.wise = { ['a'.repeat(21)]: 'x' };
    expect(texts(tooLong)).toEqual([`✖ wise.${'a'.repeat(19)}…: not a field → use why, area, stage, change, risk, problem, uses, blast, touches or parent, or a lower-kebab key ≤20 characters → see: sidewise agent wise`]);
  });

  // [C-208] the wise: block is capped at 25 YAML source lines, counted from the raw request text (not the
  // parsed value) — checkSchema's optional third argument.
  it('wise: the block is capped at 25 source lines, counted from the raw text [C-208]', () => {
    const wiseLines = (n: number): string => `wise:\n${Array.from({ length: n - 1 }, (_, i) => `  k${i}: x`).join('\n')}`;
    expect(checkSchema(base(), 'class', wiseLines(25))).toEqual([]);
    expect(checkSchema(base(), 'class', wiseLines(26)).map((s) => s.text)).toEqual([
      '✖ wise: 26 lines → the wise block is capped at 25 lines → see: sidewise agent wise',
    ]);
  });

  // Plan 2c Phase A follow-up F6: the test above builds its wise: block as an in-memory joined string, never a
  // real saved file with a genuine trailing newline at EOF — this one goes through the full
  // readRequestText -> checkSchema pipeline against an actual file on disk (Plan 2a's CRLF/BOM concern, applied
  // here to the wise block's own line count).
  it('wise: the 25-line cap holds through a real file on disk, trailing newline included [C-208]', () => {
    const sideYaml =
      'side:\n  goal: This login handler is safe to merge\n  depth: quick\n  where: [src/user.ts:1-3]\n  ask:\n    concerns:\n      injection:\n        pass: no\n        1: Is request text placed directly into the SQL query?\n';
    const wiseBlock = (n: number): string => ['wise:', ...Array.from({ length: n - 1 }, (_, i) => `  k${i}: x`)].join('\n');

    const dir = mkdtempSync(path.join(tmpdir(), 'sidewise-wise-cap-'));
    try {
      const okFile = path.join(dir, 'ok.yaml');
      writeFileSync(okFile, `${sideYaml}${wiseBlock(25)}\n`);
      const okRaw = readFileSync(okFile, 'utf8');
      const okRead = readRequestText(okRaw);
      expect(okRead.ok).toBe(true);
      if (okRead.ok) expect(checkSchema(okRead.value, 'class', okRaw)).toEqual([]);

      const overFile = path.join(dir, 'over.yaml');
      writeFileSync(overFile, `${sideYaml}${wiseBlock(26)}\n`);
      const overRaw = readFileSync(overFile, 'utf8');
      const overRead = readRequestText(overRaw);
      expect(overRead.ok).toBe(true);
      if (overRead.ok) {
        expect(checkSchema(overRead.value, 'class', overRaw).map((s) => s.text)).toEqual([
          '✖ wise: 26 lines → the wise block is capped at 25 lines → see: sidewise agent wise',
        ]);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // [C-108] wise.stage is one of design, build, review, pre-merge, post-fix, release, operate
  // [C-109] wise.change is one of feature, fix, refactor, dependency, config
  // [C-110] wise.risk is one of low, medium, high
  it('wise: stage, change and risk are optional and closed [C-108] [C-109] [C-110] [C-209]', () => {
    const r = base();
    r.wise = { stage: 'pre-merge', change: 'fix', risk: 'high' };
    expect(texts(r)).toEqual([]);
    r.wise = { stage: 'operate' };
    expect(texts(r)).toEqual([]);
    r.wise = { stage: 'staging', change: 'rewrite', risk: 'severe' };
    expect(texts(r)).toEqual([
      '✖ wise.stage: "staging" → use design, build, review, pre-merge, post-fix, release or operate → see: sidewise agent wise',
      '✖ wise.change: "rewrite" → use feature, fix, refactor, dependency or config → see: sidewise agent wise',
      '✖ wise.risk: "severe" → use low, medium or high → see: sidewise agent wise',
    ]);
  });

  it('wise: every closed field also accepts "unknown" [C-206]', () => {
    const r = base();
    r.wise = { why: 'unknown', area: 'unknown', stage: 'unknown', change: 'unknown', risk: 'unknown', blast: 'unknown' };
    expect(texts(r)).toEqual([]);
  });

  it('wise: problem, uses, touches, blast (the knowledge fields) [C-205]', () => {
    const r = base();
    r.wise = { problem: 'x', uses: 'a:b', touches: [] };
    expect(texts(r)).toEqual([
      '✖ wise.problem: is too short → write one line of 3–160 characters: what you\'re solving now → see: sidewise agent wise',
      '✖ wise.uses: "a:b" → write level:name, e.g. container:web-app → see: sidewise agent wise',
    ]);

    const ok = base();
    ok.wise = {
      problem: 'Fixing the SQL injection in findUser',
      uses: ['container:api -> component:contributions-dao -> container:db', 'container:api -> component:views'],
      touches: ['userId'],
      blast: 'component',
    };
    expect(texts(ok)).toEqual([]);

    const singleChain = base();
    singleChain.wise = { uses: 'container:api -> component:dao' };
    expect(texts(singleChain)).toEqual([]);

    const guessed = base();
    guessed.wise = { uses: 'system:email-service?' };
    expect(texts(guessed)).toEqual([]);

    const tooMany = base();
    tooMany.wise = { uses: Array.from({ length: 6 }, (_, i) => `code:fn${i}`) };
    expect(texts(tooMany)).toEqual(['✖ wise.uses: 6 chains → give 1–5 → see: sidewise agent wise']);

    const empty = base();
    empty.wise = { uses: [] };
    expect(texts(empty)).toEqual(['✖ wise.uses: 0 chains → give 1–5 → see: sidewise agent wise']);

    const badTouch = base();
    badTouch.wise = { touches: ['a'.repeat(41)] };
    expect(texts(badTouch)).toEqual([`✖ wise.touches[0]: "${'a'.repeat(38)}… → each entry is 1–40 characters, one line → see: sidewise agent wise`]);

    const badBlast = base();
    badBlast.wise = { blast: 'process' };
    expect(texts(badBlast)).toEqual(['✖ wise.blast: "process" → use code, component, container, system or person → see: sidewise agent wise']);
  });
});

// plan 2c B1: a project's .sidewise/config.yaml `wise:` overrides merge onto WISE_FIELDS.
describe('effectiveWiseFields', () => {
  it('no overrides (undefined or {}): returns WISE_FIELDS itself, unchanged', () => {
    expect(effectiveWiseFields(undefined)).toBe(WISE_FIELDS);
    expect(effectiveWiseFields({})).toBe(WISE_FIELDS);
  });

  it('a values override replaces the enum; unknown still works alongside it', () => {
    const fields = effectiveWiseFields({ risk: { values: ['minor', 'major'] } });
    const risk = fields.find((f) => f.key === 'risk')!;
    expect(risk.values).toEqual(['minor', 'major']);
    // every other field is untouched.
    const why = fields.find((f) => f.key === 'why')!;
    expect(why).toBe(WISE_FIELDS.find((f) => f.key === 'why'));
  });

  it('a note override replaces the card note', () => {
    const fields = effectiveWiseFields({ risk: { note: 'a custom scale' } });
    expect(fields.find((f) => f.key === 'risk')!.note).toBe('a custom scale');
  });

  it('an "as" override sets an alias, both the original key and the alias are accepted [C-207]', () => {
    const fields = effectiveWiseFields({ risk: { as: 'severity' } });
    const wiseFields = fields;
    const asKey = { ...base(), wise: { risk: 'high' } };
    expect(checkSchema(asKey, 'class', undefined, wiseFields)).toEqual([]);
    const asAlias = { ...base(), wise: { severity: 'high' } };
    expect(checkSchema(asAlias, 'class', undefined, wiseFields)).toEqual([]);
    const asBoth = { ...base(), wise: { risk: 'high', severity: 'low' } };
    expect(checkSchema(asBoth, 'class', undefined, wiseFields).map((s) => s.text)).toEqual([
      '✖ wise.severity: given alongside its own alias wise.risk → use one of wise.risk or wise.severity, not both → see: sidewise agent wise',
    ]);
  });

  it('the C4 chain levels and the uses grammar are unaffected by any override', () => {
    const fields = effectiveWiseFields({ uses: { note: 'a different note' }, risk: { values: ['minor', 'major'] } });
    const uses = fields.find((f) => f.key === 'uses')!;
    expect(uses.note).toBe('a different note');
    expect(uses.kind).toBe('chain-list');
    // the chain grammar itself (CHAIN_RE) lives outside WiseField entirely — proven here by a real chain still
    // validating under the "overridden" table.
    const r = { ...base(), wise: { uses: 'container:api -> component:dao' } };
    expect(checkSchema(r, 'class', undefined, fields)).toEqual([]);
  });

  it('checkSchema enforces the OVERRIDDEN enum, not the default one, once wiseFields is threaded through', () => {
    const fields = effectiveWiseFields({ risk: { values: ['minor', 'major', 'severe'] } });
    // "high" is legal under the DEFAULT risk enum but not under this project's override.
    const overridden = { ...base(), wise: { risk: 'high' } };
    expect(checkSchema(overridden, 'class', undefined, fields).map((s) => s.text)).toEqual([
      '✖ wise.risk: "high" → use minor, major or severe → see: sidewise agent wise',
    ]);
    // "severe" is illegal under the default enum but legal under the override.
    const defaultCheck = checkSchema({ ...base(), wise: { risk: 'severe' } }); // no wiseFields: built-in table
    expect(defaultCheck.length).toBeGreaterThan(0);
    const withOverride = checkSchema({ ...base(), wise: { risk: 'severe' } }, 'class', undefined, fields);
    expect(withOverride).toEqual([]);
  });

  it('literal: true skips the field\'s normal shape checks, same treatment as a custom key', () => {
    const fields = effectiveWiseFields({ risk: { literal: true } });
    // "extreme" would fail the built-in enum, but literal: true means no enum is enforced at all.
    const r = { ...base(), wise: { risk: 'extreme' } };
    expect(checkSchema(r, 'class', undefined, fields)).toEqual([]);
  });

  it('pattern adds an extra check on top of the normal freetext checks', () => {
    const fields = effectiveWiseFields({ problem: { pattern: '^ticket-\\d+:' } });
    const bad = { ...base(), wise: { problem: 'a problem with no ticket prefix at all' } };
    expect(checkSchema(bad, 'class', undefined, fields).map((s) => s.text)).toEqual([
      "✖ wise.problem: \"a problem with no ticket prefix at all\" → must match the project's pattern for this field: ^ticket-\\d+: → see: sidewise agent wise",
    ]);
    const ok = { ...base(), wise: { problem: 'ticket-42: the SQL injection in findUser' } };
    expect(checkSchema(ok, 'class', undefined, fields)).toEqual([]);
  });

  it('link round-trips through without affecting validation', () => {
    const fields = effectiveWiseFields({ problem: { link: 'where' } });
    const r = { ...base(), wise: { problem: 'the SQL injection in findUser' } };
    expect(checkSchema(r, 'class', undefined, fields)).toEqual([]);
    expect(fields.find((f) => f.key === 'problem')!.link).toBe('where');
  });
});
