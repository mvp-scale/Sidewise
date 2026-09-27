# Sidewise

**Solve the problem in front of you fast, and use it to make your agent harness better.**

Sidewise gives coding agents a cheap, calibrated side-question. The agent writes a short numbered yes/no checklist on one focus. A small classifier answers it, and Sidewise returns a six-line consensus: how strongly the evidence agrees, which way it leans, and where the concern is. Every run and its outcome goes into a local log, so over time Sidewise can show you where your agents keep going wrong.

> **Status: pre-release.** The package, plugin and install flow are under active development. Nothing is on npm yet. Watch the repo or check back for `@mvpscale/sidewise@nightly`.

## Why

- **Compact by default, expands on demand.** A short checklist goes in, a ≤ 6-line answer comes out, and you open the detail only when you need it.
- **Cheaper than a second full-context review.** A decomposed checklist goes to a small classifier. No subagent has to re-read the whole task.
- **Consensus, never a command.** You get agreement strength and a lean; the agent decides.
- **Irreversible stays human.** Delete, deploy, drop and pay are always the agent's or owner's call.
- **Every answer gets graded.** Outcomes (held · overruled · failed) are logged next to the question that produced them.
- **It finds what your agents are bad at.** Overruled, failed and split answers roll up into weak spots, but only with enough evidence to be believed.
- **Budgeted, no surprises.** A hard spend cap that only you reset. It fails closed.
- **Runs where your agents run.** One CLI and one MCP server, with native setup for Claude Code, Codex, Gemini CLI, Cursor, VS Code/Copilot and more.

## What a run looks like

Every request has a `side:` block (**solve it now**: one goal, then plumbing) and an optional `wise:` block (**get smarter**: why you're here, so the ledger learns). `class` — one call, one subject — is the simplest of the six verbs; see [skills/sidewise/SKILL.md](skills/sidewise/SKILL.md) for all six and how they fit together.

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
next: sidewise drill --parent SW-0042 --category injection
notes: [budget 1% used ($0.02 of $5.00 · 3 of 500 runs)]
```

The numbers above are one run's illustration, not a guarantee — the real classifier's actual answer varies.

## Install

Run this inside the project you want Sidewise in:

```bash
npx @mvpscale/sidewise init
```

`init` does four things and says what it did at each step, one line apiece:
- It puts the `sidewise` command on your PATH. You choose global, `--user` (under `~/.local`, no sudo) or `--local` (this project only, run as `npx sidewise`). It never runs sudo.
- It asks for your TypeSafe API key, with the input hidden, and stores it per user: the OS keychain first, otherwise `~/.config/sidewise/env` (mode 0600). Press Enter to skip and use the free fake provider.
- It enables the Claude Code plugin for this project, if `claude` is on your PATH.
- It sets up `.sidewise/`, this project's run history, which git ignores.

Re-running `init` changes nothing that's already right. In a second project it only enables that project. `sidewise uninstall` reverses it for this project; add `--all` to also remove the key and the CLI.

**Just the Claude plugin:** `/plugin marketplace add mvp-scale/Sidewise`, then `/plugin install sidewise@mvp-scale`. The plugin still needs the CLI and a key, so run `npx @mvpscale/sidewise init --no-claude` once.

**Just the CLI:** `npm install -g @mvpscale/sidewise` (global; may need sudo), `npm install -g --prefix ~/.local @mvpscale/sidewise` (no sudo; `~/.local/bin` must be on PATH) or `npm install -D @mvpscale/sidewise` (this project; run `npx sidewise`). Then add a key with `sidewise init`, or `export TYPESAFE_API_KEY=…`.

`sidewise doctor` says where the key came from (`from OS keychain`, `from user file …`, `from env …`), never the key itself.

### From a local build

In a clone of this repo:

```bash
npm install
cd /path/to/your/project && npm --prefix /path/to/Sidewise run dev:install
```

`dev:install` builds, packs a tarball, and runs `init` from that tarball in the directory you ran it from, so a local build installs exactly the way the published package does.

## Quickstart

Every command below runs unmodified, in order, against a fresh project — `sidewise template class` already asks about the first three lines of `src/user.ts`, so nothing needs editing before `sidewise class` sends it. In a real project, edit the `goal` and `ask` first.

With no `TYPESAFE_API_KEY` or `AI_GATEWAY_API_KEY` in the environment, this runs on the built-in fake provider — free, deterministic, offline, and its answers are canned, not real. Set one of those keys for real answers (or `SIDEWISE_PROVIDER=fake|chaos|typesafe` to choose explicitly).

```bash
# sidewise-quickstart
sidewise template class > review.yaml
sidewise class review.yaml
sidewise view src
sidewise outcome SW-0001 held --by you
sidewise budget
```

Run `sidewise doctor` any time to check which provider, route and base URL a call would use, whether a key is
set (never its value), and whether a project and its ledger are found — free, no call, no spend. Set
`SIDEWISE_BASE_URL=<url>` to point at a proxy or a self-hosted mirror instead of TypeSafe's own endpoint
(`https` required, except `http` for `localhost`/`127.0.0.1`/`[::1]`). A 429 or 529 from TypeSafe is retried
automatically, up to twice more; a 401 or 422 never retries.

For the full six verbs, grading rules and stop/exit codes, see [skills/sidewise/SKILL.md](skills/sidewise/SKILL.md).

## Releases

| Channel | Install | When |
|---|---|---|
| nightly | `npm i @mvpscale/sidewise@nightly` | daily from the `nightly` branch, when it changed and CI passed |
| stable | `npm i @mvpscale/sidewise` | tagged releases on `main` |

## Contributing

See [AGENTS.md](AGENTS.md) for commands, test tiers and repo rules. Those rules apply to humans and agents alike.

## License

[Apache-2.0](LICENSE)
