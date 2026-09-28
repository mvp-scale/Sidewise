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
| `side:` | **solve it now**: one `goal`, then plumbing. `ask:` splits into **concerns** (yes/no, one path per category) and **decisions** (scale/choice) | yes | yes |
| `wise:` | **get smarter**: why you're here, the area, and the run this follows | optional | no (ledger only) |

`side:` is required, and its contents are what reaches TypeSafe. [C-004]
`wise:` is optional, and never reaches TypeSafe — it's ledger-only context. [C-005]

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
| **Side**: solve it with what's proven | [view](#view) | [class](#class) | [replay](#replay) |
| **Wise**: find what's new, and learn it | [scan](#scan) | [drill](#drill) | [loop](#loop) |

---

## 2. The core (every verb)

### Fields

| Block | Field | Rule |
|---|---|---|
| side | `goal` | one line, ≤ 160 chars; what you want to be true. Asked of TypeSafe outright |
| side | `depth` | `quick` · `standard` · `thorough` = k = 1 · 2 · 3. One subject's `concerns:` section: exactly 3k categories (9 · 18 · 27 yes/no questions). A sweep's finest layer: the same; every layer also caps at 10 · 20 · 30 items asked |
| side | `where` | 1–5 project paths, optional `:start-end`. We read and redact the code |
| side | `ask` | `concerns:` (yes/no categories) + `decisions:` (scale/choice categories) for one subject. In a sweep: layer → `{concerns:, decisions:}` |
| side | `over` | sweeps only: nested arrays |
| side | `from` | drill only |
| side | `compare` | replay only |
| side | `parent` | required by drill and replay (what to build on); allowed on every verb otherwise, as lineage only |
| side | `expect` | replay only, required: which of the parent's concerns this replay should turn to pass |
| wise | `why` | `validate` · `find` · `debug` |
| wise | `area` | `data` · `api` · `ui` · `auth` · `hosting` · `build` · `tests` |
| wise | `stage` | `design` · `build` · `review` · `pre-merge` · `post-fix` · `release` |
| wise | `change` | `feature` · `fix` · `refactor` · `dependency` · `config` |
| wise | `risk` | `low` · `medium` · `high` |
| wise | `parent` | the run this follows (lineage only; an alias of `side.parent` for verbs that don't require it structurally) |
| wise | `problem` | one line: what you're solving right now |
| wise | `nodes` | a C4 chain: `level:name( -> level:name)*`, chains joined by `; ` (`level`: `person`/`system`/`container`/`component`/`code`) |
| wise | `touches` | up to 5 short entities/objects the run touches |
| wise | `blast` | `code` · `component` · `container` · `system` · `person` |

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
The one exception is evidence Sidewise itself picked, never a user-typed `where:` — today, only `drill`
continuing flat from one coded sweep item with no further `over:` (its own whole-file/function/call range) —
which still truncates with a note, since there's no `where:` for anyone to narrow. [C-171]
`ask` holds `concerns:` (yes/no categories) and `decisions:` (scale/choice categories) for one subject, or
layer → `{concerns:, decisions:}` for a sweep. Nothing is published on a flat, unsectioned `ask` any more: a
category with `pass:` straight under `ask:` (no `concerns:`/`decisions:` wrapper) is refused outright,
`✖ side.ask: put categories under concerns: (yes/no) and decisions: (scale/choice) → sidewise template <verb>`.
[C-013]
`over` is sweeps-only: nested arrays that define the layers; `concerns` and `decisions` are reserved words
there too, since a layer of either name would collide with `ask`'s own sections. [C-014]
`from` applies only to drill; `compare` only to replay. `parent` is required by drill and replay (the run to
build on); every other verb accepts it too now, purely as lineage (the same role `wise.parent` already played,
which remains an accepted alias for it). [C-015]
`wise.why` is one of `validate`, `find` or `debug`. [C-016]
`wise.area` is one of `data`, `api`, `ui`, `auth`, `hosting`, `build` or `tests`. [C-017]
`wise.parent` records the run this one follows, for lineage only. [C-018]
`wise.stage` is one of `design`, `build`, `review`, `pre-merge`, `post-fix` or `release`. [C-108]
`wise.change` is one of `feature`, `fix`, `refactor`, `dependency` or `config`. [C-109]
`wise.risk` is one of `low`, `medium` or `high`. [C-110]
`wise.problem`, `wise.nodes`, `wise.touches` and `wise.blast` are the newer knowledge fields: a one-line
problem statement, a C4 dependency chain, up to 5 touched entities, and a blast-radius level. All four are
optional, and none of them reach the classifier — like every other `wise` field, they only shape what the
ledger learns. `wise.nodes` is a chain of `level:name` pairs (`level` one of `person`, `system`, `container`,
`component` or `code`; `name` project-identifier-shaped), joined by ` -> ` within one chain and `; ` between
chains — e.g. `container:api -> component:contributions-dao -> container:db`.

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
Every stop a request can trigger — a parse error, a validation stop, or a bad `where`/git path — ends with
`→ see: sidewise agent <verb>`, naming the verb that was actually run, on top of whatever it already told you
to fix: a stop is read by the agent that sent the request, not a person at a terminal, so it points at the
terse agent view, not `help`. [C-153]
That same pointer now closes every other stop a person or agent can hit while running one of the six verbs or
the four tools beyond them (`report`, `outcome`, `budget`, `template`) — not just a request's own validation:
`view`'s own place/id checks (control characters, outside the project, an unknown run id), `drill`'s own
parent/from/over checks that aren't evidence reads (an unknown or pre-contract `side.parent`, `side.from` naming
no such item or category, an item with no code, code that changed since scan, an idea item given a code-only
layer, `side.over` on a non-sweep parent), `report`'s own view-name checks, `budget`'s own cap-reached/
corrupt-file/bad-cap-value messages, and `outcome`'s own ledger-lookup checks (an unknown run id, the asking
actor trying to self-certify `held`) — plus every bare CLI usage mistake for a pointable command (an unknown or
duplicated flag, a missing project, a request file the CLI itself couldn't read, `outcome`'s own id/value/`--by`
checks, `budget`'s own cap parsing). `report`, `outcome`, `budget` and `template` are tools, not one of the six
`Verb`s, so `verbs/request.ts`'s `stopText` widens to a small `AgentTarget` union (`Verb` plus the four tool
names) rather than `verbs/` importing `help/agent.ts`'s `AGENT_TOOLS` just for a type; `budget/budget.ts` and
`ledger/log.ts` sit below `verbs/` in the dependency order, so their own stops append the identical
`\n→ see: sidewise agent <tool>` line as a literal suffix instead, avoiding a layering inversion. A command with
no agent card (`help`, `agent`, `doctor`, `init`, `uninstall`, `mcp`) never gets this pointer — there's nothing
deeper for it to point at. [C-197]

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
A run made with a rehearsal adapter (`fake`, `chaos` — free, deterministic, offline, canned) adds `adapter
<name> · not evidence` to `notes:`, right before the budget line, on every verb that calls the classifier
(class, scan, drill, loop, replay) — so a rehearsal answer is never mistaken for real evidence. [C-092]
A missing `.sidewise/budget.json` is created with the defaults ($5.00, 500 runs) the first time any of those
verbs preflights a call; that same run's `notes:` says so (`budget file created with defaults ($5.00 · 500
runs)`), once, since every later run finds the file already there. [C-093]
On TypeSafe's direct route, which reports no cost of its own, a run whose answering model has a published
rate (today, only `jev-1.13.0`, at $42 per billion input tokens; output tokens are free) is charged an
estimate from its input tokens instead of showing $0.00, and `notes:` says `cost estimated from tokens (no
live pricing reported)` so it's never mistaken for a figure TypeSafe itself reported. A model with no
published rate keeps its cost unreported, never guessed at; a cost the gateway route did report always wins
over the estimate. Every verb that calls the classifier (class, scan, drill, loop, replay) does this the same
way. [C-132]
Question text is never repeated in a response; the agent has it by number. [C-048]
A sweep response lists category gates per item and shows probabilities only for questions that didn't clear
the bar; the full numbers are in the ledger. [C-049]

---

## view

**Side × Know: what do we already know here?** Free: it reads the ledger and never calls TypeSafe. [C-050]

**When:** before any paid call; when entering an unfamiliar area; when looking for proven questions. [C-051]

```yaml
side:                              # the class request you're about to send — a partial draft is fine
  goal: This login handler is safe to merge
  depth: quick
  where: [src/user.ts:1-3]
  ask:
    concerns:
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
never been asked here. There is no `best` field yet: nothing ranks "the question set with the best record
here," even for a category whose fix was later recorded `held`. [C-052]
`next` is `sidewise view <reuse>` when there's an exact reuse, to read that answer; otherwise it's `sidewise
class`, and your categories become the first pattern here. [C-053]
`wise: {recorded: none}` always: view never adds to what the ledger *teaches* (no run, no category record) —
no call, no spend. `notes: [free]`. A full draft check (one with `ask:` categories, not a bare place/id lookup)
does append one free `kind: "lookup"` ledger line of its own (`goal`, `where`, `hit`, `reused`), so the ledger
can see what agents search for even when nothing is asked outright; it takes no `SW-####` id, is never counted
as a run, and never touches the budget (see "Setup, keys and the MCP tool" below). [C-054]
Given a folder, a tag, or a run id instead of a request body, view answers in place/id mode, which is Plan
1's own text history rather than the YAML `side:` shape above: for a place, a count line (held / overruled /
failed / open, with rehearsal runs counted apart) followed by its newest runs, newest first; for a run id,
that run's lineage up and down. [C-055]
A scan/loop/drill sweep run's own `where` is always empty (its questions are asked per item, not per
request); its real code locations and category tags are indexed from its items' own units and layers
instead, so `view <folder>` and `view <tag>` find a sweep run the same way they already find a class/replay/
drill run — not only `view .`. [C-120]
`view <path>` reads a named file's own bytes only to check whether it looks like a request (`side:` or JSON);
a real source file that isn't one is always shown as a place, never misread as "control characters" just
because its code is hard to parse as YAML. A saved request file is still read as a request, exactly as
before. [C-121]
The "… N older → raise the level to see more" line means what it says: no row is ever silently dropped
without a count and a way to see it. [C-122]
`view <SW-####> --level 2|3` adds answer detail about the run itself, on top of the lineage `--level` already
controlled: level 2 shows its own category gates (or, for a sweep, how many of its items are failing); level
3 adds its notes and adapter/model. Level 1 is unchanged. A legacy (Plan 1) run has none of this stored, so
any level above 1 is a documented no-op for it, never a stop. [C-123]
`view <folder|tag|.> --summary` prints one line per distinct place (a `where` path, or a sweep item's own code
path), from the latest run that touched it, worst gate first — the free onboarding briefing, without
hand-assembling it from several `view` calls. Ignored for a run id or a request draft, where "one line per
place" doesn't apply. [C-124]

---

## class

**Side × Judge: does the evidence support this one goal?** One call, one state. [C-056]

**When:** a decision on one subject: merge, choose, triage, check a fix. [C-057]

```yaml
side:
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
wise:
  why: validate
  area: data
```

```yaml
side:
  id: SW-0042
  gate: fail
  goal: {gate: fail, p: 0.08}
  injection: {gate: fail,   1: 0.94, 2: 0.91, 3: 0.90}
  access:    {gate: fail,   4: 0.86, 5: 0.84, 6: 0.79}
  leaks:     {gate: unsure, 7: 0.55, 8: 0.20, 9: 0.31}
  severity:  {gate: fail,   10: {top: high, p: 0.81}}
  route:     {gate: fail,   11: {top: block, p: 0.97}}
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
When any question's answer was reused (whole or in part) from an earlier run, the response names which one:
`reused: [SW-####, ...]`, sorted and deduplicated, right after `escalate:`. The field is left out entirely
when nothing was reused. [C-130]
When a question is asked fresh (not reused) but an earlier run already answered the exact same question text
at an overlapping place on code that's since changed, the response's `notes:` says so — `stale: SW-#### answered
"<question, clipped>" on older code (p <its P(yes)>)` — up to 3 such notes, one per older run. This is scoped to
`class` only for now. [C-160]

---

## replay

**Side × Prove: did the change work?** It replays a parent run's questions (the yardstick) on two states. [C-060]

**When:** after a fix, a refactor, a dependency bump, or to compare fix A with fix B. [C-061]

```yaml
side:
  goal: The injection fix works
  parent: SW-0042                  # replay this run's categories and questions
  compare: {before: main, after: HEAD}
  expect: [injection]              # required, ≥1: which of the parent's concerns this replay should fix
wise:
  why: validate
  area: data
```

```yaml
side:
  id: SW-0051
  gate: fail                       # every category passes on "after", and nothing regressed
  goal: {gate: pass, p: 0.84}
  injection: {before: fail, after: pass, fixed: [1, 2, 3]}
  access:    {before: fail, after: fail, still: [4, 5]}
  leaks:     {before: unsure, after: pass, fixed: [7]}
  regressed: []
wise: {recorded: [why, area, parent]}
next: sidewise template drill --parent SW-0051 --from access
notes: [2 states · budget 2% used]
```

`replay` never takes `ask`: it replays the parent's categories and questions; new questions go through
`class`. [C-062]
`replay`'s parent must be a one-subject run (class, replay, or drill's one-subject form) — a sweep parent is
refused; run the sweep again instead, since unchanged items are reused there for free. [C-063]
A category's response shows `before`/`after` gates, `fixed` (questions failing or unsure before that pass
after) and `still` (ones that don't); anything in the run-wide `regressed` list (passing before, not after
now) can alone fail the gate even when every `after` category passes on its own. [C-064]
`expect:` is required: 1–9 concern names, lowercase kebab-case, each ≤ 20 characters and unique — the agent's
own prediction of which of the parent's concerns this replay should turn to pass. **Not fully wired yet**: the
schema checks `expect:`'s own shape, but nothing yet checks each name against the parent's actual concern
names, and the response carries no `expected:` grade of the prediction (`fixed`/`still` per category, and
`regressed`, are unaffected by `expect:` either way, exactly as before this field existed).
On a category's own `fixed`, record `outcome held` on the parent; on `still`, keep working; anything in
`regressed`, revert or drill into it. [C-065]

```yaml
side:
  id: SW-0052
  gate: fail                       # access regressed even though it (and the goal) grade pass on their own
  goal: {gate: pass, p: 0.81}
  injection: {before: fail, after: pass, fixed: [1, 2, 3]}
  access:    {before: pass, after: pass}
  leaks:     {before: unsure, after: pass, fixed: [7]}
  regressed: [5]
wise: {recorded: [why, area, parent]}
next: sidewise template drill --parent SW-0052 --from access
notes: [2 states · budget 2% used]
```

A non-empty `regressed` takes priority over the usual "which category matches the overall gate?" search:
`next:` names the category the first regressed question belongs to, even when every `after` category (and the
goal) grades pass on its own — the case above, where nothing but `regressed` explains the `fail`. [C-091]
Called as `sidewise replay --parent SW-#### --compare <before>..<after>` (no request file), the goal asked is
the parent run's own goal, not a fixed placeholder. [C-066]
The plan is for whether the yardstick predicted correctly to feed a ranking: a category that said `fail`
and was later `fixed` and proven would count as a hit. **Not shipped yet**: there is no hit count anywhere
in the ledger record (`ContractRun` carries no field for it), and recording a fix's outcome as `held`
changes nothing about what `view` shows for that category afterward — the same gap as `view`'s own missing
`best` field (above). [C-067]
`replay` reads git in the repo that actually contains each compared file — its own nearest `git rev-parse
--show-toplevel`, not only the Sidewise project root — so a file whose own repo is nested one level down (a
monorepo package, a vendored project) is no longer invisible to it. [C-147]
Like `class`, `replay` names which prior runs its answers came from (`reused: [ids]`) when anything was
reused, and its `--dry-run` predicts that reuse the same way `class`'s does. [C-152]

---

## scan

**Wise × Know: where in this code should we look?** A sweep across code, read by us. [C-068]

**When:** a new codebase, a release check, a PR's changed files, or a vague bug with no location yet. [C-069]

```yaml
side:
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
    src/handlers/user.ts/findUser:    {injection: fail, access: fail, 1: 0.93, 4: 0.88}
    src/handlers/order.ts/getOrder:   {access: fail, 4: 0.79}
    src/handlers/order.ts/listOrders: {access: unsure, 4: 0.52}
  passing: 20                      # counted, not listed
  reused: 14                       # unchanged functions answered from the ledger for free
wise: {recorded: [why, area]}
next: sidewise template drill --parent SW-0060 --from src/handlers/user.ts/findUser
notes: [1 call (the function layer; files are read, not asked) · budget 4% used]
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

**Wise × Judge: why did this one thing fail?** It goes down from one item in a parent run. [C-074]

**When:** after a `fail` or `unsure` from class, scan, loop or replay. [C-075]

```yaml
side:
  goal: Find exactly where request text reaches the query
  parent: SW-0060
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
    src/handlers/user.ts/findUser/db.query: {reach: fail, sink: fail, 1: 0.96, 2: 0.94, 7: 0.91}
  passing: 3
wise: {recorded: [why, area]}
next: fix it, then run this drill again (unchanged items are reused, so it is nearly free)
notes: [1 call · budget 4% used]
```

On a sweep parent (scan, loop, or an earlier sweep drill), `from:` names an item, and drill needs `over:` for
the next layer down under it; the response is shaped like scan's, worst first. [C-076]
On a one-subject parent (class, replay, or an earlier one-subject drill), `from:` names a category instead;
new, narrower questions go under `ask:` inside it, and the response has the same shape as class's, including
consensus and escalate. [C-077]
drill's own `next:` never points at drilling further: on a one-subject parent it says to fix it, then
`replay` against the parent; on a sweep parent it says to fix it and run this same drill again, since
unchanged items are reused, so it is nearly free. [C-078]
Wise learns which narrower questions separate the real cause from the noise; they become the drill pattern
for that category. [C-079]
`sidewise template drill --parent <id> --from <x>` picks the sample matching that id's own shape when the
ledger has it: a sweep parent's sample keeps `over:`, a one-subject parent's has no `over:` and `from:` names
a category instead. No project, or an id the ledger doesn't have, prints the sweep sample, same as always. [C-090]
`drill` on a sweep item that has code, given no `over:`, is a flat one-subject proof of just that one item:
fresh `ask:` categories answered against the item's own lines, in the same shape as a one-subject parent's
drill. An idea item (loop's own kind, with no code) still stops, naming the fix. Like `class`, it names which
prior run its answers came from when anything was reused, its `--dry-run` predicts that reuse, and it's never
blocked by an already-reached budget cap when fully reused. [C-144] [C-149]

---

## loop

**Wise × Prove: does this idea hold up?** A sweep across layers of ideas, written by the agent. [C-080]

**When:** a design, a plan or a feature request before any code; comparing two designs. [C-081]

```yaml
side:
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
wise:
  why: validate
  area: api
```
The expansion: 3 parts + 5 stories = 8 items; `part`'s 2 written questions become 4 asked (thin, not the
finest layer), `story`'s 13 become 39, in 2 calls (one per layer).

```yaml
side:
  id: SW-0070
  gate: fail
  goal: {gate: pass, p: 0.74}
  failing:                         # an item fails if it or any child fails
    payments:                  {boundaries: fail, 2: 0.18}
    payments/refunds:          {done: fail, risk: fail, 3: 0.22, 6: 0.91}
    payments/partial capture:  {risk: unsure, 6: 0.48}
  passing: [gateway, gateway/guest checkout, gateway/saved cards, payments/retries, ledger]
wise: {recorded: [why, area]}
next: sidewise template drill --parent SW-0070 --from payments/refunds
notes: [2 calls · 43 questions · budget 3% used]
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

`sidewise report [hits|patterns|history]` is the one way knowledge leaves the ledger besides a run's own
response: free, read-only, never calls a provider, never writes to the ledger, and takes no options beyond the
view name (default `hits`). It is not a seventh verb — it sits outside the Know/Judge/Prove grid, reading
across every place at once rather than proving one thing. It works unchanged with no on-disk index present
(the same linear-fallback engine `view` already falls back to). [C-162]
`sidewise report hits` (or no argument) shows the newest run's own gate per place x category, worst gate first
(`fail`, then `unsure`, then `pass`), each row naming the run it came from. A one-subject run's row is marked
`stale` once the code at that place has changed since — re-derived live, on the bounded set of rows actually
shown, from the run's own recorded evidence key, never a full-ledger scan. A sweep item's row is never marked
stale (its evidence isn't reconstructed here). [C-163]
`sidewise report patterns` groups every run by its own question-set fingerprint (its categories' or layers'
names, `pass`/`need` and question text — never the evidence), showing how often each set has run, its
pass/fail/unsure split, how many distinct places it's touched, and its outcomes so far. [C-164]
`sidewise report history` merges, newest first: every `replay` run's own result against its parent, named
`fixed` or `regressed` (the same priority `replay`'s own gate uses — any regression wins over any fix; a
replay that moved nothing gets no row), with every recorded outcome. Neither is a new ledger write — both are
derived, read-side, from records the commands already wrote. [C-165]
Every view caps its rows and says plainly how many more exist (`… N more not shown`) rather than dropping them
silently, the same idiom `view` already uses — `report` takes no option to raise it. [C-166]
An unrecognized view name is a clean stop naming the four real ones. [C-167]
`sidewise report web` writes one self-contained, read-only viewer, `.sidewise/viewer.html`, holding the
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

---

## help and template

`sidewise help` (free, no project needed) prints a one-screen contract card: the six verbs, the rules that
cause most first-try rejects, and how to read a verdict. [C-113]
`sidewise help <verb>` (view, class, replay, scan, drill, loop) prints that verb's purpose, when to use it,
one annotated example, and its own sharp rules. [C-114]
`sidewise help <verb>` now opens with a first line, `Agents: sidewise agent <verb>`, ahead of its own
`## <verb>` heading — round-4 smoke testing's top finding: a cold CLI agent made zero `sidewise` calls at all
because it never discovered `sidewise agent` exists. The bare CLI usage text (`sidewise --help`, a bare
`sidewise`, and `sidewise <command> --help`) carries the same front door: `help/card.ts`'s exported
`agentFrontDoorLines()` returns, in order, `Agents: run "sidewise agent" first`, the existing `new here? →
sidewise init` hint for a human, this tool's own one-line pitch (`card()`'s own opening wording, factored out
rather than retyped a second time), and one purpose bullet per verb from the same shared `VERB_LINE` text
`agent`'s overview and `help`'s own card already render — `cli.ts` splices this ahead of its usage block rather
than hand-typing a third copy. [C-191]
Per-verb sharp rules `help` carries: `drill` says to follow `next:` rather than hand-authoring parent/from;
`replay` says the files must be committed at the ref it names; `scan` says a `scale` question ranks findings
by severity, worst first, and to scan by file when the file is the unit that matters; `loop` says a sub-layer
is a sibling key under `over:`, names are ≤ 20 characters with no `/`, and every question under a layer is
asked of every item at that layer. [C-115]
`sidewise help <topic>` covers `authoring`, `verdict`, `wise`, `reuse` and `probe` — cross-cutting rules that
don't belong to one verb. [C-116]
`sidewise help wise` lists all five catalog fields (`why`, `area`, `stage`, `change`, `risk`) with their closed
values and what each is for. [C-117]
An unknown `help` target is a clean stop naming every real verb and topic. [C-118]
`sidewise help probe` is its own recognized topic: a valid probe, the shape of a well-formed Sidewise question —
one narrow judgment per question, self-contained wording (a question's number is a label for the response
only), answerable from `where:` (naming the file in backticks when there's more than one), one polarity per
category, concrete scale levels, a "none fits" choice option, the goal phrased as the safe state rather than
the vulnerability, and the visible-scope probe ("Can this be answered from the code shown?") as a recommended
extra question — each rule cited to its own TypeSafe documentation page. It's guidance labelled as best
practice for a higher-quality answer, not new validator enforcement — nothing here is checked by the schema or
cross-validator. [C-180]
`sidewise agent probe` renders the same 8 rules bare, no citations, no prose, from the one shared list `help
probe` renders with citations, so the two views can't drift apart; `sidewise agent` with no verb points
explicitly at `sidewise agent probe`. [C-181]
The 160-character cap on a single question (or the goal) line — previously a bare literal inside
`schema-check.ts`'s `lineProblem` — is now the named, exported constant `MAX_QUESTION_CHARS`, documented as a
shared `rules.ts` entry reaching `sidewise help`'s one-screen card, `help authoring`, every verb that accepts
`ask:` (`class`, `scan`, `drill`, `loop`, `view` — checked against the schema envelope; `replay` never accepts
`ask:` at all), and both `help probe` and `agent probe`. This closes a round-4 finding: a cold agent hit `✖
question 1: is longer than 160 characters` with zero prior warning in `agent view` or `agent probe`. Because the
cap is Sidewise's own hard validator rule rather than TypeSafe's own published guidance, it lives in
`RULES`/`ruleLines`, not `PROBE_RULES` (whose cited-guidance contract is unchanged) — `probe()`/`probeCard()`
simply splice `ruleLines('probe')` in alongside it. [C-194]
`sidewise help outcome` and `sidewise help budget` are recognized targets the same way `sidewise help report`
already was — neither is a `side:`-YAML verb (neither takes `ask:`, neither calls the classifier) — each with
its own purpose, example, sharp rules and a good/bad pair grounded in a real stop: `outcome`'s self-held
restriction and its lack of a `--note` flag, `budget`'s bare `set` with no flags. `sidewise agent outcome`,
`sidewise agent budget` and `sidewise agent report` are the same three targets' bare terse cards — no
citations, no headings, hand-written rather than sharing a data structure with `help`'s prose (an agent card is
why-only; there's no rule prose to reuse). Before this, `outcome` appeared in neither `help` nor `agent` at
all. An unknown `help`/`agent` target now names all three extras (`report`, `outcome`, `budget`) alongside
every verb and topic. [C-182]
A new `agent verdict` card (`tool: verdict`) and a refactored `help verdict` render the same response-vocabulary
facts from one shared list, `rules.ts`'s `VERDICT_FACTS`: `need:`'s all/most/any bar, the goal-and-every-category
gate rule, `consensus` (STRONG/SPLIT/WEAK) and which verbs compute it, `escalate`'s triggers, what a probability
near 0.50 landing in `unsure` means, `replay`'s per-category fixed/still/regressed grade, `reused: [SW-####]`'s
meaning, `sidewise report hits`'s `stale` flag, and the three exit codes. `help verdict` keeps its own prose
framing around the list; `agent verdict` renders it bare, matching every other agent card's why-only shape and
key order. `agent`'s overview gains a third `run:` line, `sidewise agent verdict — before reading a response:
how to read it`, alongside its existing pointers at `<verb|tool>` and `probe`. This closes a round-4 finding:
response-side vocabulary was previously documented only in `help report`'s own prose, and only after a response
had already used it once. [C-196]
Every fact the validator enforces that `help` also states (depth counts, the `where` limit, the pass bar, and
the `wise` catalog lists) is built from the same constants the schema check and validator use, and a test
asserts each one appears verbatim in the `help` output it names — so the validator and `help` can't quietly
drift apart. [C-119]

`sidewise template <verb> --from <request.yaml>` — with no `--parent` — names a request YAML file rather than
a drill item or category: its `ask:`/`over:` (the frozen question set) is printed back unchanged, and
`--where`/`--goal` overlay a new subject on top of it. Neither the file's shape nor its content is
validated — template only prints, like every other path. [C-111]
`--where`/`--goal` are refused unless paired with `--from`, and refused together with `--parent` (they overlay
a checklist read from a file, not a drill item/category lookup). [C-112]
`sidewise template <verb> --from SW-####` prints that run's own request straight from the ledger — free,
read-only, no spend, same discipline as every other `template` path (it only prints; nothing here is
validated). The `SW-####` shape is checked before the file-path branch (unambiguous, and a typo'd id would
otherwise surface a confusing "file not found" instead of "not in the ledger"). An id not in the ledger, or one
that predates the YAML contract (a Plan 1 run, no `v: 2`), is a clean stop naming the problem, not a crash. With
no project reachable, the lookup itself is a clean stop (a run-id lookup has nothing to search). `--where`/
`--goal` overlay on top of a ledger-fetched request the same way they already do for a file-based `--from`.
[C-201]
The `--from SW-####` rebuild is faithful to the run's own request for every verb except `replay`: a `replay`
run's stored record also carries its *parent's* `where` and `ask.categories` (kept there only so it can grade
before/after answers against the same categories — never because the original replay request carried them;
`replay`'s own `NEVER` list forbids `ask`/`over`/`from`/`where`/`depth` outright). `--from SW-####` on a replay
run therefore reprints only `goal`/`parent`/`compare` (plus `verb`), never the borrowed `where`/`ask`, so the
printed request stays a schema-valid `replay` request. Every other verb (`class`/`scan`/`loop`/`drill`) stores
exactly its own request's fields on its own run, so the rebuild for those is a direct, unqualified copy. [C-202]
`sidewise help report` is its own recognized target, not one of the six verbs (`report` is outside the 2x3
Know/Judge/Prove grid) and not a cross-cutting topic: purpose, an example and its own sharp rules, the same
shape as `help <verb>`. [C-161]
`sidewise help class`, `sidewise help scan` and `sidewise help authoring` each carry a "Good / bad" section: a
bad snippet, a good snippet, and one line of why, for the patterns that cause a first-try reject in practice
(a whole file in `where:` instead of a range; a question about code that isn't in `where:`; several `where:`
entries with no file named in the question; `scan` asking `{function}` about something outside it). [C-172]
`sidewise help view`/`sidewise agent view` and `sidewise help loop`/`sidewise agent loop` each carry their own
"Good / bad" section too (previously neither verb had one): `view` without `where:` (nothing to check reuse
against) and `view` with `over:` present (it checks one subject, never a sweep) both reject outright at the
schema/cross validator, as does `loop` with a code-glob `over.file` layer (loop sweeps written ideas, not
files on disk — that's `scan`'s job). [C-183]
The oversized-file good/bad pair's terse `why` (shown in `agent class`) reads "Big whole files refused —
name the range", matching the real behavior since e6b7d78 (a stop, not a silent cut). [C-184]

Each of the six verb templates (`skills/sidewise/templates/{view,class,replay,scan,drill,loop}.yaml`) shows
every `side.*` field that verb's own schema and cross-validator allow it to carry — required fields with a
live value, optional fields either live or as a commented-out example — each marked `# required` or
`# optional` in a trailing comment, and its `wise:` block names all six catalog keys (`why`, `area`, `stage`,
`change`, `risk`, `parent`); a test checks every template against the same rule the validator itself enforces,
so template and schema can't quietly drift apart. The category-level schema fields that don't vary by verb —
`need:` and `tags:`, alongside `pass:` and the three question kinds (yes/no, `scale`, `choice`) — are
demonstrated once, in `class.yaml`, rather than repeated in all six. [C-174] [C-175]
`class.yaml` and `scan.yaml` show the visible-scope probe question ("Can this be answered from the code
shown?") as a commented-out, optional recommended addition, matching the templates' existing
optional-field comment style. [C-185]

## agent

`sidewise agent [verb]` (free, no project needed, never spends or writes) is `help`'s terse, agent-facing twin:
the enforced rules for that verb (the same list `help <verb>` states) and its "Good / bad" pairs, why-only, in
at most 8 words — no prose, no headings beyond a bare label. `sidewise agent` alone gives the verb list, the
universal rules, and a pointer to `sidewise agent probe`. Beyond the six verbs, `agent` also recognizes
`probe`, `outcome`, `budget` and `report` — the same non-verb targets `help` does — plus `template`, which
`help` does not; each its own bare card, free, read-only. Every request-validation stop's pointer (`→ see:
sidewise agent <verb>`, C-153) names this, not `help` — a stop is read by the agent that sent the request.
[C-173]

`sidewise agent` with no target also prints a `tools:` section, right after the verb list — the other real
commands a cold agent needs before writing a request; setup-only commands (`init`, `uninstall`, `mcp`,
`doctor`) are deliberately left off. `sidewise agent template` is a new bare card, the same shape as
`outcome`/`budget`/`report`. Every card `agent` prints — the overview and each verb/tool — is assembled in one
fixed key order: its identifier line(s) first (`verb:`/`verbs:` for a verb, `tool:`/`tools:` for everything
else, including `probe`), then `rules:`, then `patterns:` only when that target has any, then `run:` only when
it points further — a non-verb card's identifier line now reads `tool: <name>`, not the former `target: <name>`,
so it matches a verb card's own `verb: <name>` line for line. [C-187]

`sidewise agent`'s overview states one more rule, beyond the shared `RULES` list: `where:` resolves against the
MCP `project` argument or the CLI's `SIDEWISE_HOME`, never the agent's own session cwd, naming both surfaces.
This is a runtime/environment fact rather than a request-schema one, so it's hand-written once as `agent.ts`'s
own constant rather than forced into `rules.ts` (built only from `schema-check.ts`/`validate.ts` constants), and
it appears only in `agent`'s card, not `help`'s — an agent, not a human reading `help`, is the one that actually
passes `project` or sets `SIDEWISE_HOME`. Round-4 finding: an agent had to fail once, `✖ side.where: cannot read
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

The Claude Code skill's own "Run this first" guidance (`skills/sidewise/SKILL.md`, carried verbatim into
`AGENTS.md`'s "Using Sidewise" section and into `GEMINI.md`) sends a cold agent to `sidewise agent` (no verb)
first — it names every command, including `report`/`outcome`/`budget`/`template`, in one card — before
`sidewise agent <command>` on whichever one it's about to use, ahead of writing any request. [C-188]

`sidewise agent` with no target lists one atomic purpose line under each verb and tool, not just its name —
`verbs (pick by goal):` followed by `- view: free; what's already known, before any paid call`, one such
bullet per verb, then a `tools:` section shaped the same way — so an agent holding a goal ("is this handler
safe to merge?") rather than a verb name can map straight to the right one; the closing `run:` lines say what
each next step is *for* too (`sidewise agent <verb|tool> — before writing that request`,
`sidewise agent probe — before writing questions: how to phrase one`), rather than just naming it. These
purpose lines are never a second, hand-typed copy: verbs' come from `help/verbs.ts`'s `VERB_LINE`, and the four
tools' from `help/report.ts`'s `TOOL_LINE` — the same shared constants `sidewise help`'s own one-screen card
(`help/card.ts`) renders too (its "Pick your verb" bullets and its "## Tools" section), so `help` and `agent`
can't state a different purpose for the same command. The card's `rules:` section itself also dropped the
`P(yes)` notation from the pass-bar rule (`pass: yes clears at >= 0.70; pass: no clears at <= 0.30; in between
is unsure`) — the same simplification for both `help` and `agent`, since it's one shared rule (`rules.ts`).
[C-189]

---

## Setup, keys and the MCP tool

- `side.verb` is optional. The tool name wins, and a mismatch is sent back. [C-085]
- `depth` counts `concerns:` categories only (exactly 3k of them); `decisions:` questions never count toward
  it. [C-086]
- The ledger stores a category's `section` and `family`/`familySource` alongside its usual fields, the run's
  git HEAD sha (`commit`, or `null` outside a repo) at the time it ran, `expect` for a `replay` run, and
  `where` for every verb (a sweep derives it from its items' own code paths). None of this changes an answer
  key or a pattern fingerprint — the same question on the same evidence still reuses for free regardless of
  which family tag or commit sha it was asked under. A `view` request-mode check (the free draft-against-the-
  ledger lookup shown above) is itself logged too, as a free record that never takes a run number and never
  counts toward the budget.
- Nested items use `- name: <item>` plus child layers beside it, which is what agents write naturally.
  Different items may have different child layers. [C-087]
- `sidewise --version` and `sidewise -v` print the installed package's version, one line, exit 0 — free, no
  project needed, no Node-version gate (same free standing as the bare `--help`/`-h`). [C-178]
- `sidewise <command> --help` and `sidewise <command> -h` work for every command, exit 0, never reaching that
  command's own flag parser (previously an unknown-flag stop for every command but the bare top level — e.g.
  `sidewise doctor --help` used to fail). For the six verbs it prints that verb's usage line plus `→ see:
  sidewise help <verb> · sidewise agent <verb>`; every other command prints just its usage line, since none of
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
  not checked here — not mechanically checkable, left to `sidewise agent probe`'s own prose rule — and neither is
  a question over 160 characters, since the schema already stops that outright before a request can ever reach
  `--dry-run`. More than 3 warnings still shows only 3, plus one line naming how many more, the same overflow
  shape used for more than 5 request stops. `replay` carries no `ask:` of its own (it replays its parent's
  frozen questions), so it has nothing to check. [C-198]
- A run whose every answer is reused from prior runs is never blocked by an already-reached budget cap, on
  any verb: the cap is checked only when the run would actually need to call the classifier — reuse only
  skips the *spend* gate, never the *ledger* one (the ledger must still read cleanly and accept the new line
  either way). [C-136] [C-149] [C-150] [C-151] [C-152]
- `sidewise budget`'s cap-reached message points at the fix that actually applies: `sidewise budget set
  --runs <n>` when only the run cap tripped (the dollar cap has room left), `sidewise budget reset` whenever
  the dollar cap is involved, alone or together with the run cap. [C-133]
- `replay --dry-run` reads both git refs before answering: a nonexistent or mistyped `before`/`after` ref
  stops `--dry-run` the same way it stops a real run, instead of only surfacing on the paid attempt. [C-148]
- Node ≥ 22.13 is a hard requirement, not a soft preference: it's what the ledger's `node:sqlite`-backed lookup
  index runs on. The CLI's whole dispatch checks this once, up front (see C-106) — a project's own ledger
  itself (`.sidewise/log.jsonl`) stays the source of truth regardless: the index is a disposable, self-healing
  cache that a missing or corrupt copy only costs a rebuild, never a wrong answer; the slower, always-correct
  linear scan it rebuilds from is still what a corrupt or mid-write `index.db` falls back to (see C-107) — but,
  as of the Node-version guard, no longer a normal, silent substitute for `node:sqlite` genuinely missing. [C-089]
- `SIDEWISE_BASE_URL` overrides the TypeSafe base URL for either route (a proxy, a self-hosted mirror, tests).
  It must parse as a URL; `https` is required, except `http` for `localhost`, `127.0.0.1` or `[::1]`. Anything
  else is a stop, `✖ SIDEWISE_BASE_URL: ... → ...`, at exit 2. [C-094]
- `sidewise doctor` is free: no classifier call, no budget touched, no ledger write. It reports the resolved
  provider, route (`direct`/`gateway`/`custom`, or `fake`/`chaos`) and base URL, whether `TYPESAFE_API_KEY` and
  `AI_GATEWAY_API_KEY` are set (never their value), the pinned model (plus the gateway wire model when
  relevant), whether a project/ledger is found, and the Node version and whether `node:sqlite` is available.
  Exit 0 when the config is usable; exit 2 with the same `✖` message a paid verb would give when it isn't (a
  floating model, a bad `SIDEWISE_BASE_URL`) — including too old a Node, which doctor still runs and reports
  rather than stopping outright (see C-106). [C-095]
- The TypeSafe client retries a 429, a 529, or another retryable status/timeout up to 2 more times (3 attempts
  total), honouring the server's own `Retry-After` when it sends one, else exponential backoff with jitter,
  capped at 10s per wait. 401, 422 and any other non-retryable status are never retried — the first failure is
  final. [C-096]
- A key is resolved in order: `TYPESAFE_API_KEY`/`AI_GATEWAY_API_KEY` in env, then the OS keychain (macOS
  `security`, Linux `secret-tool`; Windows always falls through), then `~/.config/sidewise/env` (or under
  `$XDG_CONFIG_HOME`) — a shell env file `sidewise init` writes at mode 0600 in a 0700 directory, holding only
  lines of the exact shape `export NAME='value'` for an allowlisted name (`TYPESAFE_API_KEY`,
  `AI_GATEWAY_API_KEY`, `SIDEWISE_BASE_URL`, `JEV_MODEL`, `JEV_GATEWAY_MODEL`, `SIDEWISE_PROVIDER`) plus `#`
  comments; Sidewise parses this file itself and never sources or evals it, and a line it doesn't recognise is
  left untouched, not an error. The first hit wins, and its source (`env`/`keychain`/`file`) is carried
  alongside it. The resolved value never appears in any output, error, ledger line or note — the redaction list
  (`ledger/redact.ts`) also scrubs it as a literal, on top of its own secret-shaped patterns. [C-097]
- A key resolved from the OS keychain or the user file (never env) is honored the same way everywhere a
  provider is chosen or identified — not just by `sidewise doctor` and `sidewise agent`, which already looked
  past env. Every `cli.ts` call to `selectProvider` (class/scan/drill/loop, and `replay`) and to `runView`
  passes the same `resolveStoredKey(runner, platform, env)` lookup those two commands use, via one shared
  `VerbContext`/`ViewContext` field (`resolveStored`) threaded through to every verb's own `providerIdentity`
  call (the route/adapter shown in `--dry-run`'s `plan:` and recorded on the ledger run) — so a key found only
  in the keychain or `~/.config/sidewise/env`, with no env var set, is never silently treated as "no key" and
  answered by the fake provider while `doctor` reports `key: yes`. An env var still wins over a stored key,
  unchanged. [C-203]
- The secret-shaped-key redaction pattern (`ledger/redact.ts`'s `KEY_VALUE`) refuses to start its value match on
  `{` or `[`: a real secret is never itself a literal YAML mapping or list, so a Sidewise-chosen name that
  happens to contain a secret-ish word (a sweep item or category like `issue-token`, `verify-token`,
  `set-new-password`) no longer has the immediately-following structured value swallowed as if it were the
  secret (previously `issue-token: {depends: unsure, ...}` became `issue-token: [redacted] unsure, ...}`,
  destroying the category name — data loss, not a leak, since nothing there was ever a secret). A genuinely
  secret-shaped value after the same kind of key (`api_key: sk-...`) is still redacted exactly as before.
  [C-200]
- `sidewise doctor` names where a resolved key came from (`key: yes · from OS keychain (encrypted, per user)`,
  `from user file <path> (0600, not encrypted)`, or `from env TYPESAFE_API_KEY`, with `(overrides stored)` when
  a stored key also exists but env won), or `key: no → run "sidewise init" to add one`; the env file gets its
  own warning line if its mode is looser than 0600 or it has a line sidewise ignored. It also names the CLI's
  own install (`cli: <path> · installed --<mode> ...`) and the Claude Code plugin's overall state (`plugin:
  sidewise@mvp-scale · <scope> scope`, or `not installed → ...`). [C-098]
- Using Sidewise is scoped per project, but Claude Code's own `/plugin install` UI (unlike `sidewise init`,
  which already defaults to `project` scope) defaults to `user` scope — so when doctor's `plugin:` line finds
  the plugin installed at `user` scope only, it appends a nudge toward switching: `sidewise@mvp-scale · user
  scope (every project) → for just this one, "sidewise init --scope project"`. No nudge once `project` or
  `local` scope is present. [C-177]
- `sidewise init` sets up two things per user, shared across every project — the CLI (`--global`/`--user`/
  `--local`, offering `--user` instead of a sudo-needing global install) and the key (hidden input via
  `node:readline`, never argv; `--key-stdin` for automation, `--no-key` to skip; a sanity check on shape only —
  no live check against TypeSafe) — then, per project, the Claude Code plugin (`--claude`/`--no-claude`,
  `--scope user|project` defaulting to `project`) and the project's `.sidewise/`. Run outside a git project, it
  does only the two per-user steps, then stops with one line pointing the user at cding into a project. It is
  idempotent (a re-run that finds a step already done says so and changes nothing) and interactive by default;
  `--yes` takes the default answer everywhere. Every step prints exactly one line, glyph first: `✔ done`,
  `· already`, `– skipped (why)`, or `✖ problem → fix`. [C-099]
- `sidewise init`'s final `next:` line points at `sidewise agent` — the minimum an agent needs (its enforced
  rules and good/bad patterns) before writing a first real request — rather than inviting one straight off; if
  any step above logged a `✖ problem` line, `next:` never claims the setup is usable, instead pointing back at
  the fix and at re-running `sidewise init`. [C-176]
- `sidewise uninstall` reverses init, by default acting only on the current project: the Claude Code plugin's
  project-scope install, and (asked, default **no** — it's the user's run history) that project's
  `.sidewise/`. The per-user parts — the stored key and the CLI itself — are only touched with `--all`, which
  then also reaches every plugin scope found plus the `mvp-scale` marketplace and the plugin cache dir it left
  behind; the CLI step uses whichever install mode `sidewise init` recorded in
  `~/.config/sidewise/install.json` (which holds no secrets), or prints the exact commands to run by hand when
  there's no record. `--yes` takes the default answer everywhere: yes for removal steps that run, no for
  `.sidewise/`. `--keep-key`/`--keep-data` skip their step outright, with no question asked. [C-100]
- `.sidewise/` carries its own `.gitignore` (`*`), created the first time anything writes into it — the ledger,
  the budget file, the id index, or `sidewise init`'s own explicit project step — so a project that never ran
  `init` is still covered on its very first run, not committing its run history by accident. [C-101]
- `sidewise doctor`'s `project:` line names the project root and whether the Claude Code plugin is enabled for
  it — true for a project-scope install (checked from wherever this process runs, which is how Claude Code's
  own project scope is itself resolved), for a user-scope install (it covers every project, this one included),
  and, best-effort, for a local-scope install too (`claude plugin list --json` carries no per-entry project
  path to check against, so local scope is treated the same permissive way as project scope rather than guessed
  at further) — separately from the `plugin:` line's overall install state. Using Sidewise is always scoped to
  a project, so this is the answer that actually matters day to day. [C-102]
- The Claude Code plugin bundles a stdio MCP server (`sidewise mcp`, hand-rolled, no SDK dependency) with one
  tool, `sidewise`, taking `{ args: string[], stdin?: string, project?: string }`. It runs exactly what
  `sidewise <args…>` would run, in-process, treating `stdin` as what real stdin would have supplied, and
  returns the same text output the CLI would print plus the exit code as `isError` (true when the exit code
  isn't 0) — there is no second contract. [C-103]
- The `sidewise` tool's own description opens with a directive, not a description: "First call args:
  ["agent"] to learn the commands and rules, then args: ["agent", "<command>"] before writing a request." —
  ahead of what the tool otherwise does (runs any CLI command in the project). The description is the first,
  and sometimes only, text a cold agent reads before its first call, so it has to name `agent` itself rather
  than assume the agent already knows to ask for it. [C-186]
- Every tool call runs through the same error normalization the real CLI entrypoint uses, so a thrown
  provider, budget, ledger or usage error comes back as one clean `✖ field: problem → fix` line in the tool
  result's `isError` text — never a doubled `✖ sidewise: ✖ field: ...` prefix. [C-140]
- The `project` argument, when given, runs that one call against `project` as `SIDEWISE_HOME` instead of the
  server's own working directory — for a nested project the plugin's own cwd doesn't reach. Omitted, behavior
  is unchanged. [C-142]
- A run or outcome made through the plugin is recorded under `claude`, not the literal `agent`, when
  `SIDEWISE_ACTOR` isn't already set: the MCP server never infers an identity from the project's git config —
  doing so would attribute the call to whoever's git identity is configured there, typically the human owner,
  not the agent making the call. An explicit `SIDEWISE_ACTOR` always wins over this default, and `sidewise
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
- With no key configured, `doctor`'s `key:` line and `sidewise agent`'s overview (one extra `run:` line at the
  end, only when there is no key) both say how to add one, from the same plugin-context check: inside the
  plugin's own bundled MCP server (`CLAUDE_PLUGIN_ROOT` set in the process environment — present there and
  nowhere else, per Claude Code's plugins-reference docs) the hint is `/plugin → Sidewise → Configure → press
  Enter on "TypeSafe API key", paste, Enter, Save configuration`; outside it (a bare terminal, or another MCP
  client) the hint stays `sidewise init` to add one. [C-190]
- Node ≥ 22.13 is a hard requirement, checked once at the top of the CLI's whole dispatch —
  before any command does anything real, and again inside `sidewise mcp` for every `tools/call`. On an older
  Node, every command exits 2 with exactly `✖ node: v<version> is too old → install Node 22.13 or newer (it
  powers the ledger index); https://nodejs.org`, except `doctor`, which still runs (free, no call) and shows
  `node: v<version> ✖ too old → install Node 22.13+` and `index: none (needs Node 22.13+)` in its own output
  before it, too, exits 2 rather than 0. `sidewise mcp` still answers `initialize`/`tools/list` on too old a
  Node — a client's handshake never hangs — but every `tools/call` comes back `isError: true` with that same
  line, whatever command was actually asked for (`doctor` included): the guard runs before the requested
  command ever does. [C-106]
- The linear, in-memory fallback in the id index (`ledger/index.ts`) is no longer a normal production mode: it
  still runs, unchanged, when an actual SQLite call throws on a good Node (a corrupt or mid-write `index.db` —
  self-heal's own resilience, unrelated to Node version), but when `node:sqlite` is genuinely unavailable (a
  real Node < 22.13), the index throws a `LedgerError` naming the same Node requirement instead of silently
  degrading. This is a backstop independent of the CLI's own guard (C-106): a library consumer that reaches the
  ledger directly, without going through `sidewise`'s dispatch, gets the same loud failure rather than a
  quietly slower, never-persisted index. [C-107]
