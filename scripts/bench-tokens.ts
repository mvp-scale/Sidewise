/**
 * How many tokens the same request costs in YAML (the contract), JSON (compact and pretty), Plan 1's text
 * format, and prose — counted offline with js-tiktoken's cl100k_base BPE (a documented proxy, not Claude's
 * own tokenizer, which Anthropic does not publish for current models; see the preamble this writes into
 * docs/evidence/tokens.md).
 * `npm run bench:tokens` regenerates the doc from a real run; test/unit/bench-tokens.test.ts checks it's fresh.
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { getEncoding } from 'js-tiktoken';
import { parse } from 'yaml';
import { emit, m, type Value } from '../src/contract/emit.ts';

const encoding = getEncoding('cl100k_base');
export type SampleFormat = 'yaml' | 'json' | 'jsonPretty' | 'plan1' | 'prose';
export interface FormatSample {
  verb: string;
  format: SampleFormat;
  text: string;
}

export function countTokens(text: string): number {
  return text.length === 0 ? 0 : encoding.encode(text).length;
}

// Plan 1 only ever implemented `class` and `view` (`src/verbs/` today holds only class.ts and view.ts), so these
// two are the only verbs with a real text-format precedent to transcribe. Each slot/primitive below is a manual,
// semantically-equivalent transcription of the matching yaml fixture: `pass: no` categories become plain
// numbered slots, `pass: yes` categories become `!`-reversed slots (Plan 1's default good answer is "no"; `!`
// flips it to "yes"), the `severity` scale becomes a `~` primitive, and `route`'s choice becomes a `?` primitive.
// The header's `L1` already carries the same information as `depth: quick`: Plan 1's real grammar (src/lens/
// request.ts's SLOTS_PER_LEVEL = {1: 10, 2: 20, 3: 30}) maps L1/L2/L3 to quick/standard/thorough directly — this
// is not a gap, just a different spelling of the same field, so nothing needs adding for depth.
// Two things below are genuine Plan 1 format limits, not oversights — see docs/evidence/tokens.md for why:
//   - `mdl.why` ("validate") has no field anywhere in Plan 1's grammar (src/lens/parse.ts's FIELD regex is
//     `perspective|where|problem|tags|focus|parent` — no `why`; Plan 1 predates the mdl: block entirely).
//     Dropped from this sample, not encoded as a discarded comment or otherwise faked.
//   - Plan 1's `~`/`?` primitives (src/lens/request.ts's Primitive interface) carry only `options: string[]` —
//     the full level/option list — with no syntax to mark which subset passes. severity's real passing subset
//     (none or low) and route's real passing option (ship) are dropped from this sample for the same reason.
const CLASS_PLAN1 = `mm3 class L1\nwhere: src/user.ts:1-3 · area: data\nproblem: This login handler is safe to merge\n 1  Is request text placed directly into the SQL query?\n 2  Could a caller change what the query does?\n10  Would a standard security scanner flag this code?\n 3 !Is the id checked to be a number before use?\n 6 !Is the caller compared to the record owner?\n 9 !Does the query select only needed columns?\n 4  Could one user read another user's record?\n 5  Can any caller read any record without a permission check?\n 7  Does the error sent back reveal the query?\n 8  Does the code log an email address?\n~ How severe is the worst issue? none | low | medium | high | critical\n? Where should this go? ship | fix | block\n`;
// A faithful, not padded, paraphrase of the same yaml fixture in plain English. Unlike Plan 1's grammar, prose has
// no format ceiling, so it carries everything the yaml does: the quick depth, why (validate) and area, each
// category's name and pass direction (grouped, since that's exactly what pass: no/yes means), the full severity
// level list plus its passing subset (none or low), and the full route option list plus its passing option (ship).
const CLASS_PROSE = `Can you do a quick check on whether this login handler in src/user.ts (lines 1 to 3) is safe to merge? I want to validate this for the data area. On injection, I'm hoping the answer is no to all three: is request text placed directly into the SQL query, could a caller change what the query does, and would a standard security scanner flag this code? On guards, I'm hoping yes to all three: is the id checked to be a number before use, is the caller compared to the record owner, and does the query select only needed columns? On access, I'm hoping no to both: could one user read another user's record, and can any caller read any record without a permission check? On leaks, I'm hoping no to both: does the error sent back reveal the query, and does the code log an email address? How severe is the worst issue — none, low, medium, high, or critical? It passes at none or low. And where should this go — ship, fix, or block? It passes at ship.\n`;
const VIEW_PLAN1 = `mm3 view L1\nwhere: src/user.ts:1-3 · area: data\nproblem: This login handler is safe to merge\n1  Is request text placed directly into the SQL query?\n2  Could a caller change what the query does?\n`;
const VIEW_PROSE = `Before I ask for a decision, what do we already know — at a quick glance — about whether this login handler in src/user.ts (lines 1 to 3) is safe to merge? I'm validating it for the data area. On injection, I'm hoping no to both: is request text placed directly into the SQL query, and could a caller change what the query does?\n`;

const HAND_WRITTEN: Partial<Record<string, Partial<Record<SampleFormat, string>>>> = {
  class: { plan1: CLASS_PLAN1, prose: CLASS_PROSE },
  view: { plan1: VIEW_PLAN1, prose: VIEW_PROSE },
};

// The response side: agents read responses too. The response format is the YAML contract itself (AGENTS.md rule
// 5) — Plan 1's line format is retired for responses (there is no plan1 sample to transcribe), and prose doesn't
// apply to structured output, so this is yaml vs json only. `emit()` is the same function src/verbs/respond.ts
// uses to print every real response, so RESPONSE_YAML below is real emit() output, not hand-typed — it can't
// drift from what MM3 actually prints. It transcribes AGENTS.md's own worked `class` example.
const RESPONSE_VERB = 'response';
const RESPONSE_DOC = m(
  [
    'mak',
    m(
      ['id', 'MM3-0001'],
      ['gate', 'fail'],
      ['goal', m(['gate', 'unsure'], ['p', 0.47])],
      ['injection', m(['gate', 'unsure'], ['1', 0.67], ['2', 0.26], ['10', 0.6])],
      ['guards', m(['gate', 'fail'], ['3', 0.55], ['6', 0.67], ['9', 0.05])],
      ['access', m(['gate', 'fail'], ['4', 0.65], ['5', 0.9])],
      ['leaks', m(['gate', 'fail'], ['7', 0.51], ['8', 0.73])],
      ['severity', m(['gate', 'pass'], ['11', m(['top', 'low'], ['p', 0.7])])],
      ['route', m(['gate', 'fail'], ['12', m(['top', 'block'], ['p', 0.7])])],
      ['consensus', 'SPLIT'],
      ['escalate', true],
    ),
  ],
  ['mdl', m(['recorded', ['why', 'area']])],
  ['next', 'mm3 template drill --parent MM3-0001 --from guards'],
  ['notes', ['budget: $5.00 left of $5.00 · 499 of 500 runs left']],
);
const RESPONSE_YAML = emit(RESPONSE_DOC);
/** The plain JS value a response Map stands for — same shape emit() reads, just not flattened to text yet. */
function toPlain(v: Value): unknown {
  if (v instanceof Map) return Object.fromEntries([...v].map(([k, x]) => [k, toPlain(x)]));
  if (Array.isArray(v)) return v.map(toPlain);
  return v;
}
const RESPONSE_PLAIN = toPlain(RESPONSE_DOC);
const RESPONSE_JSON = JSON.stringify(RESPONSE_PLAIN);
const RESPONSE_JSON_PRETTY = JSON.stringify(RESPONSE_PLAIN, null, 2);

export function loadSamples(): FormatSample[] {
  const dir = 'test/fixtures/requests/valid';
  const out: FormatSample[] = [];
  for (const file of readdirSync(dir).sort()) {
    const verb = file.replace(/\.yaml$/, '');
    const yamlText = readFileSync(`${dir}/${file}`, 'utf8');
    const parsed = parse(yamlText);
    out.push({ verb, format: 'yaml', text: yamlText });
    out.push({ verb, format: 'json', text: JSON.stringify(parsed) });
    // Pretty json (2-space indent) is the style most people actually write by hand; compact json is what
    // JSON.stringify's default produces. Both are mechanically derived from the same parsed value, so both stay
    // guaranteed semantically identical to the yaml sample.
    out.push({ verb, format: 'jsonPretty', text: JSON.stringify(parsed, null, 2) });
    for (const [format, text] of Object.entries(HAND_WRITTEN[verb] ?? {})) out.push({ verb, format: format as SampleFormat, text: text! });
  }
  out.push({ verb: RESPONSE_VERB, format: 'yaml', text: RESPONSE_YAML });
  out.push({ verb: RESPONSE_VERB, format: 'json', text: RESPONSE_JSON });
  out.push({ verb: RESPONSE_VERB, format: 'jsonPretty', text: RESPONSE_JSON_PRETTY });
  return out;
}

export interface TokenRow {
  verb: string;
  format: SampleFormat;
  tokens: number;
  bytes: number;
}

export function runTokenBench(): TokenRow[] {
  return loadSamples().map((s) => ({ verb: s.verb, format: s.format, tokens: countTokens(s.text), bytes: Buffer.byteLength(s.text, 'utf8') }));
}

const ORDER: SampleFormat[] = ['yaml', 'json', 'jsonPretty', 'plan1', 'prose'];
const FORMAT_LABEL: Record<SampleFormat, string> = {
  yaml: 'yaml (the contract)',
  json: 'json (compact)',
  jsonPretty: 'json (pretty, 2-space)',
  plan1: 'Plan 1 text',
  prose: 'prose',
};
const FOUR_WAY_VERBS = ['class', 'view'];
const SWEEP_VERBS = ['replay', 'scan', 'drill', 'loop'];
const NO_PLAN1_PROSE = "No `plan1`/`prose` column: Plan 1 only ever implemented `class` and `view`, so there is no text-format precedent for a sweep or for `replay`'s two-state comparison, and a prose paraphrase would just restate the sweep rather than offer a comparable single request.";

function pct(part: number, whole: number): string {
  return `${Math.round((part / whole) * 100)}%`;
}

/** One markdown table for a verb's rows, present formats only (ORDER), plus a line comparing yaml to each other format. */
function verbSection(verb: string, rows: readonly TokenRow[]): string {
  const byFormat = new Map(rows.filter((r) => r.verb === verb).map((r) => [r.format, r]));
  const present = ORDER.filter((f) => byFormat.has(f));
  const header = '| format | tokens | bytes |\n|---|---|---|';
  const body = present.map((f) => `| ${FORMAT_LABEL[f]} | ${byFormat.get(f)!.tokens} | ${byFormat.get(f)!.bytes} |`).join('\n');
  const yamlRow = byFormat.get('yaml');
  const comparisons = yamlRow
    ? present
        .filter((f) => f !== 'yaml')
        .map((f) => `yaml is ${pct(yamlRow.tokens, byFormat.get(f)!.tokens)} of ${FORMAT_LABEL[f]}'s tokens`)
    : [];
  const summary = comparisons.length > 0 ? `\n\n${comparisons.join('; ')}.` : '';
  return `### ${verb}\n\n${header}\n${body}${summary}\n`;
}

/** Average of yaml.tokens / other.tokens (as a %) across every verb where both formats are present. */
function avgRatio(rows: readonly TokenRow[], verbs: readonly string[], other: SampleFormat): string {
  const ratios: number[] = [];
  for (const verb of verbs) {
    const yamlRow = rows.find((r) => r.verb === verb && r.format === 'yaml');
    const otherRow = rows.find((r) => r.verb === verb && r.format === other);
    if (yamlRow && otherRow) ratios.push(yamlRow.tokens / otherRow.tokens);
  }
  if (ratios.length === 0) return 'n/a';
  return `${Math.round((ratios.reduce((a, b) => a + b, 0) / ratios.length) * 100)}%`;
}

export function renderTokenDoc(rows: readonly TokenRow[]): string {
  const allVerbs = [...FOUR_WAY_VERBS, ...SWEEP_VERBS];
  const preamble = `# Token-format bench

Generated by \`scripts/bench-tokens.ts\` (\`npm run bench:tokens\`) from the same requests written five ways: yaml (the contract), json (compact), json (pretty, 2-space indent — the style most people actually write by hand), Plan 1's retired text format, and prose. Counted with \`js-tiktoken\` 1.0.21's \`cl100k_base\` BPE encoding, run fully offline — the encoding's ranks ship inside the installed npm package, nothing is fetched over the network at run time.

**Method and its error, stated plainly:** \`cl100k_base\` is OpenAI's encoding, not Claude's — Anthropic does not publish an exact tokenizer for current Claude models, and the closest offline package they ship (\`@anthropic-ai/tokenizer\`) is itself an unmaintained approximation of an older model's vocabulary, not a documented improvement. So this bench's absolute counts will not match what a live Anthropic (or any other vendor's) API reports for the same text. What it captures reliably is the *relative* comparison between formats: one BPE tokenizer applied identically to all five is sensitive to exactly the punctuation and indentation differences that separate them (a \`chars.length / 4\` estimate would not be — it treats a \`{\` the same as a letter). For an exact count against a specific model, use that model's own token-counting endpoint (network plus a key — out of scope for this offline, keyless bench).

**Which JSON style you compare against flips the result:** measured below, yaml costs *more* tokens than compact json but *fewer* than pretty json, on every request. A guess at the cause, not a verified one (this bench has no visibility into \`cl100k_base\`'s training data): compact json's tightly-packed \`":\`, \`",\`, \`"}}\` sequences may line up with byte-pair merges \`cl100k_base\` already has, in a way pretty json's extra whitespace and yaml's per-line indentation don't. Whatever the cause, a \`chars/4\` estimate would have missed this split entirely — it can't tell a merged token from three separate ones.`;

  const fairness = `## How fairness was checked

yaml, both jsons and prose carry the same information as each other for the same request; Plan 1's text format cannot express two fields, and says so below rather than claiming equivalence.

- **yaml** is the fixture text verbatim, from \`test/fixtures/requests/valid/*.yaml\` (Task 5's committed corpus — read, never hand-copied, so it can't drift from what the schema actually accepts).
- **json (compact)** is \`JSON.stringify(YAML.parse(yamlText))\` and **json (pretty)** is \`JSON.stringify(YAML.parse(yamlText), null, 2)\` — both mechanically derived from the exact same parsed value, so both are guaranteed semantically identical to the yaml sample.
- **plan1** and **prose** exist only for \`class\` and \`view\` (see below): each is a short hand-written constant in \`scripts/bench-tokens.ts\`, marked with a comment as a manual, semantically-equivalent transcription. Prose has no format ceiling, so it carries everything the yaml does, faithfully and without padding — one full sample:

  > ${CLASS_PROSE.trim()}

  Plan 1's grammar does have a ceiling. Two things in the yaml fixtures cannot be expressed in Plan 1 at all, and are dropped from the plan1 samples rather than faked: \`mdl.why\` (no field for it anywhere in Plan 1's request grammar — \`src/lens/parse.ts\`'s field list is \`perspective|where|problem|tags|focus|parent\`; Plan 1 predates the mdl: block), and the passing subset of a scale/choice primitive (Plan 1's \`~\`/\`?\` primitives, \`src/lens/request.ts\`'s \`Primitive\` interface, carry the full level/option list with no syntax to mark which subset passes — severity's real passing subset is none or low, route's is ship). \`depth\` is not a gap: Plan 1's header level (\`L1\`) already maps directly to \`depth: quick\` (\`SLOTS_PER_LEVEL = {1: 10, 2: 20, 3: 30}\`, \`src/lens/request.ts\`), just spelled differently.
`;

  const headline = `## Headline

- Across the 6 request verbs, yaml costs **${avgRatio(rows, allVerbs, 'json')}** of compact json's tokens on average, and **${avgRatio(rows, allVerbs, 'jsonPretty')}** of pretty json's — cheaper than the json people normally write by hand, a little dearer than the json \`JSON.stringify\` writes by default. Which one is "the json comparison" changes the answer; both are reported here rather than picking one.
- For \`class\` and \`view\` (the only verbs with a fair prose comparison, and where Plan 1 can be transcribed at all — see above for what it drops), yaml costs **${avgRatio(rows, FOUR_WAY_VERBS, 'prose')}** of prose's tokens on average, and **${avgRatio(rows, FOUR_WAY_VERBS, 'plan1')}** of Plan 1 text's.
- The compact YAML response costs **${avgRatio(rows, [RESPONSE_VERB], 'json')}** of the same content as compact json, and **${avgRatio(rows, [RESPONSE_VERB], 'jsonPretty')}** of pretty json's — the response side shows the same split as the request side.
`;

  const fourWay = `## \`class\` and \`view\`: all five formats\n\n${FOUR_WAY_VERBS.map((v) => verbSection(v, rows)).join('\n')}`;
  const sweep = `## \`replay\`, \`scan\`, \`drill\`, \`loop\`: yaml and json (compact + pretty) only\n\n${NO_PLAN1_PROSE}\n\n${SWEEP_VERBS.map((v) => verbSection(v, rows)).join('\n')}`;

  const response = `## Response side (agents read responses too)

The request-side rows above are what an agent writes. The response is what an agent reads back, and it costs tokens too. Plan 1's response line format is retired (AGENTS.md rule 5: "never Plan 1's line format"), and prose doesn't apply to structured output, so this is yaml vs json (compact + pretty) only — one illustrative response (the contract's own \`class\` worked example from AGENTS.md, produced by the real \`emit()\` function, not hand-typed).

${verbSection(RESPONSE_VERB, rows)}
\`\`\`yaml
${RESPONSE_YAML}\`\`\`
`;

  return `${preamble}\n\n${headline}\n${fairness}\n${fourWay}\n${sweep}\n${response}`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const outIdx = process.argv.indexOf('--out');
  const out = outIdx >= 0 ? process.argv[outIdx + 1]! : 'docs/evidence/tokens.md';
  writeFileSync(out, renderTokenDoc(runTokenBench()));
  console.log(`wrote ${out}`);
}
