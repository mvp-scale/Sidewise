---
name: sidewise
description: Use before merging or shipping a risky change, after a fix to prove it actually worked, when scanning a codebase for a pattern before you know where it lives, or when checking a design or plan before writing code. Turns a short numbered yes/no checklist into a calibrated pass/fail/unsure verdict, reuses answers for unchanged code, and logs every run so weak spots surface over time.
---

Sidewise turns a short numbered yes/no checklist into a calibrated pass/fail/unsure verdict — evidence, never a command. Every request has a `side:` block (**solve it now**: one goal, then plumbing) and an optional `wise:` block (**get smarter**: why you're here, so the ledger learns).

## The six verbs

| Grid | Know | Judge | Prove |
|---|---|---|---|
| **Side** — solve it with what's proven | `view` | `class` | `change` |
| **Wise** — find what's new, and learn it | `scan` | `drill` | `loop` |

- `view` — free: reads the ledger, never calls out. Reach for it before any paid call, when entering unfamiliar code, or to find proven questions.
- `class` — one call, one subject. Reach for it for a decision on one thing: merge, choose, triage, check a fix.
- `change` — replays a parent run's questions across two git refs. Reach for it after a fix, a refactor, or a dependency bump.
- `scan` — a sweep across code that Sidewise reads. Reach for it on a new codebase, a release check, a PR's changed files, or a bug with no location yet.
- `drill` — goes down from one item a parent run flagged. Reach for it after a `fail` or `unsure` from `class`, `scan`, `loop` or `change`.
- `loop` — a sweep across layers of ideas the agent writes. Reach for it on a design, a plan or a feature request, before any code exists.

## Get started

`sidewise template <verb>` prints a filled-in, valid example request for that verb. Edit the `goal`, `where` and `ask`, then pipe or pass it to the verb. `template drill --parent <id> --from <item-or-category>` shapes the sample to that run when it's in the ledger (a sweep parent keeps `over:`; a one-subject parent doesn't and names a category instead) — with no project, or an id it doesn't have, it prints the sweep sample:

```
sidewise class req.yaml
sidewise class -              # or pipe it in on stdin
```

`--dry-run` shows the call and question count with no spend.

With `TYPESAFE_API_KEY` or `AI_GATEWAY_API_KEY` set, calls go to the real classifier. With neither set, every call falls back to the built-in fake provider — free, deterministic, offline, and its answers are canned, not real; every response says so, with `adapter fake · not evidence` in `notes:` (the chaos provider labels itself the same way). `SIDEWISE_PROVIDER=fake|chaos|typesafe` overrides the choice either way.

Two more environment variables matter: `SIDEWISE_HOME=<path>` names the project root explicitly, skipping the
walk up from the current directory for a `.sidewise` or `.git` folder — set it whenever the agent's cwd isn't
the project itself (Sidewise never creates `.sidewise/` on its own outside a real project, so without it in the
wrong cwd every command just fails to find one). `SIDEWISE_ACTOR=<name>` names who's asking; it's recorded on
every run (default: the literal string `agent`) and is exactly what `outcome`'s self-held check compares
`--by` against, so an agent that wants its own runs marked `held` by someone else needs a distinct actor name
per agent, not the same one for all of them.

## A worked example (class)

Request:

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

Response:

```yaml
side:
  id: SW-0001
  gate: fail
  goal: {gate: unsure, p: 0.47}
  injection: {gate: unsure, 1: 0.67, 2: 0.26, 10: 0.60}
  guards: {gate: fail, 3: 0.55, 6: 0.67, 9: 0.05}
  access: {gate: fail, 4: 0.65, 5: 0.90}
  leaks: {gate: fail, 7: 0.51, 8: 0.73}
  severity: {gate: pass, 11: {top: low, p: 0.70}}
  route: {gate: fail, 12: {top: block, p: 0.70}}
  consensus: SPLIT
  escalate: true
wise: {recorded: [why, area]}
next: sidewise template drill --parent SW-0001 --from guards
notes: [adapter fake · not evidence, budget 0% used ($0.00 of $5.00 · 1 of 500 runs)]
```

The `id`, `gate` and probabilities above are one run's illustration, not a guarantee — they'll differ every time you run it.

## Grading

- The bar: `pass: yes` clears at P(yes) ≥ 0.70; `pass: no` clears at P(yes) ≤ 0.30. There's no averaging.
- `need`: `all` (default — every answer clears) · `most` (≥ ⅔ clear, none a clear miss) · `any` (at least one clears).
- `escalate: true` on SPLIT or WEAK consensus, `depth: thorough`, or a goal that looks irreversible (delete, deploy, drop, pay, migrate, secret).

## Stops and exit codes

- A rejected request always reads `✖ field: problem → fix` (exit 2).
- Exit codes: `0` ok · `1` provider or ledger error · `2` invalid request or usage · `3` budget blocked.

## outcome and budget

`sidewise outcome <SW-####> held|overruled|failed --by <actor>` records what happened to a run, so weak spots
can roll up later. The agent that asked the run can't mark it `held` itself — that stops at exit 1, naming
another agent or the owner as the one who can; `overruled` and `failed` have no such restriction. Recording
the exact same outcome, by the exact same actor, again is a no-op: exit 0, and the confirmation says "already
recorded by <actor>" instead of adding a second line.

`sidewise budget show` (the default with no subcommand) prints the current spend and run count. `sidewise
budget reset` zeroes the spend and run count but keeps the current caps — nothing in the code stops any agent
from running it, but by convention only the project owner does. `sidewise budget set --usd <n> --runs <n>`
changes either or both caps without touching the spend already counted; the defaults are $5.00 and 500 runs.
Any verb that would go over either cap stops at exit 3 before it spends anything.

## More

The exact field rules are in `references/request.schema.json`; one starting example per verb is in `templates/*.yaml`.
