---
name: sidewise-probe
description: Use before writing or editing any Sidewise request — a probe, a category, or a template. Teaches which yes/no questions are worth asking (three angles per concern, one role table per family) and which are empty ("is this secure?"), plus the decisions/wise fields that make a request worth reusing.
---

A Sidewise request is only as good as its questions. The schema (`references/request.schema.json` in the `sidewise` skill) enforces the *shape* — exact counts, one kind per category, numbered with no gaps. It cannot tell a sharp question from a vacuous one. This skill teaches the difference before you write either.

Read this before filling in `ask:` on a template — `sidewise template <verb>` gives you the plumbing; this gives you the questions.

## The contract in one screen

`ask:` has two sections:

- **concerns** — exactly `3k` categories for depth `k` (quick=1 → 3 categories/9 probes, standard=2 → 6/18, thorough=3 → 9/27), each with **exactly 3 yes/no probes**.
- **decisions** — 2–5 categories, scale or choice only, at least one of each kind. These don't count toward depth.

Why exactly 3 probes, never 1? A single yes/no like "is this handler secure?" can't disagree with itself — there's nothing for `need:` to weigh, and nothing tells you *where* it fails if it does. Three probes that each check a different point on the same path can disagree, and when they do, that disagreement is the finding: reach and sink both read unsafe while guard reads safe is a very different result from all three reading unsafe. One question gives you a verdict with no evidence behind it; three angles give you a verdict you can act on.

## A concern is one path; its three probes are three angles on it

Pick a **family** for the concern (an optional field, defaulting to the category name when that name is itself one of the eleven: `access · injection · secrets · input · output · availability · correctness · design · design-risk · done · other`). Each family has its own three roles — the three places along that concern's path where something can go wrong:

| family | role 1 | role 2 | role 3 |
|---|---|---|---|
| injection | reach — does untrusted input get here | guard — is it checked on the way | sink — does it hit a sink that runs or queries it |
| access | actor — whose identity is used | check — is ownership/role verified | resource — what's returned or changed |
| secrets | store — where it lives at rest | transport — how it moves | exposure — where it can surface |
| input | source — where the value comes from | validate — what's checked before use | reject — what happens when it fails |
| output | source — what data feeds the response | encode — is it escaped/encoded for its context | render — where and how it's emitted |
| availability | trigger — what can invoke the costly path | limit — is there a cap or throttle | recovery — what happens when it's exceeded or fails |
| correctness | input — what the function receives | rule — the specific rule it must satisfy | result — what it actually returns/does |
| design | responsibility — what this piece owns | dependency — what it relies on | testability — can it be verified in isolation |
| design-risk | abuse — how it could be misused | failure — how it degrades or breaks | data — what it stores or exposes it shouldn't |
| done | concrete — specific and scoped | testable — has a checkable definition | owned — has a named owner |
| other | — | — | — |

`other` has no fixed roles: it's the escape hatch for a concern that doesn't fit the ten above. Still write three distinct, observable probes — just name the three roles yourself instead of borrowing one of the rows.

A good category names one of these families explicitly (`family: injection`) whenever its own name doesn't already match one of the eleven — a category named `reach`/`guard`/`sink` (common in `drill`, where the parent's angles each become their own concern) still belongs to the `injection` family, it just isn't spelled that way in the category name.

`references/probe.md` in this skill has a full good/bad pair for every family above.

## What makes a good probe

1. **It could flip the gate.** If the answer came back the other way, the category's verdict — and what you'd do next — changes. If nothing would change, cut it.
2. **It plays a role no sibling probe plays.** Two probes in the same role are a paraphrase of each other: cost with no added clarity.
3. **It's observable in the code you sent.** A reader can point at the line that answers it — not infer it from how the code behaves at runtime, and not offer an opinion about it.
4. **One judgment.** Don't chain two questions with "and" — that's two probes wearing one number.
5. **One polarity per category.** Every probe in a category answers the same direction for `pass:` — don't mix "is it unsafe" with "is it free of X" in one category.
6. **Names the element when more than one could be meant** — `` `id` `` or `` `req.query.id` ``, not "the value," when the code shown has several candidates.

## Bad probes, and why

"Is this method secure?" and "Does this method have security features?" both fail rule 3 above: neither names a mechanism, a role, or a place to check. A "yes" to either proves nothing — there's no code line that makes it true or false, so the model is really just guessing at a vibe. The same failure shows up in a subtler form: "Would a standard security scanner flag this code?" sounds concrete, but it isn't observable in the code itself — it's a guess about a *different* tool's behavior, not a fact about this one.

The fix is to split by role. Instead of one opinion question about an injection concern:

- **reach**: "Is `id` taken from `req.query` and passed to `findUser` without validation?"
- **guard**: "Is `id` bound as a parameterized argument rather than concatenated into the query string?" (note the flipped polarity from reach/sink — say so in the category's `pass:`)
- **sink**: "Does `findUser` run the query with `db.query` on that string?"

Each one names a variable, a function, and a line a reader can actually check. None of them ask for an opinion.

## Decisions: severity, route, and the optional scope check

Every request's decisions section needs at least one **scale** and one **choice**. Two patterns cover almost every request:

- **severity** (scale): concrete levels a reader can place a finding at without comparing it to its neighbors — `none, low, medium, high, critical`, each meaning something specific on its own (e.g. "critical: exploitable with no auth"), not just "worse than the one before it."
- **route** (choice): what should happen next, always including the "nothing to do" option — `ship, fix, block` (`ship` *is* the none-needed answer; there's no separate "none" entry needed when one option already means that).

A third, optional pattern is worth adding to `class`/`scan` whenever the code you sent might not be the whole picture: a **scope** choice, `enough, partial, missing` — `partial`/`missing` are both a signal to widen `where:` and re-run, not to trust the verdict as-is.

## wise in about 70 tokens

`wise:` never reaches the classifier — it's free context the ledger learns from. Beyond the older `why`/`area`/`stage`/`change`/`risk`/`parent` fields, four more describe *what* you believe, in your own words:

- `problem` — one line: what you're actually solving right now.
- `nodes` — a C4 chain, `level:name -> level:name`, levels from `person · system · container · component · code`; multiple chains joined by `; `.
- `touches` — up to 5 short entity/object names this run is about.
- `blast` — how far a fix's effect reaches: `code · component · container · system · person`.

Example, on a run fixing an injection flaw in a user-lookup handler:

```yaml
wise:
  why: validate
  problem: Removing the SQL injection in findUser flagged by an earlier scan
  nodes: container:api -> component:user-handler -> container:db
  touches: [userId, findUser]
  blast: component
```

## One recipe per verb

- **class** — one subject, the full contract: `3k` concerns categories × 3 angles, plus decisions. Name the file and line range in `where:`; name the element in a probe whenever `where:` covers more than one file.
- **drill** — starts from one flagged concern or item, never cold. The parent's 3 angles each become their own new concern here, re-probed 3 ways of their own — going from "the injection concern failed" to "specifically the guard step failed, at this call."
- **scan** — one concerns/decisions block, written once with a `{blank}` for the finest layer (e.g. `{function}`), applied to every item that layer sweeps. Add a severity scale to rank findings worst-first.
- **loop** — the deepest layer (e.g. `story`) carries the full contract; `design`/`design-risk`/`done` fit an idea better than code-specific families like `injection`/`secrets`.
- **change** — no new probes at all: it replays the parent's exact questions on two git states. The only new field is `expect:`, your own prediction of which parent concerns should flip to pass.
- **view** — a free, no-spend check of a draft's `ask:` against everything above, before you pay for a real run.

`sidewise agent probe` (and `sidewise help probe`) carry the enforced phrasing rules this skill builds on, cited to their TypeSafe source pages, plus this same role table and good/bad pair in a dense, no-prose form.
