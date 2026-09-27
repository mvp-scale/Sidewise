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
| wise | `stage` | `design` · `build` · `review` · `pre-merge` · `post-fix` · `release` |
| wise | `change` | `feature` · `fix` · `refactor` · `dependency` · `config` |
| wise | `risk` | `low` · `medium` · `high` |
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
`wise.stage` is one of `design`, `build`, `review`, `pre-merge`, `post-fix` or `release`. [C-108]
`wise.change` is one of `feature`, `fix`, `refactor`, `dependency` or `config`. [C-109]
`wise.risk` is one of `low`, `medium` or `high`. [C-110]

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
Every stop a request can trigger — a parse error, a validation stop, or a bad `where`/git path — ends with
`→ see: sidewise help <verb>`, naming the verb that was actually run, on top of whatever it already told you
to fix. [C-153]

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
(class, scan, drill, loop, change) — so a rehearsal answer is never mistaken for real evidence. [C-092]
A missing `.sidewise/budget.json` is created with the defaults ($5.00, 500 runs) the first time any of those
verbs preflights a call; that same run's `notes:` says so (`budget file created with defaults ($5.00 · 500
runs)`), once, since every later run finds the file already there. [C-093]
On TypeSafe's direct route, which reports no cost of its own, a run whose answering model has a published
rate (today, only `jev-1.13.0`, at $42 per billion input tokens; output tokens are free) is charged an
estimate from its input tokens instead of showing $0.00, and `notes:` says `cost estimated from tokens (no
live pricing reported)` so it's never mistaken for a figure TypeSafe itself reported. A model with no
published rate keeps its cost unreported, never guessed at; a cost the gateway route did report always wins
over the estimate. Every verb that calls the classifier (class, scan, drill, loop, change) does this the same
way. [C-132]
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
never been asked here. There is no `best` field yet: nothing ranks "the question set with the best record
here," even for a category whose fix was later recorded `held`. [C-052]
`next` is `sidewise view <reuse>` when there's an exact reuse, to read that answer; otherwise it's `sidewise
class`, and your categories become the first pattern here. [C-053]
`wise: {recorded: none}` always, and view writes nothing to the ledger — no call, no spend, and its lookups
are not logged either. `notes: [free]`. [C-054]
Given a folder, a tag, or a run id instead of a request body, view answers in place/id mode, which is Plan
1's own text history rather than the YAML `side:` shape above: for a place, a count line (held / overruled /
failed / open, with rehearsal runs counted apart) followed by its newest runs, newest first; for a run id,
that run's lineage up and down. [C-055]
A scan/loop/drill sweep run's own `where` is always empty (its questions are asked per item, not per
request); its real code locations and category tags are indexed from its items' own units and layers
instead, so `view <folder>` and `view <tag>` find a sweep run the same way they already find a class/change/
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
  leaks:     {gate: unsure, 7: 0.55, 8: 0.20}
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
When any question's answer was reused (whole or in part) from an earlier run, the response names which one:
`reused: [SW-####, ...]`, sorted and deduplicated, right after `escalate:`. The field is left out entirely
when nothing was reused. [C-130]
When a question is asked fresh (not reused) but an earlier run already answered the exact same question text
at an overlapping place on code that's since changed, the response's `notes:` says so — `stale: SW-#### answered
"<question, clipped>" on older code (p <its P(yes)>)` — up to 3 such notes, one per older run. This is scoped to
`class` only for now. [C-160]

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

```yaml
side:
  id: SW-0052
  gate: fail                       # access regressed even though it (and the goal) grade pass on their own
  goal: {gate: pass, p: 0.81}
  injection: {before: fail, after: pass, fixed: [1, 2, 10]}
  guards:    {before: pass, after: pass}
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
Called as `sidewise change --parent SW-#### --compare <before>..<after>` (no request file), the goal asked is
the parent run's own goal, not a fixed placeholder. [C-066]
The plan is for whether the yardstick predicted correctly to feed a ranking: a category that said `fail`
and was later `fixed` and proven would count as a hit. **Not shipped yet**: there is no hit count anywhere
in the ledger record (`ContractRun` carries no field for it), and recording a fix's outcome as `held`
changes nothing about what `view` shows for that category afterward — the same gap as `view`'s own missing
`best` field (above). [C-067]
`change` reads git in the repo that actually contains each compared file — its own nearest `git rev-parse
--show-toplevel`, not only the Sidewise project root — so a file whose own repo is nested one level down (a
monorepo package, a vendored project) is no longer invisible to it. [C-147]
Like `class`, `change` names which prior runs its answers came from (`reused: [ids]`) when anything was
reused, and its `--dry-run` predicts that reuse the same way `class`'s does. [C-152]

---

## scan

**Wise × Know: where in this code should we look?** A sweep across code, read by us. [C-068]

**When:** a new codebase, a release check, a PR's changed files, or a vague bug with no location yet. [C-069]

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
`index.js`, `main.js`, `config/**`, `.env*`) that exists in the project but sits outside every `over:`
pattern — a scan only ever reads what `over:` names. [C-146]
A fully-reused scan is never blocked by an already-reached budget cap (see the dry-run/reuse rules above). [C-150]

---

## drill

**Wise × Judge: why did this one thing fail?** It goes down from one item in a parent run. [C-074]

**When:** after a `fail` or `unsure` from class, scan, loop or change. [C-075]

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
the next layer down under it; the response is shaped like scan's, worst first. [C-076]
On a one-subject parent (class, change, or an earlier one-subject drill), `from:` names a category instead;
new, narrower questions go under `ask:` inside it, and the response has the same shape as class's, including
consensus and escalate. [C-077]
drill's own `next:` never points at drilling further: on a one-subject parent it says to fix it, then
`change` against the parent; on a sweep parent it says to fix it and run this same drill again, since
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
`sidewise report history` merges, newest first: every `change` run's own result against its parent, named
`fixed` or `regressed` (the same priority `change`'s own gate uses — any regression wins over any fix; a
change that moved nothing gets no row), with every recorded outcome. Neither is a new ledger write — both are
derived, read-side, from records the commands already wrote. [C-165]
Every view caps its rows and says plainly how many more exist (`… N more not shown`) rather than dropping them
silently, the same idiom `view` already uses — `report` takes no option to raise it. [C-166]
An unrecognized view name is a clean stop naming the three real ones. [C-167]

---

## help and template

`sidewise help` (free, no project needed) prints a one-screen contract card: the six verbs, the rules that
cause most first-try rejects, and how to read a verdict. [C-113]
`sidewise help <verb>` (view, class, change, scan, drill, loop) prints that verb's purpose, when to use it,
one annotated example, and its own sharp rules. [C-114]
Per-verb sharp rules `help` carries: `drill` says to follow `next:` rather than hand-authoring parent/from;
`change` says the files must be committed at the ref it names; `scan` says a `scale` question ranks findings
by severity, worst first, and to scan by file when the file is the unit that matters; `loop` says a sub-layer
is a sibling key under `over:`, names are ≤ 20 characters with no `/`, and every question under a layer is
asked of every item at that layer. [C-115]
`sidewise help <topic>` covers `authoring`, `verdict`, `wise` and `reuse` — cross-cutting rules that don't
belong to one verb. [C-116]
`sidewise help wise` lists all five catalog fields (`why`, `area`, `stage`, `change`, `risk`) with their closed
values and what each is for. [C-117]
An unknown `help` target is a clean stop naming every real verb and topic. [C-118]
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
`sidewise help report` is its own recognized target, not one of the six verbs (`report` is outside the 2x3
Know/Judge/Prove grid) and not a cross-cutting topic: purpose, an example and its own sharp rules, the same
shape as `help <verb>`. [C-161]

---

## Setup, keys and the MCP tool

- `side.verb` is optional. The tool name wins, and a mismatch is sent back. [C-085]
- `depth` counts yes/no questions only; scale and choice don't count. [C-086]
- Nested items use `- name: <item>` plus child layers beside it, which is what agents write naturally.
  Different items may have different child layers. [C-087]
- `--dry-run` (class, change, scan, drill, loop) reports the calls and question count with no call and no
  spend, as `plan: {calls, questions, ...}` followed by `notes: ["dry run: no call, no spend"]`. [C-088]
- `--dry-run` resolves reuse first and predicts it: `calls`/`questions` count only what would still need
  asking, and `plan.reused` is how many of the request's questions (or, for a sweep, items) would come from
  the ledger for free — the same prediction every verb's real run would make. `dryRunText`'s notes always
  start with `"dry run: no call, no spend"`; a verb may append further notes after it (never before, never in
  place of it) — e.g. a budget-cap warning when the request would still need to call the classifier and the
  cap is already reached: `"would be blocked: the budget cap is already reached"`, without the dry run itself
  failing or spending anything. [C-131] [C-134]
- A run whose every answer is reused from prior runs is never blocked by an already-reached budget cap, on
  any verb: the cap is checked only when the run would actually need to call the classifier — reuse only
  skips the *spend* gate, never the *ledger* one (the ledger must still read cleanly and accept the new line
  either way). [C-136] [C-149] [C-150] [C-151] [C-152]
- `sidewise budget`'s cap-reached message points at the fix that actually applies: `sidewise budget set
  --runs <n>` when only the run cap tripped (the dollar cap has room left), `sidewise budget reset` whenever
  the dollar cap is involved, alone or together with the run cap. [C-133]
- `change --dry-run` reads both git refs before answering: a nonexistent or mistyped `before`/`after` ref
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
- `sidewise doctor` names where a resolved key came from (`key: yes · from OS keychain (encrypted, per user)`,
  `from user file <path> (0600, not encrypted)`, or `from env TYPESAFE_API_KEY`, with `(overrides stored)` when
  a stored key also exists but env won), or `key: no → run "sidewise init" to add one`; the env file gets its
  own warning line if its mode is looser than 0600 or it has a line sidewise ignored. It also names the CLI's
  own install (`cli: <path> · installed --<mode> ...`) and the Claude Code plugin's overall state (`plugin:
  sidewise@mvp-scale · <scope> scope`, or `not installed → ...`). [C-098]
- `sidewise init` sets up two things per user, shared across every project — the CLI (`--global`/`--user`/
  `--local`, offering `--user` instead of a sudo-needing global install) and the key (hidden input via
  `node:readline`, never argv; `--key-stdin` for automation, `--no-key` to skip; a sanity check on shape only —
  no live check against TypeSafe) — then, per project, the Claude Code plugin (`--claude`/`--no-claude`,
  `--scope user|project` defaulting to `project`) and the project's `.sidewise/`. Run outside a git project, it
  does only the two per-user steps, then stops with one line pointing the user at cding into a project. It is
  idempotent (a re-run that finds a step already done says so and changes nothing) and interactive by default;
  `--yes` takes the default answer everywhere. Every step prints exactly one line, glyph first: `✔ done`,
  `· already`, `– skipped (why)`, or `✖ problem → fix`. [C-099]
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
- Every tool call runs through the same error normalization the real CLI entrypoint uses, so a thrown
  provider, budget, ledger or usage error comes back as one clean `✖ field: problem → fix` line in the tool
  result's `isError` text — never a doubled `✖ sidewise: ✖ field: ...` prefix. [C-140]
- The `project` argument, when given, runs that one call against `project` as `SIDEWISE_HOME` instead of the
  server's own working directory — for a nested project the plugin's own cwd doesn't reach. Omitted, behavior
  is unchanged. [C-142]
- A run or outcome made through the plugin is recorded under a real actor, not the literal `agent`: when
  `SIDEWISE_ACTOR` isn't already set, the MCP server resolves `git config user.name` in the project directory,
  falling back to `claude` when there's no repo, no git binary, or no name configured. An explicit
  `SIDEWISE_ACTOR` always wins, and `sidewise doctor` shows the actor that will actually be used. [C-143]
- The plugin's own configuration (`userConfig`) offers two masked, optional fields — a TypeSafe API key and an
  AI Gateway key. Leaving both empty means the free fake provider, exactly as on the terminal path. [C-104]
- An empty string substituted for either key (Claude Code's own behaviour for a blank optional value is
  undocumented — it may substitute `""` or omit the variable entirely) counts as no key everywhere key
  resolution happens, and resolution still falls through to the OS keychain or the user credentials file
  rather than treating the empty string as a real, empty key. [C-105]
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
