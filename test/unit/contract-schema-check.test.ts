// The hand-written schema checks: each schema rule, worded as a fix. (Agreement with ajv is Task 5.)
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { readRequestText } from '../../src/contract/read.ts';
import { checkSchema } from '../../src/contract/schema-check.ts';
import { effectiveMdlFields, MDL_FIELDS } from '../../src/contract/mdl-fields.ts';

const base = (): Record<string, any> => ({
  mak: {
    goal: 'This login handler is safe to merge',
    depth: 'quick',
    where: ['src/user.ts:1-3'],
    ask: { concerns: { injection: { pass: 'no', 1: 'Is request text placed directly into the SQL query?' } } },
  },
  mdl: { why: 'validate', area: 'data' },
});
const texts = (v: unknown): string[] => checkSchema(v).map((s) => s.text);

describe('checkSchema', () => {
  it('accepts a valid request; every stop it makes is schema-class', () => {
    expect(checkSchema(base())).toEqual([]);
    const bad = base();
    bad.mak.goal = 'x';
    expect(checkSchema(bad).every((s) => s.cls === 'schema')).toBe(true);
  });

  it('the root: a mapping with mak:, and only mak: and mdl: [C-004]', () => {
    expect(texts('hello')).toEqual(['✖ request: is not a mapping → start with mak:']);
    expect(texts({ mdl: {} })).toEqual(['✖ mak: missing → start with mak: and a goal']);
    expect(texts({ ...base(), focus: 'x' })).toEqual(['✖ focus: not a block → the request holds only mak: and mdl:; put fields under mak:']);
  });

  it('pre-rename side:/wise: get a "renamed" stop that names the new block [C-004]', () => {
    const { mak, ...rest } = base();
    expect(texts({ side: mak })).toEqual(['✖ side: renamed → use mak:']);
    expect(texts({ ...base(), wise: {} })).toEqual(['✖ wise: renamed → use mdl:']);
    expect(texts({ side: mak, wise: {}, ...rest })).toEqual(['✖ side: renamed → use mak:', '✖ wise: renamed → use mdl:']);
  });

  it('mak fields: unknown, goal, depth, where, parent, compare, verb, from, expect [C-010] [C-012] [C-210]', () => {
    const r = base();
    r.mak.level = 1;
    expect(texts(r)).toEqual(['✖ mak.level: not a field → use goal, depth, where, parent, ask, over, from, compare, verb or expect']);
    const g = base();
    delete g.mak.goal;
    expect(texts(g)).toEqual(['✖ mak.goal: missing → add one line: what you want to be true']);
    const long = base();
    long.mak.goal = 'x'.repeat(161);
    expect(texts(long)).toEqual(['✖ mak.goal: is longer than 160 characters → write one line of 3–160 characters: what you want to be true']);
    const d = base();
    d.mak.depth = 'deep';
    expect(texts(d)).toEqual(['✖ mak.depth: "deep" → use quick, standard or thorough']);
    const w = base();
    w.mak.where = ['src/a b.ts'];
    expect(texts(w)).toEqual(['✖ mak.where: "src/a b.ts" is not a path → use a project path, optionally :start-end, with no spaces']);
    // [C-012] where holds 1-5 paths: 0 and 6 both stop with the exact count message.
    const none = base();
    none.mak.where = [];
    expect(texts(none)).toEqual(['✖ mak.where: needs 1–5 paths → write where: [path/to/file.ts]']);
    const six = base();
    six.mak.where = ['a.ts', 'b.ts', 'c.ts', 'd.ts', 'e.ts', 'f.ts'];
    expect(texts(six)).toEqual(['✖ mak.where: needs 1–5 paths → write where: [path/to/file.ts]']);
    const p = base();
    p.mak.parent = 'MM3-1';
    expect(texts(p)).toEqual(['✖ mak.parent: "MM3-1" is not a run id → use MM3-####']);
    const c = base();
    c.mak.compare = { before: 'main' };
    expect(texts(c)).toEqual(['✖ mak.compare: {"before":"main"} → write compare: {before: main, after: HEAD}']);
    const v = base();
    v.mak.verb = 'judge';
    expect(texts(v)).toEqual(['✖ mak.verb: "judge" → use view, class, replay, scan, drill or loop, or leave it out']);
    const e = base();
    e.mak.expect = [];
    expect(texts(e)).toEqual([]); // [] names no concern to fix: same prediction as "none", accepted [C-210]
    const e2 = base();
    e2.mak.expect = ['Not A Tag'];
    expect(texts(e2)).toEqual(['✖ mak.expect: ["Not A Tag"] → give 1–9 concern names, lowercase kebab-case, ≤ 20 characters, or the word "none"']);
    const e3 = base();
    e3.mak.expect = 'none';
    expect(texts(e3)).toEqual([]); // plan 2c N4: "none" predicts no flips at all
  });

  it('questions: not a question, no "?", too long, a broken scale or choice [C-021] [C-022]', () => {
    const at = (q: unknown): string[] => {
      const r = base();
      r.mak.ask.concerns.injection[1] = q;
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
    r.mak.ask.concerns.injection.pass = 'maybe';
    expect(texts(r)).toEqual(['✖ mak.ask.concerns.injection.pass: "maybe" → use yes, no, or a list of the passing levels or options']);
    const n = base();
    n.mak.ask.concerns.injection.need = 'some';
    expect(texts(n)).toEqual(['✖ mak.ask.concerns.injection.need: "some" → use all, most or any']);
    const k = base();
    k.mak.ask.concerns.injection.description = 'x';
    expect(texts(k)).toEqual(['✖ mak.ask.concerns.injection.description: not a question number or category key → a category holds pass, need, tags, family and numbered questions']);
    const z = base();
    z.mak.ask.concerns.injection[0] = 'Is it?';
    expect(texts(z)).toEqual(['✖ mak.ask.concerns.injection.0: not a question number or category key → number questions from 1']);
    const fam = base();
    fam.mak.ask.concerns.injection.family = 'nonsense';
    expect(texts(fam)).toEqual(['✖ mak.ask.concerns.injection.family: "nonsense" → use access, injection, secrets, input, output, availability, correctness, design, design-risk, done or other']);
    const name = base();
    name.mak.ask = { concerns: { SQL: { pass: 'no', 1: 'Is it?' } } };
    expect(texts(name)).toEqual(['✖ mak.ask.concerns.SQL: "SQL" is not a category name → use lowercase letters and digits, one word or kebab-case, ≤ 20 characters']);
    const nopass = base();
    nopass.mak.ask = { concerns: { injection: { 1: 'Is it?' } } };
    expect(texts(nopass)).toEqual(['✖ mak.ask.concerns.injection: is not a category → give it pass: and numbered questions']);
  });

  it('ask: a section beside a layer blames the misplaced section, not the layer; a lone unknown key keeps its stop', () => {
    const cat = { pass: 'no', 1: 'Is it?' };
    const mixed = base();
    mixed.mak.ask = { file: { concerns: { injection: cat } }, decisions: { severity: { pass: ['low'], 1: 'How bad?' } } };
    expect(texts(mixed)).toContain('✖ mak.ask.decisions: sits beside the layer file: → move it under file: (a sweep) or drop file: (one subject)');
    expect(texts(mixed).some((t) => t.startsWith('✖ mak.ask.file:'))).toBe(false);
    const beside = base();
    beside.mak.ask = { part: { concerns: { injection: cat } }, concerns: { access: cat } };
    expect(texts(beside)).toEqual(['✖ mak.ask.concerns: sits beside the layer part: → move it under part: (a sweep) or drop part: (one subject)']);
    const unknown = base();
    unknown.mak.ask = { concerns: { injection: cat }, file: 'x' };
    expect(texts(unknown)).toEqual(['✖ mak.ask.file: not concerns or decisions → use concerns: or decisions:']);
  });

  it('ask: a legacy flat category (no concerns:/decisions: wrapper) is refused outright', () => {
    const flat = base();
    flat.mak.ask = { injection: { pass: 'no', 1: 'Is it?' } };
    expect(texts(flat)).toEqual(['✖ mak.ask: put categories under concerns: (yes/no) and decisions: (scale/choice) → mm3 template <verb>']);
  });

  it('ask: a sweep keys concerns:/decisions: by layer, and "concerns"/"decisions" can\'t be a layer name [C-013]', () => {
    const r = base();
    r.mak.ask = { part: { concerns: { boundaries: { pass: 'yes', 1: 'Does {part} own one thing?' } } } };
    r.mak.over = { part: ['a', 'b'] };
    delete r.mak.depth;
    delete r.mak.where;
    expect(checkSchema(r)).toEqual([]);
    r.mak.over = { part: 3 };
    expect(texts(r)).toEqual(['✖ mak.over.part: is not a list or a pattern → write a list of items, a file pattern, or each']);
    r.mak.over = { part: [] };
    expect(texts(r)).toEqual(['✖ mak.over.part: 0 items → give 1–30 items']);

    const reserved = base();
    reserved.mak.over = { concerns: ['a'] };
    reserved.mak.ask = { concerns: { boundaries: { pass: 'yes', 1: 'Does {concerns} own one thing?' } } };
    expect(texts(reserved)).toContain('✖ mak.over.concerns: "concerns"/"decisions" are reserved for ask sections → use a different layer name');
  });

  it('mdl: only why, area, stage, change, risk, parent, problem, uses, touches, blast, or a valid custom key [C-016] [C-017] [C-207]', () => {
    const r = base();
    r.mdl = { why: 'explore', area: 'backend', Mood: 'x' };
    expect(texts(r)).toEqual([
      '✖ mdl.Mood: not a field → use why, area, stage, change, risk, problem, uses, blast, touches or parent, or a lower-kebab key ≤20 characters → see: mm3 agent mdl',
      '✖ mdl.why: "explore" → use validate, find or debug → see: mm3 agent mdl',
      '✖ mdl.area: "backend" → use data, api, ui, auth, hosting, build or tests, or a list of ≤2 → see: mm3 agent mdl',
    ]);
  });

  it('mdl: unknown key stops always precede catalog-field value stops, regardless of object order', () => {
    const r = base();
    r.mdl = { area: 'backend', Mood: 'x', why: 'explore' };
    expect(texts(r)).toEqual([
      '✖ mdl.Mood: not a field → use why, area, stage, change, risk, problem, uses, blast, touches or parent, or a lower-kebab key ≤20 characters → see: mm3 agent mdl',
      '✖ mdl.why: "explore" → use validate, find or debug → see: mm3 agent mdl',
      '✖ mdl.area: "backend" → use data, api, ui, auth, hosting, build or tests, or a list of ≤2 → see: mm3 agent mdl',
    ]);
  });

  it('mdl: a custom (non-catalog) key is accepted when lower-kebab and short enough [C-207]', () => {
    const r = base();
    r.mdl = { why: 'validate', 'ticket-id': 'MM3-1', tags: ['a', 'b'] };
    expect(texts(r)).toEqual([]);
    const bad = base();
    bad.mdl = { 'ticket-id': 'x'.repeat(161) };
    expect(texts(bad)).toEqual([`✖ mdl.ticket-id: "${'x'.repeat(38)}… → write one line ≤160 characters, or a list of ≤5 → see: mm3 agent mdl`]);
    const tooLong = base();
    tooLong.mdl = { ['a'.repeat(21)]: 'x' };
    expect(texts(tooLong)).toEqual([`✖ mdl.${'a'.repeat(19)}…: not a field → use why, area, stage, change, risk, problem, uses, blast, touches or parent, or a lower-kebab key ≤20 characters → see: mm3 agent mdl`]);
  });

  // [C-208] the mdl: block is capped at 25 YAML source lines, counted from the raw request text (not the
  // parsed value) — checkSchema's optional third argument.
  it('mdl: the block is capped at 25 source lines, counted from the raw text [C-208]', () => {
    const mdlLines = (n: number): string => `mdl:\n${Array.from({ length: n - 1 }, (_, i) => `  k${i}: x`).join('\n')}`;
    expect(checkSchema(base(), 'class', mdlLines(25))).toEqual([]);
    expect(checkSchema(base(), 'class', mdlLines(26)).map((s) => s.text)).toEqual([
      '✖ mdl: 26 lines → the mdl block is capped at 25 lines → see: mm3 agent mdl',
    ]);
  });

  // Plan 2c Phase A follow-up F6: the test above builds its mdl: block as an in-memory joined string, never a
  // real saved file with a genuine trailing newline at EOF — this one goes through the full
  // readRequestText -> checkSchema pipeline against an actual file on disk (Plan 2a's CRLF/BOM concern, applied
  // here to the mdl block's own line count).
  it('mdl: the 25-line cap holds through a real file on disk, trailing newline included [C-208]', () => {
    const makYaml =
      'mak:\n  goal: This login handler is safe to merge\n  depth: quick\n  where: [src/user.ts:1-3]\n  ask:\n    concerns:\n      injection:\n        pass: no\n        1: Is request text placed directly into the SQL query?\n';
    const mdlBlock = (n: number): string => ['mdl:', ...Array.from({ length: n - 1 }, (_, i) => `  k${i}: x`)].join('\n');

    const dir = mkdtempSync(path.join(tmpdir(), 'mm3-mdl-cap-'));
    try {
      const okFile = path.join(dir, 'ok.yaml');
      writeFileSync(okFile, `${makYaml}${mdlBlock(25)}\n`);
      const okRaw = readFileSync(okFile, 'utf8');
      const okRead = readRequestText(okRaw);
      expect(okRead.ok).toBe(true);
      if (okRead.ok) expect(checkSchema(okRead.value, 'class', okRaw)).toEqual([]);

      const overFile = path.join(dir, 'over.yaml');
      writeFileSync(overFile, `${makYaml}${mdlBlock(26)}\n`);
      const overRaw = readFileSync(overFile, 'utf8');
      const overRead = readRequestText(overRaw);
      expect(overRead.ok).toBe(true);
      if (overRead.ok) {
        expect(checkSchema(overRead.value, 'class', overRaw).map((s) => s.text)).toEqual([
          '✖ mdl: 26 lines → the mdl block is capped at 25 lines → see: mm3 agent mdl',
        ]);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // [C-108] mdl.stage is one of design, build, review, pre-merge, post-fix, release, operate
  // [C-109] mdl.change is one of feature, fix, refactor, dependency, config
  // [C-110] mdl.risk is one of low, medium, high
  it('mdl: stage, change and risk are optional and closed [C-108] [C-109] [C-110] [C-209]', () => {
    const r = base();
    r.mdl = { stage: 'pre-merge', change: 'fix', risk: 'high' };
    expect(texts(r)).toEqual([]);
    r.mdl = { stage: 'operate' };
    expect(texts(r)).toEqual([]);
    r.mdl = { stage: 'staging', change: 'rewrite', risk: 'severe' };
    expect(texts(r)).toEqual([
      '✖ mdl.stage: "staging" → use design, build, review, pre-merge, post-fix, release or operate → see: mm3 agent mdl',
      '✖ mdl.change: "rewrite" → use feature, fix, refactor, dependency or config → see: mm3 agent mdl',
      '✖ mdl.risk: "severe" → use low, medium or high → see: mm3 agent mdl',
    ]);
  });

  it('mdl: every closed field also accepts "unknown" [C-206]', () => {
    const r = base();
    r.mdl = { why: 'unknown', area: 'unknown', stage: 'unknown', change: 'unknown', risk: 'unknown', blast: 'unknown' };
    expect(texts(r)).toEqual([]);
  });

  it('mdl: problem, uses, touches, blast (the knowledge fields) [C-205]', () => {
    const r = base();
    r.mdl = { problem: 'x', uses: 'a:b', touches: [] };
    expect(texts(r)).toEqual([
      '✖ mdl.problem: is too short → write one line of 3–160 characters: what you\'re solving now → see: mm3 agent mdl',
      '✖ mdl.uses: "a:b" → write level:name, e.g. container:web-app → see: mm3 agent mdl',
    ]);

    const ok = base();
    ok.mdl = {
      problem: 'Fixing the SQL injection in findUser',
      uses: ['container:api -> component:contributions-dao -> container:db', 'container:api -> component:views'],
      touches: ['userId'],
      blast: 'component',
    };
    expect(texts(ok)).toEqual([]);

    const singleChain = base();
    singleChain.mdl = { uses: 'container:api -> component:dao' };
    expect(texts(singleChain)).toEqual([]);

    const guessed = base();
    guessed.mdl = { uses: 'system:email-service?' };
    expect(texts(guessed)).toEqual([]);

    const tooMany = base();
    tooMany.mdl = { uses: Array.from({ length: 6 }, (_, i) => `code:fn${i}`) };
    expect(texts(tooMany)).toEqual(['✖ mdl.uses: 6 chains → give 1–5 → see: mm3 agent mdl']);

    const empty = base();
    empty.mdl = { uses: [] };
    expect(texts(empty)).toEqual(['✖ mdl.uses: 0 chains → give 1–5 → see: mm3 agent mdl']);

    const badTouch = base();
    badTouch.mdl = { touches: ['a'.repeat(41)] };
    expect(texts(badTouch)).toEqual([`✖ mdl.touches[0]: "${'a'.repeat(38)}… → each entry is 1–40 characters, one line → see: mm3 agent mdl`]);

    const badBlast = base();
    badBlast.mdl = { blast: 'process' };
    expect(texts(badBlast)).toEqual(['✖ mdl.blast: "process" → use code, component, container, system or person → see: mm3 agent mdl']);
  });
});

// plan 2c B1: a project's .mm3/config.yaml `mdl:` overrides merge onto MDL_FIELDS.
describe('effectiveMdlFields', () => {
  it('no overrides (undefined or {}): returns MDL_FIELDS itself, unchanged', () => {
    expect(effectiveMdlFields(undefined)).toBe(MDL_FIELDS);
    expect(effectiveMdlFields({})).toBe(MDL_FIELDS);
  });

  it('a values override replaces the enum; unknown still works alongside it', () => {
    const fields = effectiveMdlFields({ risk: { values: ['minor', 'major'] } });
    const risk = fields.find((f) => f.key === 'risk')!;
    expect(risk.values).toEqual(['minor', 'major']);
    // every other field is untouched.
    const why = fields.find((f) => f.key === 'why')!;
    expect(why).toBe(MDL_FIELDS.find((f) => f.key === 'why'));
  });

  it('a note override replaces the card note', () => {
    const fields = effectiveMdlFields({ risk: { note: 'a custom scale' } });
    expect(fields.find((f) => f.key === 'risk')!.note).toBe('a custom scale');
  });

  it('an "as" override sets an alias, both the original key and the alias are accepted [C-207]', () => {
    const fields = effectiveMdlFields({ risk: { as: 'severity' } });
    const mdlFields = fields;
    const asKey = { ...base(), mdl: { risk: 'high' } };
    expect(checkSchema(asKey, 'class', undefined, mdlFields)).toEqual([]);
    const asAlias = { ...base(), mdl: { severity: 'high' } };
    expect(checkSchema(asAlias, 'class', undefined, mdlFields)).toEqual([]);
    const asBoth = { ...base(), mdl: { risk: 'high', severity: 'low' } };
    expect(checkSchema(asBoth, 'class', undefined, mdlFields).map((s) => s.text)).toEqual([
      '✖ mdl.severity: given alongside its own alias mdl.risk → use one of mdl.risk or mdl.severity, not both → see: mm3 agent mdl',
    ]);
  });

  it('the C4 chain levels and the uses grammar are unaffected by any override', () => {
    const fields = effectiveMdlFields({ uses: { note: 'a different note' }, risk: { values: ['minor', 'major'] } });
    const uses = fields.find((f) => f.key === 'uses')!;
    expect(uses.note).toBe('a different note');
    expect(uses.kind).toBe('chain-list');
    // the chain grammar itself (CHAIN_RE) lives outside MdlField entirely — proven here by a real chain still
    // validating under the "overridden" table.
    const r = { ...base(), mdl: { uses: 'container:api -> component:dao' } };
    expect(checkSchema(r, 'class', undefined, fields)).toEqual([]);
  });

  it('checkSchema enforces the OVERRIDDEN enum, not the default one, once mdlFields is threaded through', () => {
    const fields = effectiveMdlFields({ risk: { values: ['minor', 'major', 'severe'] } });
    // "high" is legal under the DEFAULT risk enum but not under this project's override.
    const overridden = { ...base(), mdl: { risk: 'high' } };
    expect(checkSchema(overridden, 'class', undefined, fields).map((s) => s.text)).toEqual([
      '✖ mdl.risk: "high" → use minor, major or severe → see: mm3 agent mdl',
    ]);
    // "severe" is illegal under the default enum but legal under the override.
    const defaultCheck = checkSchema({ ...base(), mdl: { risk: 'severe' } }); // no mdlFields: built-in table
    expect(defaultCheck.length).toBeGreaterThan(0);
    const withOverride = checkSchema({ ...base(), mdl: { risk: 'severe' } }, 'class', undefined, fields);
    expect(withOverride).toEqual([]);
  });

  it('literal: true skips the field\'s normal shape checks, same treatment as a custom key', () => {
    const fields = effectiveMdlFields({ risk: { literal: true } });
    // "extreme" would fail the built-in enum, but literal: true means no enum is enforced at all.
    const r = { ...base(), mdl: { risk: 'extreme' } };
    expect(checkSchema(r, 'class', undefined, fields)).toEqual([]);
  });

  it('pattern adds an extra check on top of the normal freetext checks', () => {
    const fields = effectiveMdlFields({ problem: { pattern: '^ticket-\\d+:' } });
    const bad = { ...base(), mdl: { problem: 'a problem with no ticket prefix at all' } };
    expect(checkSchema(bad, 'class', undefined, fields).map((s) => s.text)).toEqual([
      "✖ mdl.problem: \"a problem with no ticket prefix at all\" → must match the project's pattern for this field: ^ticket-\\d+: → see: mm3 agent mdl",
    ]);
    const ok = { ...base(), mdl: { problem: 'ticket-42: the SQL injection in findUser' } };
    expect(checkSchema(ok, 'class', undefined, fields)).toEqual([]);
  });

  it('link round-trips through without affecting validation', () => {
    const fields = effectiveMdlFields({ problem: { link: 'where' } });
    const r = { ...base(), mdl: { problem: 'the SQL injection in findUser' } };
    expect(checkSchema(r, 'class', undefined, fields)).toEqual([]);
    expect(fields.find((f) => f.key === 'problem')!.link).toBe('where');
  });
});
