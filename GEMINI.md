# Sidewise — for Gemini CLI

This is the same guidance Claude Code gets automatically from the `sidewise` plugin skill.

Sidewise turns a short numbered yes/no checklist into a calibrated pass/fail/unsure verdict — evidence, never a command. Every request has a `side:` block (**solve it now**: one goal, then plumbing) and an optional `wise:` block (**get smarter**: why you're here, so the ledger learns).

## Run this first

`sidewise help` prints a one-screen contract card: the six verbs, the rules that cause most first-try rejects, and how to read a verdict. `sidewise help <verb>` (view, class, change, scan, drill, loop) and `sidewise help <topic>` (authoring, verdict, wise, reuse) go deeper — both free, no project needed.

## Invoke it

In Claude Code, call the `sidewise` MCP tool directly — same args as the CLI (e.g. `args: ["class", "-"]`), the request YAML as `stdin`. There is no CLI on PATH; don't look for one. `doctor` through the tool shows where its key comes from, never the key itself.

Elsewhere, find the command before you use it: use `sidewise` if it's on PATH, else `npx --no-install sidewise`; if neither works, tell the user to run `npx @mvpscale/sidewise init` in this project, and stop — never install anything on the user's behalf.

## Get started

`sidewise template <verb>` prints a filled-in sample with its rules as YAML comments — edit `goal`, `where` and `ask`, then run it. `view <request-file>` checks for a free, reused answer first; `--dry-run` validates and counts questions with no spend. The exact field rules are in `references/request.schema.json`; a sample per verb, plus common patterns, is in `templates/*.yaml`.
