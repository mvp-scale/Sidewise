---
name: sidewise-probe
description: Use before writing or editing any Sidewise request — a probe, a category, or a template. Teaches the concerns/decisions contract, the three-angle model behind a good probe, and a good/bad example, so a checklist actually gives a calibrated verdict instead of a shrug.
---

Sidewise's `ask:` has two sections. **concerns** are yes/no categories: exactly 3k of them for depth k
(quick=3, standard=6, thorough=9), each with exactly 3 probes. **decisions** are 2-5 scale/choice categories,
with at least one scale (ranks severity) and at least one choice (picks a route). Three angles on one concern
give certainty a single yes/no can't: one probe alone tells you *whether*; three, read together, tell you
*where it would break and how you'd know*.

## A concern is one path; its three probes are three angles on it

Pick the family that matches the category's own path through the code, then write one probe per role:

| Family | Angle 1 | Angle 2 | Angle 3 |
|---|---|---|---|
| injection | reach — does untrusted input get there | guard — is it checked on the way | sink — does it hit an executing/query sink |
| access | actor — whose identity is used | check — is ownership/role verified | resource — what's returned or changed |
| secrets | store — where it lives | transport — how it moves | exposure — where it can surface |
| input | source | validate | reject |
| output | source | encode | render |
| availability | trigger | limit | recovery |
| correctness | input | rule | result |
| design (loop) | responsibility | dependency | testability |
| design-risk | abuse | failure | data |
| done | concrete | testable | owned |

A category's `family:` defaults to its own name when that name is one of the eleven above (`access`,
`injection`, `secrets`, `input`, `output`, `availability`, `correctness`, `design`, `design-risk`, `done`,
`other`) — name the category after its family and you get this for free.

## What makes a probe good

- It could flip the category's gate — if the answer came back the other way, the verdict would change. If not, cut it.
- It plays an angle no other probe in the category plays. Two probes in the same role are a paraphrase: cost, not clarity.
- It's observable in the code shown — a reader can see it, not infer it from runtime behavior or opinion.
- One judgment per probe, one polarity per category (see `sidewise agent probe` / `help probe` for the phrasing rules — length, one sentence, etc.).
- It names the element when more than one could be meant ("the `id` parameter", not "it").

## Bad probes, and why

"Is this method secure?" and "Does this method have security features?" both fail the same way: a yes means
nothing. No mechanism named, no angle, no place to point a fix at. A proxy question fails for a related
reason — "Would a standard security scanner flag this code?" isn't observable in the code itself; it asks the
model to guess what a *different* tool would say.

The fix is three angles, one path:
- reach: `` Is `id` from `req.query` concatenated into the SQL string? ``
- guard: `` Is `id` bound as a parameter instead? `` — note the polarity: here "yes" is the safe answer, the
  opposite of the category's own `pass:`, so it needs its own category or a `need:` that accounts for it.
- sink: `` Does the query run with `db.query` on that string? ``

Each one alone is a fact. Together they say exactly which link in the chain is missing.

## Decisions

Two decisions cover most requests:
- **severity** (`scale:`): concrete levels a reader can picture on their own — `none, low, medium, high,
  critical` — never bare relative points like "medium" with nothing to anchor it.
- **route** (`choice:`): named actions, e.g. `ship, fix, block` — always include a "does nothing" or "none of
  these" option when the code might genuinely need no action.

A third, optional decision worth adding when `where:` might not cover the claim: a scope choice —
`enough, partial, missing` — where `partial`/`missing` is a signal to widen `where:` and ask again, not a
verdict on the code itself.

## wise, in about 70 tokens

Alongside `why`/`area`/`stage` (existing), four more optional fields build a picture the ledger can learn
from: `problem` (one sentence, in your own words, of what you're solving right now), `nodes` (a C4 chain —
`level:name` pairs joined by ` -> `, `; `-separated for more than one path, where level is `person`, `system`,
`container`, `component` or `code`), `touches` (up to 5 short names of the entities/objects involved), and
`blast` (how far a fix's blast radius reaches: `code`, `component`, `container`, `system`, or `person`).

Example:
```yaml
wise:
  why: validate
  problem: The user id from the request reaches a SQL query unchecked
  nodes: container:api -> component:user-handler -> container:db
  touches: [userId, findUser]
  blast: component
```

## One recipe per verb

- **class**: write the concerns/decisions block straight, per everything above.
- **drill**: the parent's three probes on the flagged category become three new concerns here — each of
  those, in turn, gets three fresh angles of its own.
- **scan**: the contract is enforced on the finest layer only. Write it once with `{function}` (or whatever
  the finest layer is called) filled in per item; coarser layers can stay thin.
- **loop**: same as scan, but the finest layer is usually `story` — every question under it is asked of every
  story, so phrase it so that holds.
- **change**: no new `ask:` at all — it replays the parent's own questions. Add `expect:` naming which of the
  parent's concerns this change should turn to pass; the answer grades that prediction.
- **view**: a free draft check. `ask:` is optional and a partial one is fine — use it to see whether what
  you've written so far is well-formed before you spend anything on `class`.

See also: `sidewise agent probe` (terse, no citations) and `sidewise help probe` (the same rules with their
TypeSafe source cited) for the mechanical phrasing rules this skill doesn't repeat — length, ending in `?`,
one judgment, the visible-scope probe.
