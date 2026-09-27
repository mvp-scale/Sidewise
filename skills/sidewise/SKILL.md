---
name: sidewise
description: Use before merging or shipping a risky change, after a fix to prove it actually worked, when scanning a codebase for a pattern before you know where it lives, or when checking a design or plan before writing code. Turns a short numbered yes/no checklist into a calibrated pass/fail/unsure verdict, reuses answers for unchanged code, and logs every run so weak spots surface over time.
---

Sidewise turns a short numbered yes/no checklist into a calibrated pass/fail/unsure verdict — evidence, never a command. Every request has a `side:` block (**solve it now**: one goal, then plumbing) and an optional `wise:` block (**get smarter**: why you're here, so the ledger learns).

## Run this first

Run `sidewise agent <verb>` first: a dense, no-prose card of that verb's enforced rules and good/bad examples, built for an agent about to write a request. `sidewise help` is the human-readable version of the same contract: a one-screen card, plus `help <verb>` (view, class, change, scan, drill, loop) and `help <topic>` (authoring, verdict, wise, reuse) going deeper — both free, no project needed. `sidewise report [hits|patterns|history]` reads back what the ledger has learned across every place so far — free, no options beyond the view name; a read tool, not a seventh verb.

## Invoke it

In Claude Code, call the `sidewise` MCP tool directly — same args as the CLI (e.g. `args: ["class", "-"]`), the request YAML as `stdin`. There is no CLI on PATH; don't look for one. `doctor` through the tool shows where its key comes from, never the key itself.

Elsewhere, find the command before you use it: use `sidewise` if it's on PATH, else `npx --no-install sidewise`; if neither works, tell the user to run `npx @mvpscale/sidewise init` in this project, and stop — never install anything on the user's behalf.

## Get started

`sidewise template <verb>` prints a filled-in sample with its rules as YAML comments — edit `goal`, `where` and `ask`, then run it. `view <request-file>` checks for a free, reused answer first; `--dry-run` validates and counts questions with no spend. The exact field rules are in `references/request.schema.json`; a sample per verb, plus common patterns, is in `templates/*.yaml`.
