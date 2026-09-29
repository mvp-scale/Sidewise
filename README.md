<h1 align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/assets/wordmark-dark.svg"><img src="docs/assets/wordmark-light.svg" width="280" alt="MM3"></picture></h1>

<p align="center"><b>Checklists in. Calibrated verdicts out.</b></p>

<p align="center">MM3 turns a short numbered yes/no checklist into a calibrated pass/fail/unsure verdict your coding agent can cite.</p>

<p align="center"><a href="https://github.com/mvp-scale/Sidewise/actions/workflows/ci.yml"><img src="https://github.com/mvp-scale/Sidewise/actions/workflows/ci.yml/badge.svg" alt="CI"></a> <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-blue" alt="Apache-2.0 license"></a> <a href="#install"><img src="https://img.shields.io/badge/node-%E2%89%A5%2022.13-3c873a" alt="Node 22.13 or newer"></a></p>

<p align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/assets/how-it-works-dark.svg"><img src="docs/assets/how-it-works-light.svg" width="640" alt="How MM3 works. Six verbs in two rows and three columns. MAK³, make, use what is proven: view is a free lookup of the ledger, class gives one verdict for one subject, replay rechecks after a fix. MDL³, model, learn what is missing: scan sweeps to find where to look, drill digs into one weak spot, loop vets a design before code. The columns are Know, Judge and Prove. One ledger sits under all six and learns."></picture></p>

- [$0.000065 per check (median of five paid class runs)](docs/numbers.md#cost-per-check)
- [1,155 tests, no network, no key](docs/numbers.md#test-count)
- [The expected verb and depth chosen on 12/12 tasks of an agent smoke test on OWASP NodeGoat](docs/numbers.md#agent-smoke-score)

## Install

In Claude Code, from your project:

```text
/plugin marketplace add mvp-scale/Sidewise
/plugin install mm3@mvp-scale
```

Pick **project** scope. Claude asks for a TypeSafe API key (masked, optional): press Enter on "TypeSafe API key", paste, Enter, then "Save configuration". Leave it empty to use the free sample provider.

In a terminal, or with Codex or Gemini CLI (needs Node 22.13+):

```bash
npm install -g @mvpscale/mm3
mm3 init
```

**Status: pre-release.** The package publishes with the first release; until then use the plugin above, or build from a clone (see [AGENTS.md](AGENTS.md)). Nightly builds will land as `@mvpscale/mm3@nightly`.

### Try it with no key

With no key set, MM3 runs on a built-in sample provider: free, offline, and its answers are canned and labelled, never evidence. To force it even when a key is set, run `MM3_PROVIDER=fake mm3 class review.yaml`. Every line below runs in order in a fresh project:

```bash
# mm3-quickstart
mm3 template class > review.yaml
mm3 class review.yaml
mm3 view src
mm3 report
mm3 outcome MM3-0001 held --by you
mm3 budget
```

Agents: run `mm3 agent` first. Humans: `mm3 help`.

## See it run

![A real MM3 quick class run on n8n (MM3-0008). On the left, a coding agent is asked where n8n could be faster and runs one mm3 class request: 12 yes/no and decision questions, one call, 321 ms, about $0.00006, and a next move. On the right, the run's real YAML: the request opens folded (one claim, with concerns, decisions and an mdl block collapsed to fit) and a pointer unfolds each in turn; then the whole response (verdict, gates and odds per concern, consensus and the next command) and what the ledger now holds, where looking the same request up again is free.](docs/assets/demo-strip-n8n.svg)

[Step through both stories on mm3lab.dev →](https://mm3lab.dev/#run)

Two real stories, each driven by a Haiku agent on unmodified public source: **MAK³ · make**, “Where do agents plug into WordPress?” (WordPress @ 3ffb1df), and **MDL³ · model**, “I've never worked in n8n and I want it faster” (n8n@2.40.7, then n8n@2.41.3). Every step is one run: the task the agent was given, the request it fired, the response MM3 returned, a quick read of it, the decision it implies and what the ledger now holds. Every footer comes from that run's own ledger row.

One step in full, from the WordPress story: the agent asked whether the Abilities API is the place to plug in. It wrote this request (34 lines, opened below) and got one answer from one call.

<details>
<summary>The request the agent wrote</summary>

```text
mak:
  goal: Abilities API is the integration point for agent-driven UI components
  depth: quick
  where:
    - src/wp-includes/abilities-api.php:1-150
    - src/wp-includes/abilities.php:1-100
  ask:
    concerns:
      design:
        pass: "yes"
        1: Does Abilities API register capabilities with input/output schemas?
        2: Are abilities required to define permission callbacks before execution?
        3: Can third-party code register abilities without modifying WordPress core?
      access:
        pass: "yes"
        4: Is the permission_callback required for every registered ability?
        5: Are ability schemas validated against the permission callback result?
        6: Can an unprivileged user bypass ability permission checks via API?
      correctness:
        pass: "yes"
        7: Are input parameters validated against the input_schema?
        8: Are output values validated against the output_schema?
        9: Does the system reject invalid inputs before executing the callback?
    decisions:
      aui-foundation:
        pass: [yes]
        10:
          choice: Is Abilities API suitable as the foundation for AUI?
          options: [yes, partial, no]
      design-maturity:
        pass: [mature]
        11:
          scale: How mature is the Abilities API design for agents?
          levels: [prototype, developing, mature, stable]
```

</details>

The response, **real output · jev-1.13.0 · api.typesafe.ai · 293 ms · ~$0.00012**:

```text
mak:
  id: MM3-0004
  gate: fail
  goal: {gate: unsure, p: 0.38}
  design: {gate: unsure, 1: 0.97, 2: 0.50, 3: 0.96}
  access: {gate: fail, 4: 0.38, 5: 0.08, 6: 0.10}
  correctness: {gate: pass, 7: 0.80, 8: 0.72, 9: 0.80}
  aui-foundation: {gate: unsure, 10: {top: "yes", p: 0.45}}
  design-maturity: {gate: unsure, 11: {top: developing, p: 0.56}}
  consensus: SPLIT
  escalate: true
mdl: {recorded: none}
next: mm3 template drill --parent MM3-0004 --from access
notes: [cost estimated from tokens (no live pricing reported), "budget: $0.10 left of $0.10 · 26 of 30 runs left"]
```

Each concern gets its own verdict and odds. Design is unsure only because question 2, whether every ability must define a permission callback, sits at 0.50, and correctness passes. Access fails: two answers are clear misses (0.08, 0.10). The goal, asked as its own question, is unsure at 0.38. One honest note: the agent wrote question 6 with its polarity backwards (it asks whether an unprivileged user *can* bypass ability permission checks, with `pass: "yes"`), so its 0.10 is actually the reassuring answer; MM3 grades what it is asked. The concerns disagree, so consensus is SPLIT, MM3 sets `escalate: true`, and `next:` names the drill into access. The agent ran that drill (MM3-0005), the last step of the story.

## What you get

|  | **Know** | **Judge** | **Prove** |
|---|---|---|---|
| **MAK³** · use what is proven | `view`: a free lookup of what is on record | `class`: one subject, one verdict | `replay`: recheck after a fix |
| **MDL³** · learn what is missing | `scan`: sweep to find where to look | `drill`: dig into one weak spot | `loop`: vet a design before code |

A request has a `mak:` block (the checklist) and an optional `mdl:` block (why you are asking, so the ledger learns). The verb you run, not the key, decides whether it is a MAK³ or an MDL³ move. `mm3 help <verb>` shows the rules for each; `mm3 template <verb>` prints a filled-in sample.

Every run and its outcome goes into an append-only ledger in `.mm3/` (git-ignored). Ask the same questions of unchanged code and MM3 answers from the ledger: no call, no cost. `mm3 report` reads back where your agents keep going wrong, and a budget cap stops runaway spend; by convention only you raise or reset it, and MM3 tells agents to ask you. `mm3 view` looks a request up in the ledger before you spend anything.

## Why we built it

Agents can now ask a fast classifier a yes/no about your code, but each answer is untraceable and never reused. MM3 turns that into one standard checklist in, one calibrated verdict per concern out, and every answer kept and reused.

## What you can do

- **Check a change before you merge it.** One `class` call, three angles per concern, a verdict for each. Start with `mm3 template class`.
- **Prove a fix actually worked.** `replay` re-asks a past run's own questions across two commits, so you check the fix without re-checking everything. Start with `mm3 template replay`.
- **Find where a problem lives.** `scan` sweeps a folder and ranks the files that most need a look. Start with `mm3 template scan`.
- **Check a design before any code exists.** `loop` puts a plan through the same checklist before anyone writes it. Start with `mm3 template loop`.

Each template is a filled-in request with its rules as comments.

<details>
<summary>A request you can dry-run in this repo</summary>

`mm3 class review.yaml --dry-run` validates it and counts its questions without spending anything.

```yaml verb=class
mak:
  goal: An answer is reused only while the code it was given on is unchanged
  depth: quick
  where: [src/ledger/reuse.ts:193-260, src/ledger/stale.ts]
  ask:
    concerns:
      freshness:
        pass: yes
        1: Does the check compare the code's current state with the state the answer was given on?
        2: Is an answer dropped once the code it was given on has changed?
        3: Is that comparison made before any call is sent?
      lookup:
        pass: yes
        4: Is a stored answer looked up by the exact question set?
        5: Is the lookup keyed on the question text and the code state together?
        6: Is a lookup miss treated as "ask", not as an error?
      spend:
        pass: yes
        7: Does a reused answer cost nothing?
        8: Is each reuse recorded in the ledger?
        9: Is a reused answer labelled as reused?
    decisions:
      severity:
        pass: [none, low]
        10:
          scale: How severe is the worst issue found?
          levels: [none, low, medium, high, critical]
      route:
        pass: [ship]
        11:
          choice: Where should this go?
          options: [ship, fix, block]
mdl:
  why: validate
  area: data
```

</details>

## Limits and alternatives

- **Evidence, never a command.** You get an agreement strength and a lean; you or your agent decide. Delete, deploy, drop and pay stay human.
- **A false pass costs you.** A [calibrated](docs/numbers.md#what-calibrated-means) 0.9 is wrong about one time in ten. `unsure` is a real answer, and `mm3 outcome` grades each verdict so the ledger can show which ones to distrust.
- **Not a linter, scanner or test suite.** Those find known patterns, deterministically, for free. Run them first. MM3 answers the questions they can't put: does this handler check the caller, will this design hold.
- **Not a substitute for a full-context model review.** A full-context review reads the whole codebase for every question. Use one when the question won't fit a yes/no.
- **The sample provider is not evidence.** Its answers are canned. Built on TypeSafe's Jev; other classifiers can plug in.
- **Pre-release.** Tested end to end on an intentionally vulnerable app (OWASP NodeGoat) (see the numbers above). Not yet on npm.

## Docs and contributing

- [The contract](docs/contract.md): every claim the answer format makes
- [Evidence for each claim](docs/evidence/README.md) and [where the numbers come from](docs/numbers.md)
- [The agent skill](skills/mm3/SKILL.md), and `mm3 agent` / `mm3 help` in your terminal
- Contributing: see [AGENTS.md](AGENTS.md) for commands, test tiers and rules. Open pull requests against the `nightly` branch.

## License

[Apache-2.0](LICENSE) · [Contributing](AGENTS.md) · [Issues](https://github.com/mvp-scale/Sidewise/issues)
