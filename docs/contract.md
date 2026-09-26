# Sidewise call contract (public)

Public, scrubbed copy of the internal spec, for anyone integrating Sidewise. `[C-###]` tags mark every
normative claim; `scripts/trace.ts` (`npm run check:trace`) maps each one to the test that proves it, and
fails on any claim with none. Where this contract and the shipped engine disagree, this file describes what
actually ships, not the original plan.

Agents send YAML in and get YAML back. JSON is accepted too, since JSON is valid YAML 1.2. [C-001]
A malformed request is sent back as `✖ field: problem → fix` before any TypeSafe call or spend. [C-002]
The schema is `skills/sidewise/references/request.schema.json` (JSON Schema 2020-12); editors, MCP tools and
agents all read the same file. [C-003]

## 1. The idea in one screen

| Block | Holds | Required? | Sent to TypeSafe? |
|---|---|---|---|
| `side:` | **solve it now**: one `goal`, then plumbing. Questions grouped in **categories**, each with a **pass** | yes | yes |
| `wise:` | **get smarter**: why you're here, the area, and the run this follows | optional | no (ledger only) |

`side:` is required, and its contents are what reaches TypeSafe. [C-004]
`wise:` is optional, and never reaches TypeSafe — it's ledger-only context. [C-005]

**One core, three moves.** Every verb is the same core: `goal` + categories + `pass` + numbered questions. [C-006]
What changes is what it runs over:

| Move | How you ask for it | Verbs |
|---|---|---|
| **one subject** | `where:` (no `over`) | view, class, change |
| **across** arrays (a sweep) | `over:` nested arrays = layers; `ask:` per layer with `{layer}` blanks | loop (ideas), scan (code) |
| **down** from one item | `from:` an item in a parent run's arrays | drill |

One subject is asked with `where:` and no `over:` — view, class and change. [C-007]
A sweep is asked with `over:` (nested arrays as layers) and `ask:` per layer with `{layer}` blanks — loop
(ideas) and scan (code). [C-008]
Drill goes down from one item, named by `from:`, in a parent run's own arrays. [C-009]

| Grid | Know | Judge | Prove |
|---|---|---|---|
| **Side**: solve it with what's proven | [view](#view) | [class](#class) | [change](#change) |
| **Wise**: find what's new, and learn it | [scan](#scan) | [drill](#drill) | [loop](#loop) |

---

## 2. The core (every verb)

### Fields

| Block | Field | Rule |
|---|---|---|
| side | `goal` | one line, ≤ 160 chars; what you want to be true. Asked of TypeSafe outright |
| side | `depth` | `quick` · `standard` · `thorough`. One subject: 10 · 20 · 30 yes/no questions in total. A sweep: at most 10 · 20 · 30 items per layer |
| side | `where` | 1–5 project paths, optional `:start-end`. We read and redact the code |
| side | `ask` | categories → `pass` + numbered questions. In a sweep: layer → categories |
| side | `over` | sweeps only: nested arrays |
| side | `from`, `parent`, `compare` | drill and change only |
| wise | `why` | `validate` · `find` · `debug` |
| wise | `area` | `data` · `api` · `ui` · `auth` · `hosting` · `build` · `tests` |
| wise | `parent` | the run this follows (lineage only) |

`goal` is one line, at most 160 characters, and is the question asked of TypeSafe outright. [C-010]
`depth` is `quick` · `standard` · `thorough` = 10 · 20 · 30: one subject asks exactly that many yes/no
questions in total (scale/choice don't count); a sweep asks at most that many items per layer. [C-011]
`where` is 1–5 project paths, each optionally `:start-end`; the code there is read and redacted. [C-012]
`ask` holds categories → `pass` + numbered questions for one subject, or layer → categories for a sweep. [C-013]
`over` is sweeps-only: nested arrays that define the layers. [C-014]
`from`, `parent` and `compare` apply only to drill and change. [C-015]
`wise.why` is one of `validate`, `find` or `debug`. [C-016]
`wise.area` is one of `data`, `api`, `ui`, `auth`, `hosting`, `build` or `tests`. [C-017]
`wise.parent` records the run this one follows, for lineage only. [C-018]

A category is a lowercase name (one word or `kebab-case`, ≤ 20 chars), a `pass`, an optional `need`, optional
`tags` (≤ 3), and numbered questions. [C-019]
Questions are numbered 1…N, unique across all categories, with no gaps; the number is the priority. [C-020]
A yes/no question is text ending in `?`. [C-021]
A scale is `scale:` + `levels:` (2–10 levels); a choice is `choice:` + `options:` (2–8 options); at most 5
scale/choice questions total per request. [C-022]
`id`, `ts`, `actor` and `task` are stamped by the engine and never sent to the classifier. [C-023]

### Grading: a simple bar, checked per question

- `pass: yes`: an answer clears the bar at P(yes) ≥ 0.70. [C-024]
- `pass: no`: an answer clears the bar at P(yes) ≤ 0.30. [C-025]
- Anything in between does not clear it; there is no averaging. [C-026]
- For a scale or choice, the bar applies to the total probability of the passing levels or options. [C-027]

| `need:` | The category passes when |
|---|---|
| `all` (default) | every answer clears the bar |
| `most` | ≥ ⅔ clear it, and none land confidently the wrong way |
| `any` | at least one clears it |

`need: all` (the default): the category passes only when every answer clears the bar. [C-028]
`need: most`: the category passes when at least two-thirds of its answers clear the bar, and none land
confidently the wrong way. [C-029]
`need: any`: the category passes when at least one answer clears the bar. [C-030]
The goal passes at ≥ 0.70. [C-031]
The gate passes only when the goal and every category pass; in a sweep, an item passes only when its own
categories and all of its children pass. [C-032]
Consensus is one of STRONG, SPLIT or WEAK: whether the yes/no answers agree with each other, separate from
the grades. Only `class`'s response, and `drill`'s response on a one-subject parent, show it — a sweep
response (scan, loop, or drill on a sweep parent) and `change` don't compute it. [C-033]
`escalate` is `true` on non-STRONG consensus, `depth: thorough`, or a goal that reads as irreversible
(matching `delete`, `deploy`, `drop`, `pay`/`payment`, `migrat*`, `secret` or `credential`) — don't act on
this alone. It's shown wherever consensus is (class, and drill on a one-subject parent). [C-034]

### How it becomes TypeSafe calls

```
POST /v1/systemone   (model pinned by us)
one subject:  1 call.          state = {goal, code: {"<path>": <redacted>}}
              questions = {goal: noul, "1".."N": noul | score (criteria: levels) | choice (criteria: {option: option})}
a sweep:      1 call per layer. state = {goal, items: {"<item id>": <text or redacted code>}}
              questions = {"<item id>#<n>": {type, instructions: {item: "<item id>", question: "<filled-in text>"}}}
```

One subject makes one call: `state = {goal, code: {"<path>": <redacted>}}`, `questions = {goal: noul, "1".."N":
noul | score (criteria: levels) | choice (criteria: {option: option})}`. [C-035]
A sweep makes one call per layer: `state = {goal, items: {"<item id>": <text or redacted code>}}`, `questions
= {"<item id>#<n>": {type, instructions: {item, question}}}`. [C-036]
TypeSafe answers under the keys sent, so `"3"` and `"payments/refunds#3"` come back unchanged; categories,
`pass`, `need`, `tags` and `wise` never leave our side. [C-037]

### YAML traps we catch

| Agent writes | YAML reads it as | We send back |
|---|---|---|
| `4: Does it log: an email?` | a parse error | `✖ question 4 has ": " → put it in quotes` |
| `4: Is it # really safe?` | `Is it` (the rest is a comment) | `✖ question 4 doesn't end in "?" → put it in quotes` |
| a category or scale on one line in `{ }` whose question has a `?` | a parse error | `✖ use the indented form` |
| `4: no` | `false` | `✖ question 4 is not a question → write it as text` |
| `pass: no` / `pass: yes` | `false` / `true` in older parsers | accepted: false = no, true = yes |

`4: Does it log: an email?` is a YAML parse error, sent back as `✖ question 4 has ": " → put it in quotes`. [C-038]
`4: Is it # really safe?` reads as `Is it` (the rest becomes a comment), sent back as `✖ question 4 doesn't
end in "?" → put it in quotes`. [C-039]
A category or scale written on one line in `{ }` whose question has a `?` is a parse error, sent back as
`✖ ... → use the indented form`. [C-040]
`4: no` is read as the plain text `no`, not a question (the parser is YAML 1.2 core schema, where `no`/`yes`
stay text rather than becoming booleans) — sent back as `✖ question 4 is not a question → write it as
text`, the same as an unquoted `true`/`false`/`on`/`off`. [C-041]
`pass: no` / `pass: yes` written as `false` / `true` (an older parser's booleans) is accepted: false means
no, true means yes. [C-042]

### Every response

```yaml
side:                  # the result: gate first, then goal, then categories (or items in a sweep)
  id: SW-####
  gate: pass | fail | unsure
  …
wise: {recorded: [...]}    # or: none (this run teaches the ledger less)
next: <one follow-up command>
notes: [budget …, validation notes …]
```

The `side:` block lists the gate first, then the goal (when asked), then the categories or items. [C-043]
`wise:` is always `{recorded: [...]}` naming what was recorded, or `{recorded: none}` when nothing was. [C-044]
`next:` is one follow-up command. On a non-pass gate with a category or item to blame, it reads `sidewise
template drill --parent <id> --from <category-or-item>` — a filled-in drill template, never a bare `sidewise
drill` (drill always needs a request body to fill in). [C-045]
When every category (or item) passes and only the goal itself missed, `next:` instead says the goal missed
though every part passed, since there's nothing to drill into; in a sweep where every item was skipped past
the depth cap, it says so instead of naming one. [C-046]
`notes:` always ends with the budget line; any validation or evidence notes come first. [C-047]
Question text is never repeated in a response; the agent has it by number. [C-048]
A sweep response lists category gates per item and shows probabilities only for questions that didn't clear
the bar; the full numbers are in the ledger. [C-049]

---

## view

**Side × Know: what do we already know here?** Free: it reads the ledger and never calls TypeSafe. [C-050]

**When:** before any paid call; when entering an unfamiliar area; when looking for proven questions. [C-051]

```yaml
side:                              # the class request you're about to send, unchanged
  goal: This login handler is safe to merge
  depth: quick
  where: [src/user.ts:1-3]
  ask:
    injection:
      pass: no
      1: Is request text placed directly into the SQL query?
      2: Could a caller change what the query does?
wise:
  why: validate
  area: data
```

```yaml
side:
  view: src/user.ts:1-3
  reuse: SW-0042                   # the same questions on unchanged code → use that answer: no call, no spend
  runs: 7
  categories:                      # the record here, per category
    injection: {runs: 5, pass: 1, fail: 4, last: SW-0042}
    guards:    {runs: 5, pass: 4, fail: 1, last: SW-0042}
    leaks:     {runs: 0}           # never asked here: a gap
wise: {recorded: none}             # view reads only
next: sidewise view SW-0042        # read the reused answer
notes: [free]
```

Given a request body (a class-shaped draft), view answers in request mode with `view` (the `where` echoed
back), `reuse` when the exact question set was asked before on unchanged code, `runs` (how many runs have
touched this place), and `categories` — per category `{runs, pass, fail, last}`, or `{runs: 0}` when it's
never been asked here. [C-052]
`next` is `sidewise view <reuse>` when there's an exact reuse, to read that answer; otherwise it's `sidewise
class`, and your categories become the first pattern here. [C-053]
`wise: {recorded: none}` always, and view writes nothing to the ledger — no call, no spend, and its lookups
are not logged either. `notes: [free]`. [C-054]
Given a folder, a tag, or a run id instead of a request body, view answers in place/id mode, which is Plan
1's own text history rather than the YAML `side:` shape above: for a place, a count line (held / overruled /
failed / open, with rehearsal runs counted apart) followed by its newest runs, newest first; for a run id,
that run's lineage up and down. [C-055]

---

## class

**Side × Judge: does the evidence support this one goal?** One call, one state. [C-056]

**When:** a decision on one subject: merge, choose, triage, check a fix. [C-057]

```yaml
side:
  goal: This login handler is safe to merge
  depth: quick
  where: [src/user.ts:1-3]
  ask:
    injection:
      pass: no
      1: Is request text placed directly into the SQL query?
      2: Could a caller change what the query does?
      10: Would a standard security scanner flag this code?
    guards:
      pass: yes
      3: Is the id checked to be a number before use?
      6: Is the caller compared to the record owner?
      9: Does the query select only needed columns?
    access:
      pass: no
      4: Could one user read another user's record?
      5: Can any caller read any record without a permission check?
    leaks:
      pass: no
      7: Does the error sent back reveal the query?
      8: Does the code log an email address?
    severity:
      pass: [none, low]
      11:
        scale: How severe is the worst issue?
        levels: [none, low, medium, high, critical]
    route:
      pass: [ship]
      12:
        choice: Where should this go?
        options: [ship, fix, block]
wise:
  why: validate
  area: data
```

```yaml
side:
  id: SW-0042
  gate: fail
  goal: {gate: fail, p: 0.08}
  injection: {gate: fail,   1: 0.94, 2: 0.91, 10: 0.90}
  guards:    {gate: pass,   3: 0.88, 6: 0.81, 9: 0.75}
  access:    {gate: fail,   4: 0.86, 5: 0.84}
  leaks:     {gate: unsure, 7: 0.51, 8: 0.20}
  severity:  {gate: fail,   11: {top: high, p: 0.81}}
  route:     {gate: fail,   12: {top: block, p: 0.97}}
  consensus: STRONG
  escalate: false
wise: {recorded: [why, area]}
next: sidewise template drill --parent SW-0042 --from injection
notes: [budget 1% used ($0.02 of $5.00 · 3 of 500 runs)]
```

`next:` on `pass` is the caller's own text ("act on it"); on `fail`, it drills into the first category whose
own gate is `fail`, in written order; on `unsure`, the first category whose own gate is `unsure`. [C-058]
Wise learns the pass/fail record per category, per place and per area; these questions and categories become
a candidate pattern for this place. [C-059]

---

## change

**Side × Prove: did the change work?** It replays a parent run's questions (the yardstick) on two states. [C-060]

**When:** after a fix, a refactor, a dependency bump, or to compare fix A with fix B. [C-061]

```yaml
side:
  goal: The injection fix works
  parent: SW-0042                  # replay this run's categories and questions
  compare: {before: main, after: HEAD}
wise:
  why: validate
  area: data
```

```yaml
side:
  id: SW-0051
  gate: fail                       # every category passes on "after", and nothing regressed
  goal: {gate: pass, p: 0.84}
  injection: {before: fail, after: pass, fixed: [1, 2, 10]}
  guards:    {before: pass, after: pass}
  access:    {before: fail, after: fail, still: [4, 5]}
  leaks:     {before: unsure, after: pass, fixed: [7]}
  regressed: []
wise: {recorded: [why, area, parent]}
next: sidewise template drill --parent SW-0051 --from access
notes: [2 states · budget 2% used]
```

`change` never takes `ask`: it replays the parent's categories and questions; new questions go through
`class`. [C-062]
`change`'s parent must be a one-subject run (class, change, or drill's one-subject form) — a sweep parent is
refused; run the sweep again instead, since unchanged items are reused there for free. [C-063]
A category's response shows `before`/`after` gates, `fixed` (questions failing or unsure before that pass
after) and `still` (ones that don't); anything in the run-wide `regressed` list (passing before, not after
now) can alone fail the gate even when every `after` category passes on its own. [C-064]
On `fixed`, record `outcome held` on the parent; on `still`, keep working; anything in `regressed`, revert or
drill into it. [C-065]
Called as `sidewise change --parent SW-#### --compare <before>..<after>` (no request file), the goal asked is
the parent run's own goal, not a fixed placeholder. [C-066]

---

## scan

**Wise × Know: where in this code should we look?** A sweep across code, read by us. [C-067]

**When:** a new codebase, a release check, a PR's changed files, or a vague bug with no location yet. [C-068]

```yaml
side:
  goal: Handlers don't trust request input
  depth: quick                     # at most 10 items per layer
  over:
    file: src/handlers/*.ts        # we expand the pattern and read each file
    function: each                 # we split each file into its functions
  ask:
    function:
      injection:
        pass: no
        1: Does {function} put request text straight into a query?
      access:
        pass: no
        2: Does {function} return a record without checking its owner?
wise:
  why: find
  area: api
```

```yaml
side:
  id: SW-0060
  gate: fail
  goal: {gate: fail, p: 0.21}
  scanned: {file: 6, function: 23}
  failing:                         # worst first; only questions that didn't clear the bar
    src/handlers/user.ts/findUser:    {injection: fail, access: fail, 1: 0.93, 2: 0.88}
    src/handlers/order.ts/getOrder:   {access: fail, 2: 0.79}
    src/handlers/order.ts/listOrders: {access: unsure, 2: 0.52}
  passing: 20                      # counted, not listed
  reused: 14                       # unchanged functions answered from the ledger for free
wise: {recorded: [why, area]}
next: sidewise template drill --parent SW-0060 --from src/handlers/user.ts/findUser
notes: [1 call (the function layer; files are read, not asked) · budget 4% used]
```

scan's response shows `failing:` worst first — most failing categories, then most unsure, then written order
— with `passing:` and `reused:` as counts (never lists), plus `scanned: {layer: count, ...}`. [C-069]
`next:` drills into the worst item, or says the goal alone missed when nothing failed, or that every item was
skipped past the depth cap when nothing was graded at all. [C-070]
An unchanged function on a later scan is answered from the ledger for free: a second scan of unchanged code
costs nothing. [C-071]
Reused answers are stored per function, not per file or per run, so a later scan (or a drill down from it)
pays only for what actually changed; there is no separate folder- or category-level pattern query yet — a
sweep run's own top-level `categories` stays empty, and only its per-item grading (read back by that item's
own id) carries the record. [C-072]

---

## drill

**Wise × Judge: why did this one thing fail?** It goes down from one item in a parent run. [C-073]

**When:** after a `fail` or `unsure` from class, scan, loop or change. [C-074]

```yaml
side:
  goal: Find exactly where request text reaches the query
  parent: SW-0060
  from: src/handlers/user.ts/findUser    # an item id or a category from the parent run
  depth: quick
  over:
    call: each                     # the next layer down: each call inside findUser
  ask:
    call:
      injection:
        pass: no
        1: Does {call} pass request text into SQL?
        2: Is {call}'s argument built by string concatenation?
wise:
  why: debug
  area: data
```

```yaml
side:
  id: SW-0061
  gate: fail
  goal: {gate: pass, p: 0.77}
  failing:
    src/handlers/user.ts/findUser/db.query: {injection: fail, 1: 0.96, 2: 0.94}
  passing: 3
wise: {recorded: [why, area]}
next: fix it, then run this drill again (unchanged items are reused, so it is nearly free)
notes: [1 call · budget 4% used]
```

On a sweep parent (scan, loop, or an earlier sweep drill), `from:` names an item, and drill needs `over:` for
the next layer down under it; the response is shaped like scan's, worst first. [C-075]
On a one-subject parent (class, change, or an earlier one-subject drill), `from:` names a category instead;
new, narrower questions go under `ask:` inside it, and the response has the same shape as class's, including
consensus and escalate. [C-076]
drill's own `next:` never points at drilling further: on a one-subject parent it says to fix it, then
`change` against the parent; on a sweep parent it says to fix it and run this same drill again, since
unchanged items are reused, so it is nearly free. [C-077]
Wise learns which narrower questions separate the real cause from the noise; they become the drill pattern
for that category. [C-078]

---

## loop

**Wise × Prove: does this idea hold up?** A sweep across layers of ideas, written by the agent. [C-079]

**When:** a design, a plan or a feature request before any code; comparing two designs. [C-080]

```yaml
side:
  goal: The checkout redesign is sound
  depth: quick
  where: [src/checkout/]           # optional: the code the ideas are checked against
  over:                            # nested arrays = layers; an item's children are the next layer
    part:
      - name: gateway
        story: [guest checkout, saved cards]
      - name: payments
        story: [refunds, retries, partial capture]
      - ledger                     # an item with no children is just its name
  ask:                             # per layer; {part} and {story} are filled in per item
    part:
      boundaries:
        pass: yes
        1: Does {part} own one clear responsibility?
        2: Can {part} be deployed without the others?
    story:
      done:
        pass: yes
        3: Is "{story}" testable against {part} as written?
      risk:
        pass: no
        4: Does "{story}" need data {part} doesn't own?
wise:
  why: validate
  area: api
```
The expansion: 3 parts + 5 stories = 8 items, and 4 written questions become 16 asked, in 2 calls (one per
layer).

```yaml
side:
  id: SW-0070
  gate: fail
  goal: {gate: pass, p: 0.74}
  failing:                         # an item fails if it or any child fails
    payments:                  {boundaries: fail, 2: 0.18}
    payments/refunds:          {done: fail, risk: fail, 3: 0.22, 4: 0.91}
    payments/partial capture:  {risk: unsure, 4: 0.48}
  passing: [gateway, gateway/guest checkout, gateway/saved cards, payments/retries, ledger]
wise: {recorded: [why, area]}
next: sidewise template drill --parent SW-0070 --from payments/refunds
notes: [2 calls · 16 questions · budget 3% used]
```

loop's response shows `failing:` and `passing:` in the order the request was written (tree order), unlike
scan's worst-first order; `passing:` is a list of item ids, not a count. [C-081]
An item fails if it or any of its children fails. [C-082]
Like scan, a loop run's own top-level `categories` stays empty; the full per-item grading (which layer
structures and questions turned up trouble) is kept in the ledger, on that run, but there is no dedicated
query yet that mines it into a pattern across runs the way class's per-category history does. [C-083]

---

## Settled by the agent test (v1.1)

- `side.verb` is optional. The tool name wins, and a mismatch is sent back. [C-084]
- `depth` counts yes/no questions only; scale and choice don't count. [C-085]
- Nested items use `- name: <item>` plus child layers beside it, which is what agents write naturally.
  Different items may have different child layers. [C-086]
- `--dry-run` (class, change, scan, drill, loop) reports the calls and question count with no call and no
  spend, as `plan: {calls, questions, ...}` followed by `notes: ["dry run: no call, no spend"]`. [C-087]
- The engine needs Node ≥ 22.13 to use its `node:sqlite`-backed lookup index; on an older Node (this repo's
  own Node 20 host) it falls back to a slower, always-correct linear scan instead. Either way the ledger
  itself (`.sidewise/log.jsonl`) stays the source of truth: the index is a disposable, self-healing cache
  that a missing or corrupt copy only costs a rebuild, never a wrong answer. [C-088]
