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

```
sidewise class L1
problem: login lookup builds SQL from the request
focus: This handler is safe to merge

 1  Is request text placed directly into the SQL query?
 2  Could a caller change what the query does?
 3 !Is the id checked to be a number before use?
 ...
10  Would a standard security scanner flag this code?

? Where should this go? ship | fix | block
```

```
sidewise SW-0042 · class L1 · consensus STRONG · leans block (.97)
agree   1 2 4 5 7 10 · reversed ok 3 6 9
concern 1 2 (injection) · 4 5 (access)
guidance: the evidence agrees this query is exploitable; fix before merging
next: sidewise drill --parent SW-0042 --focus injection
```

## Install (coming)

```bash
npx @mvpscale/sidewise init            # detect your agents and set each one up
```

Claude Code plugin:

```
/plugin marketplace add mvp-scale/Sidewise
/plugin install sidewise@mvp-scale
```

## Releases

| Channel | Install | When |
|---|---|---|
| nightly | `npm i @mvpscale/sidewise@nightly` | daily from the `nightly` branch, when it changed and CI passed |
| stable | `npm i @mvpscale/sidewise` | tagged releases on `main` |

## Contributing

See [AGENTS.md](AGENTS.md) for commands, test tiers and repo rules. Those rules apply to humans and agents alike.

## License

[Apache-2.0](LICENSE)
