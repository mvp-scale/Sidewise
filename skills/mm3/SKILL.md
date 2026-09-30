---
name: mm3
description: Use before merging or shipping a risky change, after a fix to prove it actually worked, when scanning a codebase for a pattern before you know where it lives, or when checking a design or plan before writing code. Turns a short numbered yes/no checklist into a calibrated pass/fail/unsure verdict, reuses answers for unchanged code, and logs every run so weak spots surface over time.
---

## Use MM3 in every beat

MM3 works in three beats; use it in every one. The ledger is the record of what you learned and proved.
- Know: map the codebase before the goal. `view` first (free), then `scan` or `class` its layers, tagging each request with its C4 chain (`mdl.uses`).
- Know ends with `mm3 report graph`: the map, and where the goal touches it.
- Judge: check the plan and a yes/no definition of done with MM3 before code: `loop` the plan, `class` the checks, `drill` anything unsure or failing (follow `next:`), fix, recheck.
- Prove: after the change is committed, `replay --parent <id> --compare <before>..HEAD` shows what flipped to pass and what regressed; `class` alone is not proof of a change.
- Cite the run ids behind each claim. Run `mm3 agent <verb>` before writing a request.

## What MM3 is

MM3 turns a short numbered yes/no checklist into a calibrated pass/fail/unsure verdict — evidence, never a command. Every request has a `mak:` block (**make**: the request itself, one goal, then plumbing) and an optional `mdl:` block (**model**: why you're here, so the ledger learns). The six verbs split into MAK³ (use what is proven: `view`, `class`, `replay`) and MDL³ (learn what is missing: `scan`, `drill`, `loop`), each across Know, Judge and Prove.

## Run this first

Run `mm3 agent` first: it names every command an agent needs — the six verbs plus `report`, `outcome`, `budget`, `template` — and the universal rules, in one dense, no-prose card. Then run `mm3 agent <command>` before writing a request: a verb's own card is its enforced rules and good/bad examples; a tool's is its syntax and a good/bad pair. `mm3 help` is the human-readable version of the same contract: a one-screen card, plus `help <verb>` (view, class, replay, scan, drill, loop) and `help <topic>` (authoring, verdict, mdl, reuse) going deeper — both free, no project needed. `mm3 report [hits|patterns|history]` reads back what the ledger has learned across every place so far — free, no options beyond the view name; a read tool, not a seventh verb.

## Invoke it

In Claude Code, call the `mm3` MCP tool directly — same args as the CLI (e.g. `args: ["class", "-"]`), the request YAML as `stdin`. There is no CLI on PATH; don't look for one. `doctor` through the tool shows where its key comes from, never the key itself.

Elsewhere, find the command before you use it: use `mm3` if it's on PATH, else `npx --no-install mm3`; if neither works, tell the user to run `npx @mvpscale/mm3 init` in this project, and stop — never install anything on the user's behalf.

## Get started

`mm3 template <verb>` prints a filled-in sample with its rules as YAML comments — edit `goal`, `where` and `ask`, then run it. `view <request-file>` checks for a free, reused answer first; `--dry-run` validates and counts questions with no spend. The exact field rules are in `references/request.schema.json`; a sample per verb, plus common patterns, is in `templates/*.yaml`.
