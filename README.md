# MM3

**A Knowledge One system: use what is proven, learn what is missing, and keep everything it teaches you.**

MM3 gives coding agents a cheap, calibrated side-question. The agent writes a short numbered yes/no checklist on one focus. A small classifier answers it, and MM3 returns a six-line consensus: how strongly the evidence agrees, which way it leans, and where the concern is. Every run and its outcome goes into a local log, so over time MM3 can show you where your agents keep going wrong.

## Two modes, three jobs

**MAK³** (make) uses what is proven. **MDL³** (model) learns what is missing. Each works across the same three jobs, **Know, Judge, Prove**, and the power of three is the point: six verbs, one knowledge system.

| | **Know** | **Judge** | **Prove** |
|---|---|---|---|
| **MAK³** · use what is proven | `view` | `class` | `replay` |
| **MDL³** · learn what is missing | `scan` | `drill` | `loop` |

> **Status: pre-release.** The package, plugin and install flow are under active development. Nothing is on npm yet. Watch the repo or check back for `@mvpscale/mm3@nightly`.

## Why

- **Compact by default, expands on demand.** A short checklist goes in, a ≤ 6-line answer comes out, and you open the detail only when you need it.
- **Cheaper than a second full-context review.** A decomposed checklist goes to a small classifier. No subagent has to re-read the whole task.
- **Consensus, never a command.** You get agreement strength and a lean; the agent decides.
- **Irreversible stays human.** Delete, deploy, drop and pay are always the agent's or owner's call.
- **Every answer gets graded.** Outcomes (held · overruled · failed) are logged next to the question that produced them.
- **It finds what your agents are bad at.** Overruled, failed and split answers roll up into weak spots, but only with enough evidence to be believed.
- **Budgeted, no surprises.** A hard spend cap that only you reset. It fails closed.
- **Runs where your agents run.** One CLI and one MCP server: a one-command plugin for Claude Code, a `GEMINI.md` for Gemini CLI, and a standard MCP server any MCP client (Cursor, VS Code/Copilot, ...) can point at.

## What a run looks like

Every request has a `mak:` block (**make**: the request itself, one goal, then plumbing) and an optional `mdl:` block (**model**: why you're here, so the ledger learns). The blocks are the same on every verb; the verb you run, not the key, decides whether it is a MAK³ or an MDL³ move. `class` — one call, one subject — is the simplest of the six verbs; run `mm3 help` for all six and how they fit together.

Request:

```yaml
mak:
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
mdl:
  why: validate
  area: data
```

Response:

```yaml
mak:
  id: MM3-0042
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
mdl: {recorded: [why, area]}
next: mm3 template drill --parent MM3-0042 --from injection
notes: [budget 1% used ($0.02 of $5.00 · 3 of 500 runs)]
```

The numbers above are one run's illustration, not a guarantee — the real classifier's actual answer varies.

## Install

Requires Node 22.13 or newer — it's what the ledger's `node:sqlite` index runs on. The CLI checks this itself and stops with a clear message on anything older (`mm3 doctor` reports it too, and still runs on an old Node so you can see what's wrong).

**Claude Code: install the plugin and set your key in its options, that's all.**

```
/plugin marketplace add mvp-scale/Sidewise
/plugin install mm3@mvp-scale
```

Claude prompts for a TypeSafe API key (masked, optional — leave it empty to use the free fake provider):

1. Press Enter on "TypeSafe API key", paste your key, press Enter, then choose "Save configuration".

The plugin bundles its own CLI and its own MCP tool; nothing else to install, no npm, no PATH. Want the AI Gateway route instead? The plugin's config only offers the TypeSafe key — set `AI_GATEWAY_API_KEY` in your own environment; the CLI reads it the same way it always has. Testing from a clone of this repo: `/plugin marketplace add /path/to/your/clone` instead of the GitHub form.

`/plugin` defaults to installing at **user** scope (every project); MM3 is scoped per project, so pick **project** scope in the prompt if you can, or run `mm3 init --scope project` afterward to fix it — `mm3 doctor` names the scope it finds and nudges you if it's user-only.

**Everyone else (a bare terminal, Codex, Gemini CLI, ...):** run this inside the project you want MM3 in:

```bash
npx @mvpscale/mm3 init
```

`init` does four things and says what it did at each step, one line apiece:
- It puts the `mm3` command on your PATH. You choose global, `--user` (under `~/.local`, no sudo) or `--local` (this project only, run as `npx mm3`). It never runs sudo.
- It asks for your TypeSafe API key, with the input hidden, and stores it per user: the OS keychain first, otherwise `~/.config/mm3/env` (mode 0600). Press Enter to skip and use the free fake provider.
- It enables the Claude Code plugin for this project, if `claude` is on your PATH.
- It sets up `.mm3/`, this project's run history, which git ignores.

Re-running `init` changes nothing that's already right. In a second project it only enables that project. `mm3 uninstall` reverses it for this project; add `--all` to also remove the key and the CLI.

**Just the CLI:** `npm install -g @mvpscale/mm3` (global; may need sudo), `npm install -g --prefix ~/.local @mvpscale/mm3` (no sudo; `~/.local/bin` must be on PATH) or `npm install -D @mvpscale/mm3` (this project; run `npx mm3`). Then add a key with `mm3 init`, or `export TYPESAFE_API_KEY=…`.

`mm3 doctor` says where the key came from (`from OS keychain`, `from user file …`, `from env …`), never the key itself.

### From a local build

In a clone of this repo:

```bash
npm install
cd /path/to/your/project && npm --prefix /path/to/MM3 run dev:install
```

`dev:install` builds, packs a tarball, and runs `init` from that tarball in the directory you ran it from, so a local build installs exactly the way the published package does.

## Quickstart

Every command below runs unmodified, in order, against a fresh project — `mm3 template class` already asks about the first three lines of `src/user.ts`, so nothing needs editing before `mm3 class` sends it. In a real project, edit the `goal` and `ask` first.

With no `TYPESAFE_API_KEY` or `AI_GATEWAY_API_KEY` in the environment, this runs on the built-in fake provider — free, deterministic, offline, and its answers are canned, not real. Set one of those keys for real answers (or `MM3_PROVIDER=fake|chaos|typesafe` to choose explicitly).

```bash
# mm3-quickstart
mm3 template class > review.yaml
mm3 class review.yaml
mm3 view src
mm3 report
mm3 outcome MM3-0001 held --by you
mm3 budget
```

Run `mm3 doctor` any time to check which provider, route and base URL a call would use, whether a key is
set (never its value), and whether a project and its ledger are found — free, no call, no spend. Set
`MM3_BASE_URL=<url>` to point at a proxy or a self-hosted mirror instead of TypeSafe's own endpoint
(`https` required, except `http` for `localhost`/`127.0.0.1`/`[::1]`). A 429 or 529 from TypeSafe is retried
automatically, up to twice more; a 401 or 422 never retries.

`mm3 report [hits|patterns|history]` reads back what the ledger already knows — free, read-only, no
options beyond the view name; it's a read tool, not a seventh verb.

For the full six verbs, grading rules and stop/exit codes, run `mm3 help` (or `mm3 help <verb>`/`mm3 help <topic>`), or see [skills/mm3/SKILL.md](skills/mm3/SKILL.md) for the short version.

## Releases

| Channel | Install | When |
|---|---|---|
| nightly | `npm i @mvpscale/mm3@nightly` | daily from the `nightly` branch, when it changed and CI passed |
| stable | `npm i @mvpscale/mm3` | tagged releases on `main` |

## Contributing

See [AGENTS.md](AGENTS.md) for commands, test tiers and repo rules. Those rules apply to humans and agents alike.

## License

[Apache-2.0](LICENSE)
