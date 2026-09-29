# MM3 call contract (public)

Public, scrubbed copy of the internal spec, for anyone integrating MM3. `[C-###]` tags mark every
normative claim; `scripts/trace.ts` (`npm run check:trace`) maps each one to the test that proves it, and
fails on any claim with none. Where this contract and the shipped engine disagree, this file describes what
actually ships, not the original plan.

Agents send YAML in and get YAML back. JSON is accepted too, since JSON is valid YAML 1.2. [C-001]
A malformed request is sent back as `✖ field: problem → fix` before any TypeSafe call or spend. [C-002]
The schema is `skills/mm3/references/request.schema.json` (JSON Schema 2020-12); editors, MCP tools and
agents all read the same file. [C-003]

## 1. The idea in one screen

| Block | Holds | Required? | Sent to TypeSafe? |
|---|---|---|---|
| `mak:` | **make**: the request itself, one `goal`, then plumbing. `ask:` splits into **concerns** (yes/no, one path per category) and **decisions** (scale/choice) | yes | yes |
| `mdl:` | **model**: why you're here, the area, and the run this follows, so the ledger learns | optional | no (ledger only) |

`mak:` is required, and its contents are what reaches TypeSafe. [C-004]
`mdl:` is optional, and never reaches TypeSafe — it's ledger-only context. [C-005]

**One core, three moves.** Every verb is the same core: `goal` + categories + `pass` + numbered questions. [C-006]
What changes is what it runs over:

| Move | How you ask for it | Verbs |
|---|---|---|
| **one subject** | `where:` (no `over`) | view, class, replay |
| **across** arrays (a sweep) | `over:` nested arrays = layers; `ask:` per layer with `{layer}` blanks | loop (ideas), scan (code) |
| **down** from one item | `from:` an item in a parent run's arrays | drill |

One subject is asked with `where:` and no `over:` — view, class and replay. [C-007]
A sweep is asked with `over:` (nested arrays as layers) and `ask:` per layer with `{layer}` blanks — loop
(ideas) and scan (code). [C-008]
Drill goes down from one item, named by `from:`, in a parent run's own arrays. [C-009]

| Grid | Know | Judge | Prove |
|---|---|---|---|
| **MAK³**: use what is proven | [view](#view) | [class](#class) | [replay](#replay) |
| **MDL³**: learn what is missing | [scan](#scan) | [drill](#drill) | [loop](#loop) |

MAK³ (make) and MDL³ (model) are modes of the six verbs, named in prose only: the request keys are always `mak:`
and `mdl:`, on every verb, and a key never selects a mode; the verb you run does.

---

## 2. The core (every verb)

### Fields

| Block | Field | Rule |
|---|---|---|
| mak | `goal` | one line, ≤ 160 chars; what you want to be true. Asked of TypeSafe outright |
| mak | `depth` | `quick` · `standard` · `thorough` = k = 1 · 2 · 3. One subject's `concerns:` section: exactly 3k categories (9 · 18 · 27 yes/no questions). A sweep's finest layer: the same; every layer also caps at 10 · 20 · 30 items asked |
| mak | `where` | 1–5 project paths, optional `:start-end`. We read and redact the code |
| mak | `ask` | `concerns:` (yes/no categories) + `decisions:` (scale/choice categories) for one subject. In a sweep: layer → `{concerns:, decisions:}` |
| mak | `over` | sweeps only: nested arrays |
| mak | `from` | drill only |
| mak | `compare` | replay only |
| mak | `parent` | required by drill and replay (what to build on); allowed on every verb otherwise, as lineage only |
| mak | `expect` | replay only, required: which of the parent's concerns this replay should turn to pass, or the word `none` (an empty list `[]` counts as `none`) to predict no flips at all |
| mdl | `why` | `validate` · `find` · `debug` |
| mdl | `area` | `data` · `api` · `ui` · `auth` · `hosting` · `build` · `tests` — single value, or a list of up to 2; omit for a whole-system question (`uses` carries the map) |
| mdl | `stage` | `design` · `build` · `review` · `pre-merge` · `post-fix` · `release` · `operate` (live production/incident) |
| mdl | `change` | `feature` · `fix` · `refactor` · `dependency` · `config` — only when a code change is involved |
| mdl | `risk` | `low` · `medium` · `high`: the stakes if this answer is wrong |
| mdl | `parent` | the run this follows (lineage only; an alias of `mak.parent` for verbs that don't require it structurally) |
| mdl | `problem` | one line: what you're solving right now |
| mdl | `uses` | up to 5 C4 chains: `level:name( -> level:name)*` (`level`: `person`/`system`/`container`/`component`/`code`); a single string is a 1-item list |
| mdl | `touches` | up to 5 short domain objects/fields the run touches (not language built-ins) |
| mdl | `blast` | `code` · `component` · `container` · `system` · `person` — the widest level one failure reaches (`person` = users' data or accounts) |
| mdl | *(any other key)* | a lower-kebab key ≤ 20 characters: one line ≤ 160, or a list of ≤ 5 such lines, recorded as-is |

`goal` is one line, at most 160 characters, and is the question asked of TypeSafe outright. [C-010]
`depth` is `quick` · `standard` · `thorough` = k = 1 · 2 · 3: one subject's `ask.concerns` holds exactly 3k
categories, each with exactly 3 yes/no probes (9 · 18 · 27 total); a sweep's finest layer (the last layer in
`over`'s own order — e.g. scan's `function`, loop's `story`) is held to the same rule, and every layer also
caps at 10 · 20 · 30 items asked (this cap kept its old 10/20/30 numbers even though the question-count numbers
above moved — the two used to coincide and no longer do). These section and count rules are stops in `class`,
`drill`, `scan` and `loop`; in `view` they're notes instead ("class will stop on this") — a partial draft is
fine there. A sweep's non-finest layers are optional, and when present don't have their counts enforced either
(a note if thin) — only their shape (well-formed `concerns:`/`decisions:`) has to hold. [C-011]
`where` is 1–5 project paths, each optionally `:start-end`; the code there is read and redacted. [C-012]
A `where:` entry over the per-file limit (20,000 chars, after redaction) is a stop, not a silent truncation: a
whole file (no `:start-end`) names its own line count and asks for a range; a range that's already this big
asks to be narrowed further. [C-169]
Several `where:` entries that together cross the 60,000-char total are a stop the same way, naming which entry
doesn't fit — the same silent-cut problem, just across entries instead of within one. [C-170]
The one exception is evidence MM3 itself picked, never a user-typed `where:` — today, only `drill`
continuing flat from one coded sweep item with no further `over:` (its own whole-file/function/call range) —
which still truncates with a note, since there's no `where:` for anyone to narrow. [C-171]
`ask` holds `concerns:` (yes/no categories) and `decisions:` (scale/choice categories) for one subject, or
layer → `{concerns:, decisions:}` for a sweep. Nothing is published on a flat, unsectioned `ask` any more: a
category with `pass:` straight under `ask:` (no `concerns:`/`decisions:` wrapper) is refused outright,
`✖ mak.ask: put categories under concerns: (yes/no) and decisions: (scale/choice) → mm3 template <verb>`.
[C-013]
`over` is sweeps-only: nested arrays that define the layers; `concerns` and `decisions` are reserved words
there too, since a layer of either name would collide with `ask`'s own sections. [C-014]
`from` applies only to drill; `compare` only to replay. `parent` is required by drill and replay (the run to
build on); every other verb accepts it too now, purely as lineage (the same role `mdl.parent` already played,
which remains an accepted alias for it). [C-015]
`mdl.why` is one of `validate`, `find` or `debug`. [C-016]
`mdl.area` is one of `data`, `api`, `ui`, `auth`, `hosting`, `build` or `tests` — a single value, or a list of
up to 2 (omit it for a question about the whole system; `mdl.uses` carries the map instead). [C-017]
`mdl.parent` records the run this one follows, for lineage only. [C-018]
`mdl.stage` is one of `design`, `build`, `review`, `pre-merge`, `post-fix`, `release` or `operate` (`operate`:
a live production/incident question). [C-108] [C-209]
`mdl.change` is one of `feature`, `fix`, `refactor`, `dependency` or `config` — only when a code change is
actually involved (a pure design/plan question, e.g. `loop`, usually leaves it out). [C-109]
`mdl.risk` is one of `low`, `medium` or `high`: the stakes if this answer turns out to be wrong. [C-110]
`mdl.problem`, `mdl.uses`, `mdl.touches` and `mdl.blast` are the knowledge fields: a one-line problem
statement, up to 5 C4 dependency chains, up to 5 touched entities, and a blast-radius level. All four are
optional, and none of them reach the classifier — like every other `mdl` field, they only shape what the
ledger learns. `mdl.uses` (replaces the single-string `mdl.nodes` of the earlier contract — nothing is
published on `nodes` any more, though an old ledger record that still has one reads back as a 1-item `uses`)
is a list of up to 5 C4 chains, each a chain of `level:name` pairs (`level` one of `person`, `system`,
`container`, `component` or `code`; `name` project-identifier-shaped, or `name/name` for containment, or ending
`?` for something guessed or not built yet), joined by ` -> ` within one chain — e.g.
`container:api -> component:contributions-dao -> container:db`; a single string is accepted as a 1-item list.
`mdl.touches` names domain objects/fields the run is actually about, not language built-ins or vague concepts.
`mdl.blast`'s widest level, `person`, means the failure reaches users' own data or accounts. [C-205]
Every closed `mdl` field (`why`, `area`, `stage`, `change`, `risk`, `blast`) also accepts the literal value
`unknown`, when the agent genuinely doesn't know yet. [C-206]
Any other key under `mdl:` is accepted as a custom field when it's a lower-kebab name ≤ 20 characters: its
value (one line ≤ 160 characters, or a list of up to 5 such lines) is recorded as-is, with no further checking
— `mm3 agent mdl` still generates its card from the built-in table plus any project config, so a custom
key is a genuine escape hatch, not a way to redefine a catalog field. [C-207]
The whole `mdl:` block is capped at 25 YAML source lines, counted from the request's own text (not the parsed
value) — the 26th line stops with `✖ mdl: 26 lines → the mdl block is capped at 25 lines`. [C-208]

A concerns category is a lowercase name (one word or `kebab-case`, ≤ 20 chars), `pass: yes` or `pass: no`, an
optional `need`, optional `tags` (≤ 3), an optional `family`, and exactly 3 yes/no questions (each ending in
`?`). [C-019]
`family` is one of `access`, `injection`, `secrets`, `input`, `output`, `availability`, `correctness`,
`design`, `design-risk`, `done` or `other` — optional, and meaningful only on a concerns category. Left out, it
defaults to the category's own name when that name is itself one of the family values, else it stays unset;
given explicitly, it always wins over the name default. It's ledger-only: never sent to the classifier, and
never part of an answer key or a pattern fingerprint, so retagging a category's family never changes whether
its answer is reused.
A decisions category holds exactly one question, `scale:` + `levels:` (2–10 levels) or `choice:` + `options:`
(2–8 options), and a `pass:` naming the passing levels/options. [C-022]
The `decisions:` section as a whole holds 2–5 categories, with at least one `scale:` and at least one
`choice:` among them — this, not a flat per-request cap, is what replaced the older "at most 5 scale/choice
questions" rule.
Questions are numbered 1…N, unique across every category (and, in a sweep, every layer), with no gaps: every
concerns question is numbered before every decisions question in the same `ask:` block. [C-020]
A yes/no question is text ending in `?`. [C-021]
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
A sweep's goal answer key includes every asked item's own evidence text (sorted and concatenated), not just the
goal text — so a code change anywhere in the sweep invalidates a cached goal answer, even though the goal
question itself didn't change. [C-214]
The gate passes only when the goal and every category pass; in a sweep, an item passes only when its own
categories and all of its children pass. [C-032]
Consensus is one of STRONG, SPLIT or WEAK: whether the yes/no answers agree with each other, separate from
the grades. Only `class`'s response, and `drill`'s response on a one-subject parent, show it — a sweep
response (scan, loop, or drill on a sweep parent) and `replay` don't compute it. [C-033]
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
`pass`, `need`, `tags` and `mdl` never leave our side. [C-037]

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
Before any of the above ever reaches YAML parsing, every numbered question line carrying one of the two traps
above (an unquoted `": "`, or text starting with an unquoted `"{"`), plus every line over the request's own
character cap (full-line comments skipped, a trailing `# comment` stripped first), is reported together, in one
response — not just whichever one the parser happens to choke on first — capped at the same "a few lines, then
`N more`" shape every other stop list uses. A blank filled in per sweep item (`{function}`) is never flagged:
only a question's own text actually *starting* with `{` is a trap. When nothing trips this pre-parse scan,
parsing proceeds exactly as before, so an already-passing request keeps its original wording untouched.
Every stop a request can trigger — a parse error, a validation stop, or a bad `where`/git path — ends with
`→ see: mm3 agent <verb>`, naming the verb that was actually run, on top of whatever it already told you
to fix: a stop is read by the agent that sent the request, not a person at a terminal, so it points at the
terse agent view, not `help`. [C-153]
That same pointer now closes every other stop a person or agent can hit while running one of the six verbs or
the four tools beyond them (`report`, `outcome`, `budget`, `template`) — not just a request's own validation:
`view`'s own place/id checks (control characters, outside the project, an unknown run id), `drill`'s own
parent/from/over checks that aren't evidence reads (an unknown or pre-contract `mak.parent`, `mak.from` naming
no such item or category, an item with no code, code that changed since scan, an idea item given a code-only
layer, `mak.over` on a non-sweep parent), `report`'s own view-name checks, `budget`'s own cap-reached/
corrupt-file/bad-cap-value messages, and `outcome`'s own ledger-lookup checks (an unknown run id, the asking
actor trying to self-certify `held`) — plus every bare CLI usage mistake for a pointable command (an unknown or
duplicated flag, a missing project, a request file the CLI itself couldn't read, `outcome`'s own id/value/`--by`
checks, `budget`'s own cap parsing). `report`, `outcome`, `budget` and `template` are tools, not one of the six
`Verb`s, so `verbs/request.ts`'s `stopText` widens to a small `AgentTarget` union (`Verb` plus the four tool
names) rather than `verbs/` importing `help/agent.ts`'s `AGENT_TOOLS` just for a type; `budget/budget.ts` and
`ledger/log.ts` sit below `verbs/` in the dependency order, so their own stops append the identical
`\n→ see: mm3 agent <tool>` line as a literal suffix instead, avoiding a layering inversion. A command with
no agent card (`help`, `agent`, `doctor`, `init`, `uninstall`, `mcp`) never gets this pointer — there's nothing
deeper for it to point at. [C-197]

### Every response

```yaml
mak:                  # the result: gate first, then goal, then categories (or items in a sweep)
  id: MM3-####
  gate: pass | fail | unsure
  …
mdl: {recorded: [...]}    # or: none (this run teaches the ledger less)
next: <one follow-up command>
notes: [budget …, validation notes …]
```

The `mak:` block lists the gate first, then the goal (when asked), then the categories or items. [C-043]
`mdl:` is always `{recorded: [...]}` naming what was recorded, or `{recorded: none}` when nothing was. [C-044]
`next:` is one follow-up command. On a non-pass gate with a category or item to blame, it reads `mm3
template drill --parent <id> --from <category-or-item>` — a filled-in drill template, never a bare `mm3
drill` (drill always needs a request body to fill in). [C-045]
When every category (or item) passes and only the goal itself missed, `next:` instead says the goal missed
though every part passed, since there's nothing to drill into; in a sweep where every item was skipped past
the depth cap, it says so instead of naming one. [C-046]
`notes:` always ends with the budget line; any validation or evidence notes come first. [C-047]
The budget line states headroom, not a percentage: `budget: $0.11 left of $0.12 · 27 of 30 runs left` (dollars
left of the dollar cap, runs left of the run cap; never below zero). One formatter builds it for every run's
`notes:` and for `mm3 budget`, `budget set` and `budget reset`. It gains a leading `⚠` only at 80% or more used
(of either cap), and then says what to do and which cap is low: `⚠ budget: $0.02 left of $0.12 · 3 of 30 runs
left → low: ask the owner to run mm3 budget set --usd <n> --runs <n>` (only the low cap's flag is named). Below
80% there is no warning, so an agent reads a nearly-full budget as room to keep working. [C-229]
A run made with a rehearsal adapter (`fake`, `chaos` — free, deterministic, offline, canned) adds `adapter
<name> · not evidence` to `notes:`, right before the budget line, on every verb that calls the classifier
(class, scan, drill, loop, replay) — so a rehearsal answer is never mistaken for real evidence. [C-092]
Budget caps (`usd`, `runs`) live in `.mm3/config.yaml`'s `budget:` key; spend and run counts are derived
from the ledger itself, never a separate counter. A project with neither `config.yaml` nor a legacy
`.mm3/budget.json` simply runs on the built-in defaults ($5.00, 500 runs), silently. A legacy
`budget.json` (from before this) is migrated into `config.yaml` at most once, the first time any of those verbs
preflights a call; that same run's `notes:` says so (`budget file created with defaults ($5.00 · 500 runs)`),
once, since every later run finds `config.yaml` already holding its own `budget:` key. [C-093]
On TypeSafe's direct route, which reports no cost of its own, a run whose answering model has a published
rate (today, only `jev-1.13.0`, at $42 per billion input tokens; output tokens are free) is charged an
estimate from its input tokens instead of showing $0.00, and `notes:` says `cost estimated from tokens (no
live pricing reported)` so it's never mistaken for a figure TypeSafe itself reported. A model with no
published rate keeps its cost unreported, never guessed at; a cost the gateway route did report always wins
over the estimate. Every verb that calls the classifier (class, scan, drill, loop, replay) does this the same
way. [C-132]
Compat note (no new claim): run ids are `MM3-####`; the retired `SW-####` shape is still read wherever an id is
accepted (`parent:`, `view <id>`, `outcome <id>`), and an old ledger record written with `side:`/`wise:` keys loads
as `mak`/`mdl`, the same way an old `mdl.nodes` loads as `uses`. Nothing writes the old shapes any more.
Question text is never repeated in a response; the agent has it by number. [C-048]
A sweep response lists category gates per item and shows probabilities only for questions that didn't clear
the bar; the full numbers are in the ledger. [C-049]

---

## view

**MAK³ × Know: what do we already know here?** Free: it reads the ledger and never calls TypeSafe. [C-050]

**When:** before any paid call; when entering an unfamiliar area; when looking for proven questions. [C-051]

```yaml
mak:                              # the class request you're about to send — a partial draft is fine
  goal: This login handler is safe to merge
  depth: quick
  where: [src/user.ts:1-3]
  ask:
    concerns:
      injection:
        pass: no
        1: Is request text placed directly into the SQL query?
        2: Could a caller change what the query does?
mdl:
  why: validate
  area: data
```

```yaml
mak:
  view: src/user.ts:1-3
  reuse: MM3-0042                   # the same questions on unchanged code → use that answer: no call, no spend
  runs: 7
  categories:                      # the record here, per category
    injection: {runs: 5, pass: 1, fail: 4, last: MM3-0042}
    guards:    {runs: 5, pass: 4, fail: 1, last: MM3-0042}
    leaks:     {runs: 0}           # never asked here: a gap
mdl: {recorded: none}             # view reads only
next: mm3 view MM3-0042        # read the reused answer
notes: [free]
```

Given a request body (a class-shaped draft), view answers in request mode with `view` (the `where` echoed
back), `reuse` when the exact question set was asked before on unchanged code, `runs` (how many runs have
touched this place), and `categories` — per category `{runs, pass, fail, last}`, or `{runs: 0}` when it's
never been asked here. There is no `best` field yet: nothing ranks "the question set with the best record
here," even for a category whose fix was later recorded `held`. [C-052]
`next` is `mm3 view <reuse>` when there's an exact reuse, to read that answer; otherwise it's `mm3
class`, and your categories become the first pattern here. [C-053]
`mdl: {recorded: none}` always: view never adds to what the ledger *teaches* (no run, no category record) —
no call, no spend. `notes: [free]`. Every successful view — a full draft check (`ask:` categories), a place/tag
browse, or a run-id lookup — appends one free `kind: "lookup"` ledger line of its own (`goal`, `where`, `hit`,
`reused`), so the ledger can see what agents search for even when nothing is asked outright; it takes no
`MM3-####` id, is never counted as a run, and never touches the budget (see "Setup, keys and the MCP tool"
below). A draft check's own `hit`/`reused` reflect a real exact-answer match; a place/tag browse or a run-id
lookup always logs `hit: false, reused: null` (there's no "exact question set" concept for a bare browse), with
`goal`/`where` carrying the place string or run id itself, so the record still says *what* was searched for. A
run-id lookup that fails (an id not in the ledger) logs nothing, same as a failed draft check. [C-054]
Given a folder, a tag, or a run id instead of a request body, view answers in place/id mode, which is Plan
1's own text history rather than the YAML `mak:` shape above: for a place, a count line (held / overruled /
failed / open, with rehearsal runs counted apart) followed by its newest runs, newest first; for a run id,
that run's lineage up and down. [C-055]
A scan/loop/drill sweep run's own `where` is always empty (its questions are asked per item, not per
request); its real code locations and category tags are indexed from its items' own units and layers
instead, so `view <folder>` and `view <tag>` find a sweep run the same way they already find a class/replay/
drill run — not only `view .`. [C-120]
`view <path>` reads a named file's own bytes only to check whether it looks like a request (`mak:` or JSON);
a real source file that isn't one is always shown as a place, never misread as "control characters" just
because its code is hard to parse as YAML. A saved request file is still read as a request, exactly as
before. [C-121]
The "… N older → raise the level to see more" line means what it says: no row is ever silently dropped
without a count and a way to see it. [C-122]
`view <MM3-####> --level 2|3` adds answer detail about the run itself, on top of the lineage `--level` already
controlled: level 2 shows its own category gates (or, for a sweep, how many of its items are failing); level
3 adds its notes and adapter/model. Level 1 is unchanged. A legacy (Plan 1) run has none of this stored, so
any level above 1 is a documented no-op for it, never a stop. [C-123]
`view <folder|tag|.> --summary` prints one line per distinct place (a `where` path, or a sweep item's own code
path), from the latest run that touched it, worst gate first — the free onboarding briefing, without
hand-assembling it from several `view` calls. Ignored for a run id or a request draft, where "one line per
place" doesn't apply. [C-124]
`view <MM3-####> --answers` adds, on top of the lineage and any `--level` detail already shown, one line per
question that run actually asked: its id, its text, its checked answer (`p <n>` for yes/no; the winning
level/option and its share for scale/choice), `reused <MM3-####>` when that question's answer came from a
prior run, and its answer key (`translate.ts`'s `answerKey` — what makes it reusable). A sweep's questions are
its items' own (`<item id>#<n>`, filled in), not the request's — `ask.categories` is always empty for one
(C-120). Ignored for a place/tag or a request draft, the same restriction `--summary` has in reverse (C-124);
a legacy (Plan 1) run has none of this stored, so it's a silent no-op, the same idiom `--level` above 1
already uses (C-123). [C-215]

---

## class

**MAK³ × Judge: does the evidence support this one goal?** One call, one state. [C-056]

**When:** a decision on one subject: merge, choose, triage, check a fix. [C-057]

```yaml
mak:
  goal: This login handler is safe to merge
  depth: quick                     # k=1: exactly 3 concerns categories, 9 yes/no questions total
  where: [src/user.ts:1-3]
  ask:
    concerns:
      injection:                   # family defaults to "injection" (the name is itself one)
        pass: no
        1: Is request text placed directly into the SQL query?
        2: Is the query built with string concatenation instead of a bound parameter?
        3: Does the query run with db.query on that concatenated string?
      access:
        pass: no
        4: Is the id checked to be a number before use?
        5: Is the caller compared to the record owner?
        6: Could any caller read any record without a permission check?
      leaks:
        pass: no
        7: Does the error sent back reveal the query?
        8: Does the code log an email address?
        9: Does the response include fields the caller didn't ask for?
    decisions:
      severity:
        pass: [none, low]
        10:
          scale: How severe is the worst issue?
          levels: [none, low, medium, high, critical]
      route:
        pass: [ship]
        11:
          choice: Where should this go?
          options: [ship, fix, block]
mdl:
  why: validate
  area: data
```

```yaml
mak:
  id: MM3-0042
  gate: fail
  goal: {gate: fail, p: 0.08}
  injection: {gate: fail,   1: 0.94, 2: 0.91, 3: 0.90}
  access:    {gate: fail,   4: 0.86, 5: 0.84, 6: 0.79}
  leaks:     {gate: unsure, 7: 0.55, 8: 0.20, 9: 0.31}
  severity:  {gate: fail,   10: {top: high, p: 0.81}}
  route:     {gate: fail,   11: {top: block, p: 0.97}}
  consensus: STRONG
  escalate: false
mdl: {recorded: [why, area]}
next: mm3 template drill --parent MM3-0042 --from injection
notes: ["budget: $4.98 left of $5.00 · 497 of 500 runs left"]
```

`next:` on `pass` is the caller's own text ("act on it"); on `fail`, it drills into the first category whose
own gate is `fail`, in written order; on `unsure`, the first category whose own gate is `unsure`. [C-058]
The ledger learns the pass/fail record per category, per place and per area; these questions and categories become
a candidate pattern for this place. [C-059]
When any question's answer was reused (whole or in part) from an earlier run, the response names which one:
`reused: [MM3-####, ...]`, sorted and deduplicated, right after `escalate:`. The field is left out entirely
when nothing was reused. [C-130]
When a question is asked fresh (not reused) but an earlier run already answered the exact same question text
at an overlapping place on code that's since changed, the response's `notes:` says so — `stale: MM3-#### answered
"<question, clipped>" on older code (p <its P(yes)>)` — up to 3 such notes, one per older run. This is scoped to
`class` only for now. [C-160]

---

## replay

**MAK³ × Prove: did the change work?** It replays a parent run's questions (the yardstick) on two states. [C-060]

**When:** after a fix, a refactor, a dependency bump, or to compare fix A with fix B. [C-061]

```yaml
mak:
  goal: The injection fix works
  parent: MM3-0042                  # replay this run's categories and questions
  compare: {before: main, after: HEAD}
  expect: [injection]              # required: which of the parent's concerns this replay should fix, or "none"
mdl:
  why: validate
  area: data
```

```yaml
mak:
  id: MM3-0051
  gate: fail                       # every category passes on "after", and nothing regressed
  goal: {gate: pass, p: 0.84}
  injection: {before: fail, after: pass, fixed: [1, 2, 3], probes: 3/3 fixed}
  access:    {before: fail, after: fail, still: [4, 5], probes: 0/2 fixed}
  leaks:     {before: unsure, after: pass, fixed: [7], probes: 1/1 fixed}
  expected: {fixed: [injection], still: [access]}
  regressed: []
mdl: {recorded: [why, area, parent]}
next: mm3 template drill --parent MM3-0051 --from access
notes: ["2 states · budget: $4.96 left of $5.00 · 495 of 500 runs left"]
```

`replay` never takes `ask`: it replays the parent's categories and questions; new questions go through
`class`. [C-062]
`replay`'s parent may be a one-subject run (class, replay, or drill's one-subject form) — the shape this
section describes — or a sweep run (scan, loop, or drill's sweep form), replayed differently: see "A sweep
parent" below. [C-063]
A category's response shows `before`/`after` gates, `fixed` (questions failing or unsure before that pass
after) and `still` (ones that don't), and a `probes: <fixed>/<total> fixed` count naming how many of the
category's own questions cleared out of how many it has; anything in the run-wide `regressed` list (passing
before, not after now) can alone fail the gate even when every `after` category passes on its own. [C-064] [C-211]
`expect:` is required: either 1–9 concern names (lowercase kebab-case, each ≤ 20 characters and unique), or the
literal word `none` (an empty list `[]` is read as `none`) — the agent's own prediction of which of the parent's concerns this replay should turn to
pass (`none`: predicts no flips at all). Each named concern must be a real concerns-section category of the
parent; naming a decisions category or an unknown name is a stop. The response's `expected:` grades the
prediction against what actually happened, per named concern: `fixed` (missed or unsure before, clears now) or
`still` (missed or unsure before, still doesn't) — a concern already passing before predicts nothing meaningful
either way, so it's left out of both lists. Any concerns-section category that flips (`before` != `after`)
WITHOUT being named in `expect:` (every flipped concern, when `expect: none`) is reported separately, in
`unexpected:` — this is what replaces having to name every affected concern up front just to avoid a false
"prediction missed." [C-210]
On a category's own `fixed`, record `outcome held` on the parent; on `still`, keep working; anything in
`regressed`, revert or drill into it. [C-065]

```yaml
mak:
  id: MM3-0052
  gate: fail                       # access regressed even though it (and the goal) grade pass on their own
  goal: {gate: pass, p: 0.81}
  injection: {before: fail, after: pass, fixed: [1, 2, 3], probes: 3/3 fixed}
  access:    {before: pass, after: pass, probes: 0/2 fixed}
  leaks:     {before: unsure, after: pass, fixed: [7], probes: 1/1 fixed}
  expected: {fixed: [injection], still: []}
  unexpected: [leaks]              # leaks flipped too, but wasn't named in expect: [injection]
  regressed: [5]
mdl: {recorded: [why, area, parent]}
next: mm3 template drill --parent MM3-0052 --from access
notes: ["2 states · budget: $4.96 left of $5.00 · 495 of 500 runs left"]
```

A non-empty `regressed` takes priority over the usual "which category matches the overall gate?" search:
`next:` names the category the first regressed question belongs to, even when every `after` category (and the
goal) grades pass on its own — the case above, where nothing but `regressed` explains the `fail`. [C-091]
Called as `mm3 replay --parent MM3-#### --compare <before>..<after>` (no request file), the goal asked is
the parent run's own goal, not a fixed placeholder. [C-066]
The plan is for whether the yardstick predicted correctly to feed a ranking: a category that said `fail`
and was later `fixed` and proven would count as a hit. **Not shipped yet**: there is no hit count anywhere
in the ledger record (`ContractRun` carries no field for it), and recording a fix's outcome as `held`
changes nothing about what `view` shows for that category afterward — the same gap as `view`'s own missing
`best` field (above). [C-067]
`replay` reads git in the repo that actually contains each compared file — its own nearest `git rev-parse
--show-toplevel`, not only the MM3 project root — so a file whose own repo is nested one level down (a
monorepo package, a vendored project) is no longer invisible to it. [C-147]
Like `class`, `replay` names which prior runs its answers came from (`reused: [ids]`) when anything was
reused, and its `--dry-run` predicts that reuse the same way `class`'s does. [C-152]

**A sweep parent** (scan, loop, or drill's own sweep form — plan 2c C2): `replay` re-runs the parent's own
sweep (`over:` and the `ask:` layers it recorded) twice, once per ref, over the SAME two `compare:` states as a
one-subject parent — a ref-aware resolver reads git (or the working tree, for `worktree`) instead of always
reading the current files, the way scan/drill's own resolver does. An unchanged unit's text is identical at
both refs, so it reuses for free exactly like an unchanged scan/drill item always does — often straight from
the parent's own original run, not just between this replay's own two calls. Only a drill sweep CONTINUATION
(an `over:` whose first layer is the literal `each`, anchored on a root item stored only in the grandparent
run) is refused: replaying it would need to rebuild that root, which this run has no way to do; a scan's or
loop's own self-contained `over:` replays fine. [C-216]

```yaml
mak:
  id: MM3-0099
  gate: fail                        # src/a.ts regressed on question 3
  goal: {gate: fail, p: 0.05}
  items:
    src/a.ts: {before: fail, after: fail, fixed: [1], still: [2], probes: 1/2 fixed}
  passing: 1                        # src/b.ts (unchanged, always passing) says nothing new, so it's left out of items:
  expected: {fixed: [], still: [injection]}
  regressed: [src/a.ts#3]
mdl: {recorded: [parent]}
next: mm3 template drill --parent MM3-0099 --from src/a.ts
notes: ["reused: MM3-0042 (0d, 1 commit), 2 refs · 2 calls · 11 questions · budget: $4.96 left of $5.00 · 495 of 500 runs left"]
```

The response is item-shaped, not category-shaped: `items:` holds one entry per item whose own `before`/`after`
wasn't a clean pass at both states — the same `{before, after, fixed, still, probes}` shape a one-subject
category gets, just keyed by item id (an item that never changed and was already passing says nothing new, so
it's left out, the same way scan's own `failing:` only lists what needs attention). `regressed` is `<item
id>#<question number>` (not a bare number): several items can share the same question numbers, so the item id
disambiguates which one actually regressed; a non-empty `regressed` fails the gate and wins `next:`'s own
"which item is to blame?" search, exactly as it does for a one-subject parent. `expect:`/`expected:`/
`unexpected:` name concern-section category names, same as a one-subject parent, but graded in AGGREGATE across
every item that has that category (a sweep's own layers can repeat the same category at several depths): a
concern counts as `fixed` only when EVERY one of its not-passing-before occurrences is passing after (a partial
fix anywhere still reads as `still`), and `unexpected` fires when any unnamed concern flips at all, on any
item. Every question id this run stores is item-qualified (`before:<item id>#<n>`, `before:goal`), since a
sweep's own item ids repeat the same question numbers per item — unlike a one-subject parent's own bare
`before:<n>`. [C-217]

---

## scan

**MDL³ × Know: where in this code should we look?** A sweep across code, read by us. [C-068]

**When:** a new codebase, a release check, a PR's changed files, or a vague bug with no location yet. [C-069]

```yaml
mak:
  goal: Handlers don't trust request input
  depth: quick                     # function is the finest layer: exactly 3 concerns categories, at most 10 items
  over:
    file: src/handlers/*.ts        # we expand the pattern and read each file
    function: each                 # we split each file into its functions
  ask:
    function:
      concerns:
        injection:
          pass: no
          1: Does {function} put request text straight into a query?
          2: Is the query built by string concatenation instead of a bound parameter?
          3: Does {function} run the query with db.query on that string?
        access:
          pass: no
          4: Does {function} return a record without checking its owner?
          5: Is the caller's id compared to the record's owner id?
          6: Could {function} be called without any permission check?
        output:
          pass: no
          7: Does {function} send back a raw database error message?
          8: Does {function} log the full request body?
          9: Does {function}'s response include fields the caller didn't ask for?
      decisions:
        severity:
          pass: [none, low]
          10:
            scale: How severe is the worst issue in {function}?
            levels: [none, low, medium, high, critical]
        route:
          pass: [ship]
          11:
            choice: Where should {function} go?
            options: [ship, fix, block]
mdl:
  why: find
  area: api
```

```yaml
mak:
  id: MM3-0060
  gate: fail
  goal: {gate: fail, p: 0.21}
  scanned: {file: 6, function: 23}
  failing:                         # worst first; only questions that didn't clear the bar
    src/handlers/user.ts/findUser:    {injection: fail, access: fail, 1: 0.93, 4: 0.88}
    src/handlers/order.ts/getOrder:   {access: fail, 4: 0.79}
    src/handlers/order.ts/listOrders: {access: unsure, 4: 0.52}
  passing: 20                      # counted, not listed
  reused: 14                       # unchanged functions answered from the ledger for free
mdl: {recorded: [why, area]}
next: mm3 template drill --parent MM3-0060 --from src/handlers/user.ts/findUser
notes: ["1 call (the function layer; files are read, not asked) · budget: $4.96 left of $5.00 · 495 of 500 runs left"]
```

scan's response shows `failing:` worst first — most failing categories, then most unsure, then written order
— with `passing:` and `reused:` as counts (never lists), plus `scanned: {layer: count, ...}`. [C-070]
`next:` drills into the worst item, or says the goal alone missed when nothing failed, or that every item was
skipped past the depth cap when nothing was graded at all. [C-071]
An unchanged function on a later scan is answered from the ledger for free: a second scan of unchanged code
costs nothing. [C-072]
Reused answers are stored per function, not per file or per run, so a later scan (or a drill down from it)
pays only for what actually changed; there is no separate folder- or category-level pattern query yet — a
sweep run's own top-level `categories` stays empty, and only its per-item grading (read back by that item's
own id) carries the record. [C-073]
`function: each` (and, downstream, `call: each`) finds a named function or method at any nesting depth — a
route handler registered from inside a setup function, or a helper closed over by an IIFE — not only
top-level declarations; an anonymous function or arrow passed inline with no name of its own is still not its
own unit. [C-141]
`failing:` ranks by severity first when any failing item carries a `scale` question (its worst level × p),
ahead of the existing fail/unsure category counts and written order — a "high" answer at high confidence no
longer outranks a "critical" one just by category-fail count. Unchanged for a sweep with no scale question,
and for `loop`. [C-145]
A scan adds a note (never a stop) naming any common entrypoint or config file (`server.js`, `app.js`,
`index.js`, `main.js`, `config/**` — never `.env*`, which would invite sending secrets to the classifier)
that exists in the project but sits outside every `over:` pattern — a scan only ever reads what `over:`
names. [C-146]
The note names at most 3 missed paths, then `… N more` — a `config/**` glob can match many files, and
listing every one buries the point. [C-168]
A fully-reused scan is never blocked by an already-reached budget cap (see the dry-run/reuse rules above). [C-150]

---

## drill

**MDL³ × Judge: why did this one thing fail?** It goes down from one item in a parent run. [C-074]

**When:** after a `fail` or `unsure` from class, scan, loop or replay. [C-075]

```yaml
mak:
  goal: Find exactly where request text reaches the query
  parent: MM3-0060
  from: src/handlers/user.ts/findUser    # an item id or a category from the parent run
  depth: quick                     # call is the finest (and only) layer here: exactly 3 concerns categories
  over:
    call: each                     # the next layer down: each call inside findUser
  ask:
    call:
      concerns:
        reach:
          pass: no
          1: Does {call} pass request text into SQL?
          2: Is {call}'s argument built by string concatenation?
          3: Is {call} reachable from an unauthenticated route?
        guard:
          pass: yes
          4: Is {call}'s argument parsed to a number before use?
          5: Is {call}'s argument bound as a parameter instead of concatenated?
          6: Is {call}'s argument validated against an allow-list?
        sink:
          pass: no
          7: Does {call} hit db.query directly?
          8: Does {call} run inside a transaction with no timeout?
          9: Does {call}'s result get returned to the caller unfiltered?
      decisions:
        severity:
          pass: [none, low]
          10:
            scale: How severe is {call}'s worst issue?
            levels: [none, low, medium, high, critical]
        route:
          pass: [ship]
          11:
            choice: What should happen to {call} next?
            options: [ship, fix, block]
mdl:
  why: debug
  area: data
```

```yaml
mak:
  id: MM3-0061
  gate: fail
  goal: {gate: pass, p: 0.77}
  failing:
    src/handlers/user.ts/findUser/db.query: {reach: fail, sink: fail, 1: 0.96, 2: 0.94, 7: 0.91}
  passing: 3
mdl: {recorded: [why, area]}
next: fix it, then run this drill again (unchanged items are reused, so it is nearly free)
notes: ["1 call · budget: $4.96 left of $5.00 · 495 of 500 runs left"]
```

On a sweep parent (scan, loop, or an earlier sweep drill), `from:` names an item, and drill needs `over:` for
the next layer down under it; the response is shaped like scan's, worst first. [C-076]
On a one-subject parent (class, replay, or an earlier one-subject drill), `from:` names a category instead;
new, narrower questions go under `ask:` inside it, and the response has the same shape as class's, including
consensus and escalate. [C-077]
drill's own `next:` never points at drilling further: on a one-subject parent it says to fix it, then
`replay` against the parent; on a sweep parent it says to fix it and run this same drill again, since
unchanged items are reused, so it is nearly free. [C-078]
The ledger learns which narrower questions separate the real cause from the noise; they become the drill pattern
for that category. [C-079]
`mm3 template drill --parent <id> --from <x>` picks the sample matching that id's own shape when the
ledger has it: a sweep parent's sample keeps `over:`, a one-subject parent's has no `over:` and `from:` names
a category instead. No project, or an id the ledger doesn't have, prints the sweep sample, same as always. [C-090]
`drill` on a sweep item that has code, given no `over:`, is a flat one-subject proof of just that one item:
fresh `ask:` categories answered against the item's own lines, in the same shape as a one-subject parent's
drill. An idea item (loop's own kind, with no code) still stops, naming the fix. Like `class`, it names which
prior run its answers came from when anything was reused, its `--dry-run` predicts that reuse, and it's never
blocked by an already-reached budget cap when fully reused. [C-144] [C-149]

---

## loop

**MDL³ × Prove: does this idea hold up?** A sweep across layers of ideas, written by the agent. [C-080]

**When:** a design, a plan or a feature request before any code; comparing two designs. [C-081]

```yaml
mak:
  goal: The checkout redesign is sound
  depth: quick                     # story is the finest layer: exactly 3 concerns categories there
  where: [src/checkout/]           # optional: the code the ideas are checked against
  over:                            # nested arrays = layers; an item's children are the next layer
    part:
      - name: gateway
        story: [guest checkout, saved cards]
      - name: payments
        story: [refunds, retries, partial capture]
      - ledger                     # an item with no children is just its name
  ask:                             # per layer; {part} and {story} are filled in per item
    part:                          # not the finest layer: thin and optional (a note, not a stop)
      concerns:
        boundaries:
          pass: yes
          1: Does {part} own one clear responsibility?
          2: Can {part} be deployed without the others?
    story:
      concerns:
        done:
          pass: yes
          3: Is "{story}" testable against {part} as written?
          4: Does "{story}" have a named owner?
          5: Is "{story}" small enough to ship on its own?
        risk:
          pass: no
          6: Does "{story}" need data {part} doesn't own?
          7: Does "{story}" depend on another part's release order?
          8: Could "{story}" fail silently in production?
        fit:
          pass: yes
          9: Does "{story}" match how {part} is meant to be used?
          10: Would "{story}" survive {part} being replaced later?
          11: Is "{story}" covered by an existing test today?
      decisions:
        risk-level:
          pass: [none, low]
          12:
            scale: How risky is "{story}"?
            levels: [none, low, medium, high, critical]
        route:
          pass: [build-now]
          13:
            choice: What should happen to "{story}" next?
            options: [build-now, rework, redesign]
mdl:
  why: validate
  area: api
```
The expansion: 3 parts + 5 stories = 8 items; `part`'s 2 written questions become 4 asked (thin, not the
finest layer), `story`'s 13 become 39, in 2 calls (one per layer).

```yaml
mak:
  id: MM3-0070
  gate: fail
  goal: {gate: pass, p: 0.74}
  failing:                         # an item fails if it or any child fails
    payments:                  {boundaries: fail, 2: 0.18}
    payments/refunds:          {done: fail, risk: fail, 3: 0.22, 6: 0.91}
    payments/partial capture:  {risk: unsure, 6: 0.48}
  passing: [gateway, gateway/guest checkout, gateway/saved cards, payments/retries, ledger]
mdl: {recorded: [why, area]}
next: mm3 template drill --parent MM3-0070 --from payments/refunds
notes: ["2 calls · 43 questions · budget: $4.96 left of $5.00 · 495 of 500 runs left"]
```

loop's response shows `failing:` and `passing:` in the order the request was written (tree order), unlike
scan's worst-first order; `passing:` is a list of item ids, not a count. [C-082]
An item fails if it or any of its children fails. [C-083]
Like scan, a loop run's own top-level `categories` stays empty; the full per-item grading (which layer
structures and questions turned up trouble) is kept in the ledger, on that run, but there is no dedicated
query yet that mines it into a pattern across runs the way class's per-category history does. [C-084]
A fully-reused loop is never blocked by an already-reached budget cap (see the dry-run/reuse rules above). [C-151]

---

## report

`mm3 report [hits|patterns|history|web|graph|problems|mdl|calls|fields]` is the one way knowledge leaves
the ledger besides a run's own response: free, read-only, never calls a provider, never writes to the ledger
(except `fields`'s own `--accept`, which writes only `.mm3/config.yaml`, never the ledger), and takes no
options beyond the view name (default `hits`) and `fields`'s own `--accept <field>`. It is not a seventh verb —
it sits outside the Know/Judge/Prove grid, reading across every place at once rather than proving one thing. It
works unchanged with no on-disk index present (the same linear-fallback engine `view` already falls back to).
[C-162]
`mm3 report hits` (or no argument) shows the newest run's own gate per place x category, worst gate first
(`fail`, then `unsure`, then `pass`), each row naming the run it came from. A one-subject run's row is marked
`stale` once the code at that place has changed since — re-derived live, on the bounded set of rows actually
shown, from the run's own recorded evidence key, never a full-ledger scan. A sweep item's row is never marked
stale (its evidence isn't reconstructed here). [C-163]
`mm3 report patterns` groups every run by its own question-set fingerprint (its categories' or layers'
names, `pass`/`need` and question text — never the evidence), showing how often each set has run, its
pass/fail/unsure split, how many distinct places it's touched, and its outcomes so far. [C-164]
`mm3 report history` merges, newest first: every `replay` run's own result against its parent, named
`fixed` or `regressed` (the same priority `replay`'s own gate uses — any regression wins over any fix; a
replay that moved nothing gets no row), with every recorded outcome. Neither is a new ledger write — both are
derived, read-side, from records the commands already wrote. [C-165]
Every view caps its rows and says plainly how many more exist (`… N more not shown`) rather than dropping them
silently, the same idiom `view` already uses — `report` takes no option to raise it. [C-166]
An unrecognized view name is a clean stop naming the four real ones. [C-167]
`mm3 report web` writes one self-contained, read-only viewer, `.mm3/viewer.html`, holding the
ledger's own place x concern consensus (STRONG when independent runs agree on a gate, CONFLICT when they don't,
SINGLE for one run alone — with a same-checklist flag on a CONFLICT, since a reused category name can carry a
different question set across runs), a files x concerns heat map, and a session summary (runs, paid calls,
spend, distinct actors, the date range, fixes that held, regressions, the latest findings, and outcomes). Every
value reaches the page as JSON inside a `<script type="application/json">` block, escaped against `<`, `>`,
`&`, U+2028 and U+2029, and every piece of that data is written to the page with `textContent`/`className`/
`title` — never `innerHTML` — so a question or a goal containing `</script>` can't break out of it. It never
calls a provider and never writes to the ledger itself (it reads the whole log directly, never the id index);
it tries to open the file in the user's browser (`xdg-open`, `open`, or `cmd /c start`, depending on the OS) and
always prints the file's path either way, whether or not that succeeds. [C-204]
`mm3 report graph <kind>:<label>` shows a small neighborhood (depth 2) around one graph-tier node — nodes
and edges as `kind:label --predicate--> kind:label` lines. With no target it names how to give one
(`mm3 report graph <kind>:<label>`, e.g. `category:injection`) rather than dumping the whole graph, and an
unknown target is a plain "not found," never an empty crash. [C-219]
Each edge line's own predicate carries the run→category and category→place relationship the RIGHT way round:
`run --checks--> category` (the run checked this category) and, separately, `category --judged <gate> (p
<score>)--> place` (that category's own verdict on that place — pass/fail/unsure scored 1/0/0.5). Every edge
shows its own provenance (`extracted`, `declared` or `inferred`) and the run(s) that witnessed it; the same
(subject, predicate, object, score) witnessed by more than one run folds into one line with a `×N` count and
the run list (or a sorted first..last range once there are more than a few), never one line per witnessing run.
[C-224]
`mm3 report problems` ranks every family x place pair by gate counts (fail, then unsure, then pass), worst
first — the ranked, agent-facing knowledge pull an agent can act on directly, capped and counted like every
other view. [C-220]
`mm3 report mdl` lists every run's own mdl fields (why/area/stage/change/risk/blast/problem), newest
first. [C-221]
`mm3 report calls` rolls up telemetry by day, verb, model and source (calls, tokens, cost, amount saved by
reuse), over its own default window (the last 30 days) unless the graph tier is asked otherwise. A run with no
recorded `telemetry` at all (a pre-plan-2c-B2 ledger line) still shows up, from its own aggregate
`calls`/`costUsd`/`adapter`/`model`, marked `(none)` in place of a real source — an old ledger's calls and cost
are never silently dropped from this view. `graph`, `problems`, `mdl` and `calls` all refresh the graph tier
(ledger/graph.ts) before reading — readers refresh, the paid path never does — and report a plain message
naming `mm3 doctor`, never a stack trace, when the graph tier needs `node:sqlite` and it isn't available.
[C-222]
`mm3 report fields` lists every `mdl.extras` key no run's project has declared yet (not a base mdl field,
not already in `config.mdl`), with its sample values and a suggested type: `closed` (≤8 distinct values across
≥5 runs), `pattern` (every value matches one fixed regex shape), `reference` (every value looks like a
where/route path), or "no suggestion yet" when none of those fit. `--accept <field>` re-runs the same discovery
and, when that field has a suggestion, writes it into `.mm3/config.yaml`'s `mdl:` block and prints exactly
what it wrote; naming a field that isn't undeclared, or one with no suggestion yet, is a clean stop, never a
silent no-op. [C-223]
`graph`/`problems`/`mdl`/`calls`/`fields` read the hot tier's own on-disk tables (`runs`/`categories`/`places`,
ledger/index.ts) directly, not through the reuse-safe `IndexHandle` abstraction `hits`/`patterns`/`history`
use — so each one first forces that tier to catch up or rebuild on disk (the same self-heal a paid write
already gets, just triggered from a read), before either reading it directly or refreshing the graph tier on
top of it. A missing `index.db`, or one that lags the ledger by any number of runs, is never a wrong or
incomplete answer for any of these five views — only ever, at worst, one extra catch-up's cost. [C-225]

---

## help and template

`mm3 help` (free, no project needed) prints a one-screen contract card: the six verbs, the rules that
cause most first-try rejects, and how to read a verdict. [C-113]
`mm3 help <verb>` (view, class, replay, scan, drill, loop) prints that verb's purpose, when to use it,
one annotated example, and its own sharp rules. [C-114]
`mm3 help <verb>` now opens with a first line, `Agents: mm3 agent <verb>`, ahead of its own
`## <verb>` heading — round-4 smoke testing's top finding: a cold CLI agent made zero `mm3` calls at all
because it never discovered `mm3 agent` exists. The bare CLI usage text (`mm3 --help`, a bare
`mm3`, and `mm3 <command> --help`) carries the same front door: `help/card.ts`'s exported
`agentFrontDoorLines()` returns, in order, `Agents: run "mm3 agent" first`, the existing `new here? →
mm3 init` hint for a human, this tool's own one-line pitch (`card()`'s own opening wording, factored out
rather than retyped a second time), and one purpose bullet per verb from the same shared `VERB_LINE` text
`agent`'s overview and `help`'s own card already render — `cli.ts` splices this ahead of its usage block rather
than hand-typing a third copy. [C-191]
Per-verb sharp rules `help` carries: `drill` says to follow `next:` rather than hand-authoring parent/from;
`replay` says the files must be committed at the ref it names; `scan` says a `scale` question ranks findings
by severity, worst first, and to scan by file when the file is the unit that matters; `loop` says a sub-layer
is a sibling key under `over:`, names are ≤ 20 characters with no `/`, and every question under a layer is
asked of every item at that layer. [C-115]
`mm3 help <topic>` covers `authoring`, `verdict`, `mdl`, `reuse` and `probe` — cross-cutting rules that
don't belong to one verb. [C-116]
`mm3 help mdl` lists every catalog field (`why`, `area`, `stage`, `change`, `risk`, `problem`, `uses`,
`touches`, `blast`) with its closed values (where it has any) and what each is for, notes that every closed
field also accepts `unknown` and that any other lower-kebab key (≤ 20 characters) is recorded as-is, and points
at `mm3 agent mdl` for this project's exact allowed values and the full C4 legend. [C-117]
An unknown `help` target is a clean stop naming every real verb and topic. [C-118]
`mm3 help probe` is its own recognized topic: a valid probe, the shape of a well-formed MM3 question —
one narrow judgment per question, self-contained wording (a question's number is a label for the response
only), answerable from `where:` (naming the file in backticks when there's more than one), one polarity per
category, concrete scale levels, a "none fits" choice option, the goal phrased as the safe state rather than
the vulnerability, and the visible-scope probe ("Can this be answered from the code shown?") as a recommended
extra question — each rule cited to its own TypeSafe documentation page. It's guidance labelled as best
practice for a higher-quality answer, not new validator enforcement — nothing here is checked by the schema or
cross-validator. [C-180]
`mm3 agent probe` renders the same 8 rules bare, no citations, no prose, from the one shared list `help
probe` renders with citations, so the two views can't drift apart; `mm3 agent` with no verb points
explicitly at `mm3 agent probe`. [C-181]
The 160-character cap on a single question (or the goal) line — previously a bare literal inside
`schema-check.ts`'s `lineProblem` — is now the named, exported constant `MAX_QUESTION_CHARS`, documented as a
shared `rules.ts` entry reaching `mm3 help`'s one-screen card, `help authoring`, every verb that accepts
`ask:` (`class`, `scan`, `drill`, `loop`, `view` — checked against the schema envelope; `replay` never accepts
`ask:` at all), and both `help probe` and `agent probe`. This closes a round-4 finding: a cold agent hit `✖
question 1: is longer than 160 characters` with zero prior warning in `agent view` or `agent probe`. Because the
cap is MM3's own hard validator rule rather than TypeSafe's own published guidance, it lives in
`RULES`/`ruleLines`, not `PROBE_RULES` (whose cited-guidance contract is unchanged) — `probe()`/`probeCard()`
simply splice `ruleLines('probe')` in alongside it. [C-194]
`mm3 help outcome` and `mm3 help budget` are recognized targets the same way `mm3 help report`
already was — neither is a `mak:`-YAML verb (neither takes `ask:`, neither calls the classifier) — each with
its own purpose, example, sharp rules and a good/bad pair grounded in a real stop: `outcome`'s self-held
restriction and its lack of a `--note` flag, `budget`'s bare `set` with no flags. `mm3 agent outcome`,
`mm3 agent budget` and `mm3 agent report` are the same three targets' bare terse cards — no
citations, no headings, hand-written rather than sharing a data structure with `help`'s prose (an agent card is
why-only; there's no rule prose to reuse). Before this, `outcome` appeared in neither `help` nor `agent` at
all. An unknown `help`/`agent` target now names all three extras (`report`, `outcome`, `budget`) alongside
every verb and topic. [C-182]
A new `agent verdict` card (`tool: verdict`) and a refactored `help verdict` render the same response-vocabulary
facts from one shared list, `rules.ts`'s `VERDICT_FACTS`: `need:`'s all/most/any bar, the goal-and-every-category
gate rule, `consensus` (STRONG/SPLIT/WEAK) and which verbs compute it, `escalate`'s triggers, what a probability
near 0.50 landing in `unsure` means, `replay`'s per-category fixed/still/regressed grade, `reused: [MM3-####]`'s
meaning, `mm3 report hits`'s `stale` flag, and the three exit codes. `help verdict` keeps its own prose
framing around the list; `agent verdict` renders it bare, matching every other agent card's why-only shape and
key order. `agent`'s overview gains a third `run:` line, `mm3 agent verdict — before reading a response:
how to read it`, alongside its existing pointers at `<verb|tool>` and `probe`. This closes a round-4 finding:
response-side vocabulary was previously documented only in `help report`'s own prose, and only after a response
had already used it once. [C-196]
Every fact the validator enforces that `help` also states (depth counts, the `where` limit, the pass bar, and
the `mdl` catalog lists) is built from the same constants the schema check and validator use, and a test
asserts each one appears verbatim in the `help` output it names — so the validator and `help` can't quietly
drift apart. [C-119]

`mm3 template <verb> --from <request.yaml>` — with no `--parent` — names a request YAML file rather than
a drill item or category: its `ask:`/`over:` (the frozen question set) is printed back unchanged, and
`--where`/`--goal` overlay a new subject on top of it. Neither the file's shape nor its content is
validated — template only prints, like every other path. [C-111]
`--where`/`--goal` are refused unless paired with `--from`, and refused together with `--parent` (they overlay
a checklist read from a file, not a drill item/category lookup). [C-112]
`mm3 template <verb> --from MM3-####` prints that run's own request straight from the ledger — free,
read-only, no spend, same discipline as every other `template` path (it only prints; nothing here is
validated). The `MM3-####` shape is checked before the file-path branch (unambiguous, and a typo'd id would
otherwise surface a confusing "file not found" instead of "not in the ledger"). An id not in the ledger, or one
that predates the YAML contract (a Plan 1 run, no `v: 2`), is a clean stop naming the problem, not a crash. With
no project reachable, the lookup itself is a clean stop (a run-id lookup has nothing to search). `--where`/
`--goal` overlay on top of a ledger-fetched request the same way they already do for a file-based `--from`.
[C-201]
The `--from MM3-####` rebuild is faithful to the run's own request for every verb except `replay`: a `replay`
run's stored record also carries its *parent's* `where` and `ask.categories` (kept there only so it can grade
before/after answers against the same categories — never because the original replay request carried them;
`replay`'s own `NEVER` list forbids `ask`/`over`/`from`/`where`/`depth` outright). `--from MM3-####` on a replay
run therefore reprints only `goal`/`parent`/`compare` (plus `verb`), never the borrowed `where`/`ask`, so the
printed request stays a schema-valid `replay` request. Every other verb (`class`/`scan`/`loop`/`drill`) stores
exactly its own request's fields on its own run, so the rebuild for those is a direct, unqualified copy. [C-202]
`mm3 help report` is its own recognized target, not one of the six verbs (`report` is outside the 2x3
Know/Judge/Prove grid) and not a cross-cutting topic: purpose, an example and its own sharp rules, the same
shape as `help <verb>`. [C-161]
`mm3 help class`, `mm3 help scan` and `mm3 help authoring` each carry a "Good / bad" section: a
bad snippet, a good snippet, and one line of why, for the patterns that cause a first-try reject in practice
(a whole file in `where:` instead of a range; a question about code that isn't in `where:`; several `where:`
entries with no file named in the question; `scan` asking `{function}` about something outside it). [C-172]
`mm3 help view`/`mm3 agent view` and `mm3 help loop`/`mm3 agent loop` each carry their own
"Good / bad" section too (previously neither verb had one): `view` without `where:` (nothing to check reuse
against) and `view` with `over:` present (it checks one subject, never a sweep) both reject outright at the
schema/cross validator, as does `loop` with a code-glob `over.file` layer (loop sweeps written ideas, not
files on disk — that's `scan`'s job). [C-183]
The oversized-file good/bad pair's terse `why` (shown in `agent class`) reads "Big whole files refused —
name the range", matching the real behavior since e6b7d78 (a stop, not a silent cut). [C-184]

Each of the six verb templates (`skills/mm3/templates/{view,class,replay,scan,drill,loop}.yaml`) shows
every `mak.*` field that verb's own schema and cross-validator allow it to carry — required fields with a
live value, optional fields either live or as a commented-out example — each marked `# required` or
`# optional` in a trailing comment, and its `mdl:` block names every catalog key (`why`, `area`, `stage`,
`change`, `risk`, `parent`, `problem`, `uses`, `touches`, `blast`); a test checks every template against the
same rule the validator itself enforces, so template and schema can't quietly drift apart. The category-level schema fields that don't vary by verb —
`need:` and `tags:`, alongside `pass:` and the three question kinds (yes/no, `scale`, `choice`) — are
demonstrated once, in `class.yaml`, rather than repeated in all six. [C-174] [C-175]
`class.yaml` and `scan.yaml` show the visible-scope probe question ("Can this be answered from the code
shown?") as a commented-out, optional recommended addition, matching the templates' existing
optional-field comment style. [C-185]

## agent

`mm3 agent [verb]` (free, no project needed, never spends or writes) is `help`'s terse, agent-facing twin:
the enforced rules for that verb (the same list `help <verb>` states) and its "Good / bad" pairs, why-only, in
at most 8 words — no prose, no headings beyond a bare label. `mm3 agent` alone gives the verb list, the
universal rules, and a pointer to `mm3 agent probe`. Beyond the six verbs, `agent` also recognizes
`probe`, `outcome`, `budget` and `report` — the same non-verb targets `help` does — plus `template`, which
`help` does not; each its own bare card, free, read-only. Every request-validation stop's pointer (`→ see:
mm3 agent <verb>`, C-153) names this, not `help` — a stop is read by the agent that sent the request.
[C-173]

`mm3 agent mdl` is the mdl catalog's own legend card: every field, its closed values (plus the
always-legal `unknown`), the note that any other lower-kebab key is recorded as-is, the C4 model's five levels
(person/system/container/component/code, each nested inside the one above), how to write a chain flat
(`parent/child` for containment, ` -> ` for uses, a trailing `?` for something guessed or not built yet), the
chain grammar itself, and one worked example. Unlike every other `agent` card, it isn't shaped
identifier/`rules:`/`patterns:`/`run:` — the field table and the architecture teaching don't fit that mold —
so it's the one deliberate exception to `agent`'s otherwise-fixed card shape (C-187). It's generated from the
same built-in field table the schema check and cross-validator check against, so it can't state a value the
request validator would then reject.

`mm3 agent` with no target also prints a `tools:` section, right after the verb list — the other real
commands a cold agent needs before writing a request; setup-only commands (`init`, `uninstall`, `mcp`,
`doctor`) are deliberately left off. `mm3 agent template` is a new bare card, the same shape as
`outcome`/`budget`/`report`. Every card `agent` prints — the overview and each verb/tool — is assembled in one
fixed key order: its identifier line(s) first (`verb:`/`verbs:` for a verb, `tool:`/`tools:` for everything
else, including `probe`), then `rules:`, then `patterns:` only when that target has any, then `run:` only when
it points further — a non-verb card's identifier line now reads `tool: <name>`, not the former `target: <name>`,
so it matches a verb card's own `verb: <name>` line for line. [C-187]

`mm3 agent`'s overview states one more rule, beyond the shared `RULES` list: `where:` resolves against the
MCP `project` argument or the CLI's `MM3_HOME`, never the agent's own session cwd, naming both surfaces.
This is a runtime/environment fact rather than a request-schema one, so it's hand-written once as `agent.ts`'s
own constant rather than forced into `rules.ts` (built only from `schema-check.ts`/`validate.ts` constants), and
it appears only in `agent`'s card, not `help`'s — an agent, not a human reading `help`, is the one that actually
passes `project` or sets `MM3_HOME`. Round-4 finding: an agent had to fail once, `✖ mak.where: cannot read
"app/routes/contributions.js"`, to learn this the hard way. [C-195]

Every `agent <verb>` card's `rules:` list also carries that verb's own sharp-rule prose (`help/verbs.ts`'s
`SHARP`, the same bullets `help <verb>` already states), spliced in ahead of the shared `ruleLines(verb)`
entries. This closes a round-4 finding: `agent drill` and `agent replay` — the two highest-stakes verbs, isolate
a finding and prove a fix — rendered an empty `rules:` section, since neither `rules.ts`'s `RULES` nor
`patterns.ts` had any entries tagged for either verb, even though `help drill`/`help replay` already had real
prose. The splice applies to all six verbs, not just drill/replay, so a verb card can't fall back to empty
again as sharp rules are added elsewhere. `patterns.ts` also gained one good/bad pair each for `drill` (a bad
request missing `from:`) and `replay` (a bad request that includes `ask:`), both genuinely catchable outright
by the real cross-validator (drill's trips its NEEDS check; replay's trips its NEVER check, since `replay` only
ever replays a parent run's own questions) rather than assumed. [C-192] [C-193]

The Claude Code skill's own "Run this first" guidance (`skills/mm3/SKILL.md`, carried verbatim into
`AGENTS.md`'s "Using MM3" section and into `GEMINI.md`) sends a cold agent to `mm3 agent` (no verb)
first — it names every command, including `report`/`outcome`/`budget`/`template`, in one card — before
`mm3 agent <command>` on whichever one it's about to use, ahead of writing any request. [C-188]

The `mm3 agent` overview also ties the release-comparison goal to `replay` — its `replay:` bullet reads
"re-check a run's questions across two git refs: after a fix, or what changed between releases or commits", and
a `rules:` line says a question about what changed or drifted between releases or commits is answered by
replaying a prior run with `compare: {before: <ref>, after: <ref>}` (with no prior run, one `class` or `scan` at
one ref first), and that `git diff` is not an mm3 check — and it gives the chain for an open goal as one line:
view (free reuse) → scan (find where) → drill (go deeper on a flagged item, following `next:`) → loop (check the
design) → replay (after a change). [C-230]

Its universal rules also carry the evidence discipline: every number or claim an agent reports comes from an mm3
answer (cited by its id) or is labelled its own estimate; a check done without mm3 (`git diff`, reading code to
answer a question) is a workaround, said so and never reported as "none"; and the budget note is headroom, not a
limit — stop only at `⚠` or exit 3, then tell the owner. [C-231]

`mm3 agent` with no target lists one atomic purpose line under each verb and tool, not just its name —
`verbs (pick by goal):` followed by `- view: free; what's already known, before any paid call`, one such
bullet per verb, then a `tools:` section shaped the same way — so an agent holding a goal ("is this handler
safe to merge?") rather than a verb name can map straight to the right one; the closing `run:` lines say what
each next step is *for* too (`mm3 agent <verb|tool> — before writing that request`,
`mm3 agent probe — before writing questions: how to phrase one`), rather than just naming it. These
purpose lines are never a second, hand-typed copy: verbs' come from `help/verbs.ts`'s `VERB_LINE`, and the four
tools' from `help/report.ts`'s `TOOL_LINE` — the same shared constants `mm3 help`'s own one-screen card
(`help/card.ts`) renders too (its "Pick your verb" bullets and its "## Tools" section), so `help` and `agent`
can't state a different purpose for the same command. The card's `rules:` section itself also dropped the
`P(yes)` notation from the pass-bar rule (`pass: yes clears at >= 0.70; pass: no clears at <= 0.30; in between
is unsure`) — the same simplification for both `help` and `agent`, since it's one shared rule (`rules.ts`).
[C-189]

---

## Setup, keys and the MCP tool

- `mak.verb` is optional. The tool name wins, and a mismatch is sent back. [C-085]
- `depth` counts `concerns:` categories only (exactly 3k of them); `decisions:` questions never count toward
  it. [C-086]
- The ledger stores a category's `section` and `family`/`familySource` alongside its usual fields, the run's
  git sha (`commit`, or `null` when it can't be resolved) at the time it ran, and `where` for every verb (a
  sweep derives it from its items' own code paths). `commit` is resolved in the git repo that actually contains
  the run's own `where` files — not necessarily the MM3 project root — falling back to the root's own repo
  only when a verb records no `where` at all (a sweep like `loop`). `replay` additionally stores `expect` (the
  agent's own prediction, array or `"none"`) and `commits: {before, after}`, the before/after refs' own
  resolved shas — distinct from `commit`, which for `replay` is specifically the `after` ref's sha, since a
  replay's two compared states don't otherwise reduce to one single "commit this run is at" the way
  `class`/`scan`/`drill`/`loop` do. None of this changes an answer key or a pattern fingerprint — the same
  question on the same evidence still reuses for free regardless of which family tag or commit sha it was asked
  under. [C-213] A `view` request-mode check (the free draft-against-the-ledger lookup shown above) is itself
  logged too, as a free record that never takes a run number and never counts toward the budget.
- Nested items use `- name: <item>` plus child layers beside it, which is what agents write naturally.
  Different items may have different child layers. [C-087]
- `mm3 --version` and `mm3 -v` print the installed package's version, one line, exit 0 — free, no
  project needed, no Node-version gate (same free standing as the bare `--help`/`-h`). [C-178]
- `mm3 <command> --help` and `mm3 <command> -h` work for every command, exit 0, never reaching that
  command's own flag parser (previously an unknown-flag stop for every command but the bare top level — e.g.
  `mm3 doctor --help` used to fail). For the six verbs it prints that verb's usage line plus `→ see:
  mm3 help <verb> · mm3 agent <verb>`; every other command prints just its usage line, since none of
  those has a deeper per-command help page today. Free even on too old a Node, the same as the bare
  `--help`/`-h`. [C-179]
- `--dry-run` (class, replay, scan, drill, loop) reports the calls and question count with no call and no
  spend, as `plan: {calls, questions, ...}` followed by `notes: ["dry run: no call, no spend"]`. [C-088]
- `--dry-run` resolves reuse first and predicts it: `calls`/`questions` count only what would still need
  asking, and `plan.reused` is how many of the request's questions (or, for a sweep, items) would come from
  the ledger for free — the same prediction every verb's real run would make. `dryRunText`'s notes always
  start with `"dry run: no call, no spend"`; a verb may append further notes after it (never before, never in
  place of it) — e.g. a budget-cap warning when the request would still need to call the classifier and the
  cap is already reached: `"would be blocked: the budget cap is already reached"`, without the dry run itself
  failing or spending anything. [C-131] [C-134]
- `--dry-run`'s notes also carry up to 3 `probe:`-prefixed warnings for mechanically-checkable authoring issues
  in the request's own `ask:` questions — never a new stop, never a new validator rule: a question that reads as
  two joined into one (two `?` in one line, or the literal `" and "` between clauses), and a backticked file
  path named in a question that isn't in the request's own `where:` (skipped for a request with no `where:` at
  all — `scan`/`drill`/`loop` legitimately have none). A category mixing yes/no polarity words is deliberately
  not checked here — not mechanically checkable, left to `mm3 agent probe`'s own prose rule — and neither is
  a question over 160 characters, since the schema already stops that outright before a request can ever reach
  `--dry-run`. More than 3 warnings still shows only 3, plus one line naming how many more, the same overflow
  shape used for more than 5 request stops. `replay` carries no `ask:` of its own (it replays its parent's
  frozen questions), so it has nothing to check. [C-198]
- A run whose every answer is reused from prior runs is never blocked by an already-reached budget cap, on
  any verb: the cap is checked only when the run would actually need to call the classifier — reuse only
  skips the *spend* gate, never the *ledger* one (the ledger must still read cleanly and accept the new line
  either way). [C-136] [C-149] [C-150] [C-151] [C-152]
- `mm3 budget`'s cap-reached message points at the fix that actually applies: `mm3 budget set
  --runs <n>` when only the run cap tripped (the dollar cap has room left), `mm3 budget reset` whenever
  the dollar cap is involved, alone or together with the run cap. [C-133]
- `replay --dry-run` reads both git refs before answering: a nonexistent or mistyped `before`/`after` ref
  stops `--dry-run` the same way it stops a real run, instead of only surfacing on the paid attempt. [C-148]
- Node ≥ 22.13 is a hard requirement, not a soft preference: it's what the ledger's `node:sqlite`-backed lookup
  index runs on. The CLI's whole dispatch checks this once, up front (see C-106) — a project's own ledger
  itself (`.mm3/log.jsonl`) stays the source of truth regardless: the index is a disposable, self-healing
  cache that a missing or corrupt copy only costs a rebuild, never a wrong answer; the slower, always-correct
  linear scan it rebuilds from is still what a corrupt or mid-write `index.db` falls back to (see C-107) — but,
  as of the Node-version guard, no longer a normal, silent substitute for `node:sqlite` genuinely missing. [C-089]
- `MM3_BASE_URL` overrides the TypeSafe base URL for either route (a proxy, a self-hosted mirror, tests).
  It must parse as a URL; `https` is required, except `http` for `localhost`, `127.0.0.1` or `[::1]`. Anything
  else is a stop, `✖ MM3_BASE_URL: ... → ...`, at exit 2. [C-094]
- `mm3 doctor` is free: no classifier call, no budget touched, no ledger write. It reports the resolved
  provider, route (`direct`/`gateway`/`custom`, or `fake`/`chaos`) and base URL, whether `TYPESAFE_API_KEY` and
  `AI_GATEWAY_API_KEY` are set (never their value), the pinned model (plus the gateway wire model when
  relevant), whether a project/ledger is found, and the Node version and whether `node:sqlite` is available.
  Exit 0 when the config is usable; exit 2 with the same `✖` message a paid verb would give when it isn't (a
  floating model, a bad `MM3_BASE_URL`) — including too old a Node, which doctor still runs and reports
  rather than stopping outright (see C-106). [C-095]
- `mm3 config` is a free, read-only display of the effective config (plain `config` never writes); it is not itself
  a valid file, so its last notes point to `mm3 config --write` (no `.mm3/config.yaml` yet) or name the file path
  (one exists). `mm3 config --write` writes `.mm3/config.yaml` only when it is missing (creating `.mm3/` and its
  `.gitignore`, which un-ignores `config.yaml`): commented front matter (what the file is, how to edit it,
  precedence env > file > defaults, safe to commit), then every setting commented out under live section headers,
  top-level keys at column 0. It never overwrites: with a file present it prints a note naming the path and
  exits 0; with no project it stops with `✖ config: ... → ...` at exit 2. The starter is built from the same
  defaults table the display uses, is valid as written, and stays valid when any single value line is
  uncommented. [C-226]
- A config section with every child commented out (`sweep:`, `reuse:`, `budget:`, `mdl:`, `pricing:`, or a
  `pricing`/`mdl` entry such as `jev-1.13.0:` with nothing under it) parses as null and means "no overrides", never
  a `✖ config.<section>: is not a mapping` stop. [C-227]
- A file in `.mm3/` named like the config but not `config.yaml` (`config.yml`, `config.ymal`, `config.yaml.txt`,
  `config.json`), with no real `config.yaml` beside it, gets a note from `mm3 config` and `mm3 doctor`:
  `found .mm3/config.ymal — did you mean config.yaml? → rename it`. It is never a stop, and the misnamed file is
  never read. [C-228]
- The TypeSafe client retries a 429, a 529, or another retryable status/timeout up to 2 more times (3 attempts
  total), honouring the server's own `Retry-After` when it sends one, else exponential backoff with jitter,
  capped at 10s per wait. 401, 422 and any other non-retryable status are never retried — the first failure is
  final. [C-096]
- A key is resolved in order: `TYPESAFE_API_KEY`/`AI_GATEWAY_API_KEY` in env, then the OS keychain (macOS
  `security`, Linux `secret-tool`; Windows always falls through), then `~/.config/mm3/env` (or under
  `$XDG_CONFIG_HOME`) — a shell env file `mm3 init` writes at mode 0600 in a 0700 directory, holding only
  lines of the exact shape `export NAME='value'` for an allowlisted name (`TYPESAFE_API_KEY`,
  `AI_GATEWAY_API_KEY`, `MM3_BASE_URL`, `JEV_MODEL`, `JEV_GATEWAY_MODEL`, `MM3_PROVIDER`) plus `#`
  comments; MM3 parses this file itself and never sources or evals it, and a line it doesn't recognise is
  left untouched, not an error. The first hit wins, and its source (`env`/`keychain`/`file`) is carried
  alongside it. The resolved value never appears in any output, error, ledger line or note — the redaction list
  (`ledger/redact.ts`) also scrubs it as a literal, on top of its own secret-shaped patterns. [C-097]
- A key resolved from the OS keychain or the user file (never env) is honored the same way everywhere a
  provider is chosen or identified — not just by `mm3 doctor` and `mm3 agent`, which already looked
  past env. Every `cli.ts` call to `selectProvider` (class/scan/drill/loop, and `replay`) and to `runView`
  passes the same `resolveStoredKey(runner, platform, env)` lookup those two commands use, via one shared
  `VerbContext`/`ViewContext` field (`resolveStored`) threaded through to every verb's own `providerIdentity`
  call (the route/adapter shown in `--dry-run`'s `plan:` and recorded on the ledger run) — so a key found only
  in the keychain or `~/.config/mm3/env`, with no env var set, is never silently treated as "no key" and
  answered by the fake provider while `doctor` reports `key: yes`. An env var still wins over a stored key,
  unchanged. [C-203]
- The secret-shaped-key redaction pattern (`ledger/redact.ts`'s `KEY_VALUE`) refuses to start its value match on
  `{` or `[`: a real secret is never itself a literal YAML mapping or list, so an MM3-chosen name that
  happens to contain a secret-ish word (a sweep item or category like `issue-token`, `verify-token`,
  `set-new-password`) no longer has the immediately-following structured value swallowed as if it were the
  secret (previously `issue-token: {depends: unsure, ...}` became `issue-token: [redacted] unsure, ...}`,
  destroying the category name — data loss, not a leak, since nothing there was ever a secret). A genuinely
  secret-shaped value after the same kind of key (`api_key: sk-...`) is still redacted exactly as before.
  [C-200]
- `mm3 doctor` names where a resolved key came from (`key: yes · from OS keychain (encrypted, per user)`,
  `from user file <path> (0600, not encrypted)`, or `from env TYPESAFE_API_KEY`, with `(overrides stored)` when
  a stored key also exists but env won), or `key: no → run "mm3 init" to add one`; the env file gets its
  own warning line if its mode is looser than 0600 or it has a line mm3 ignored. It also names the CLI's
  own install (`cli: <path> · installed --<mode> ...`) and the Claude Code plugin's overall state (`plugin:
  mm3@mvp-scale · <scope> scope`, or `not installed → ...`). [C-098]
- Using MM3 is scoped per project, but Claude Code's own `/plugin install` UI (unlike `mm3 init`,
  which already defaults to `project` scope) defaults to `user` scope — so when doctor's `plugin:` line finds
  the plugin installed at `user` scope only, it appends a nudge toward switching: `mm3@mvp-scale · user
  scope (every project) → for just this one, "mm3 init --scope project"`. No nudge once `project` or
  `local` scope is present. [C-177]
- `mm3 init` sets up two things per user, shared across every project — the CLI (`--global`/`--user`/
  `--local`, offering `--user` instead of a sudo-needing global install) and the key (hidden input via
  `node:readline`, never argv; `--key-stdin` for automation, `--no-key` to skip; a sanity check on shape only —
  no live check against TypeSafe) — then, per project, the Claude Code plugin (`--claude`/`--no-claude`,
  `--scope user|project` defaulting to `project`) and the project's `.mm3/`. Run outside a git project, it
  does only the two per-user steps, then stops with one line pointing the user at cding into a project. It is
  idempotent (a re-run that finds a step already done says so and changes nothing) and interactive by default;
  `--yes` takes the default answer everywhere. Every step prints exactly one line, glyph first: `✔ done`,
  `· already`, `– skipped (why)`, or `✖ problem → fix`. [C-099]
- `mm3 init`'s final `next:` line points at `mm3 agent` — the minimum an agent needs (its enforced
  rules and good/bad patterns) before writing a first real request — rather than inviting one straight off; if
  any step above logged a `✖ problem` line, `next:` never claims the setup is usable, instead pointing back at
  the fix and at re-running `mm3 init`. [C-176]
- `mm3 uninstall` reverses init, by default acting only on the current project: the Claude Code plugin's
  project-scope install, and (asked, default **no** — it's the user's run history) that project's
  `.mm3/`. The per-user parts — the stored key and the CLI itself — are only touched with `--all`, which
  then also reaches every plugin scope found plus the `mvp-scale` marketplace and the plugin cache dir it left
  behind; the CLI step uses whichever install mode `mm3 init` recorded in
  `~/.config/mm3/install.json` (which holds no secrets), or prints the exact commands to run by hand when
  there's no record. `--yes` takes the default answer everywhere: yes for removal steps that run, no for
  `.mm3/`. `--keep-key`/`--keep-data` skip their step outright, with no question asked. [C-100]
- `.mm3/` carries its own `.gitignore` (`*`), created the first time anything writes into it — the ledger,
  the budget file, the id index, or `mm3 init`'s own explicit project step — so a project that never ran
  `init` is still covered on its very first run, not committing its run history by accident. [C-101]
- `mm3 doctor`'s `project:` line names the project root and whether the Claude Code plugin is enabled for
  it — true for a project-scope install (checked from wherever this process runs, which is how Claude Code's
  own project scope is itself resolved), for a user-scope install (it covers every project, this one included),
  and, best-effort, for a local-scope install too (`claude plugin list --json` carries no per-entry project
  path to check against, so local scope is treated the same permissive way as project scope rather than guessed
  at further) — separately from the `plugin:` line's overall install state. Using MM3 is always scoped to
  a project, so this is the answer that actually matters day to day. [C-102]
- The Claude Code plugin bundles a stdio MCP server (`mm3 mcp`, hand-rolled, no SDK dependency) with one
  tool, `mm3`, taking `{ args: string[], stdin?: string, project?: string }`. It runs exactly what
  `mm3 <args…>` would run, in-process, treating `stdin` as what real stdin would have supplied, and
  returns the same text output the CLI would print plus the exit code as `isError` (true when the exit code
  isn't 0) — there is no second contract. [C-103]
- The `mm3` tool's own description opens with a directive, not a description: "First call args:
  ["agent"] to learn the commands and rules, then args: ["agent", "<command>"] before writing a request." —
  ahead of what the tool otherwise does (runs any CLI command in the project). The description is the first,
  and sometimes only, text a cold agent reads before its first call, so it has to name `agent` itself rather
  than assume the agent already knows to ask for it. [C-186]
- Every tool call runs through the same error normalization the real CLI entrypoint uses, so a thrown
  provider, budget, ledger or usage error comes back as one clean `✖ field: problem → fix` line in the tool
  result's `isError` text — never a doubled `✖ mm3: ✖ field: ...` prefix. [C-140]
- The `project` argument, when given, runs that one call against `project` as `MM3_HOME` instead of the
  server's own working directory — for a nested project the plugin's own cwd doesn't reach. Omitted, behavior
  is unchanged. [C-142]
- A run or outcome made through the plugin is recorded under `claude`, not the literal `agent`, when
  `MM3_ACTOR` isn't already set: the MCP server never infers an identity from the project's git config —
  doing so would attribute the call to whoever's git identity is configured there, typically the human owner,
  not the agent making the call. An explicit `MM3_ACTOR` always wins over this default, and `mm3
  doctor` shows the actor that will actually be used. [C-143]
- The plugin's own configuration (`userConfig`) offers one masked, optional field — a TypeSafe API key. Leaving
  it empty means the free fake provider, exactly as on the terminal path. The AI Gateway route is env-only for
  the plugin: `AI_GATEWAY_API_KEY` stays a CLI-level environment variable (C-097), but the plugin's own config
  no longer exposes a field for it or maps it into the bundled MCP server's environment — a plugin user who
  wants the gateway route sets `AI_GATEWAY_API_KEY` in their own environment instead. [C-104]
- An empty string substituted for the key (Claude Code's own behaviour for a blank optional value is
  undocumented — it may substitute `""` or omit the variable entirely) counts as no key everywhere key
  resolution happens, and resolution still falls through to the OS keychain or the user credentials file
  rather than treating the empty string as a real, empty key. The same rule applies to `AI_GATEWAY_API_KEY`
  when a plugin user sets it directly in their own environment, even though it no longer comes from the
  plugin's own `userConfig` substitution. [C-105]
- With no key configured, `doctor`'s `key:` line and `mm3 agent`'s overview (one extra `run:` line at the
  end, only when there is no key) both say how to add one, from the same plugin-context check: inside the
  plugin's own bundled MCP server (`CLAUDE_PLUGIN_ROOT` set in the process environment — present there and
  nowhere else, per Claude Code's plugins-reference docs) the hint is `/plugin → MM3 → Configure → press
  Enter on "TypeSafe API key", paste, Enter, Save configuration`; outside it (a bare terminal, or another MCP
  client) the hint stays `mm3 init` to add one. [C-190]
- Node ≥ 22.13 is a hard requirement, checked once at the top of the CLI's whole dispatch —
  before any command does anything real, and again inside `mm3 mcp` for every `tools/call`. On an older
  Node, every command exits 2 with exactly `✖ node: v<version> is too old → install Node 22.13 or newer (it
  powers the ledger index); https://nodejs.org`, except `doctor`, which still runs (free, no call) and shows
  `node: v<version> ✖ too old → install Node 22.13+` and `index: none (needs Node 22.13+)` in its own output
  before it, too, exits 2 rather than 0. `mm3 mcp` still answers `initialize`/`tools/list` on too old a
  Node — a client's handshake never hangs — but every `tools/call` comes back `isError: true` with that same
  line, whatever command was actually asked for (`doctor` included): the guard runs before the requested
  command ever does. [C-106]
- The linear, in-memory fallback in the id index (`ledger/index.ts`) is no longer a normal production mode: it
  still runs, unchanged, when an actual SQLite call throws on a good Node (a corrupt or mid-write `index.db` —
  self-heal's own resilience, unrelated to Node version), but when `node:sqlite` is genuinely unavailable (a
  real Node < 22.13), the index throws a `LedgerError` naming the same Node requirement instead of silently
  degrading. This is a backstop independent of the CLI's own guard (C-106): a library consumer that reaches the
  ledger directly, without going through `mm3`'s dispatch, gets the same loud failure rather than a
  quietly slower, never-persisted index. [C-107]
