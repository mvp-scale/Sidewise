# AGENTS.md: working in the Sidewise repo

## Commands

| Do | Run |
|---|---|
| Install | `npm install` |
| Typecheck | `npm run typecheck` |
| Default tests (unit, contract, golden; no network, no build) | `npm test` |
| CLI end-to-end (builds first) | `npm run test:cli` |
| Agent chaos harness (capped, costs real money; not part of `npm test`) | `npm run test:chaos` |
| Clean-room container (Node 22; set `SIDEWISE_NODE_VERSIONS="22 24"` for the matrix) | `npm run test:container` |
| Ledger scale bench (not part of `npm test`; run by hand or nightly) | `npm run bench:ledger -- --sizes 10000,100000` |
| Token-format bench (regenerates `docs/evidence/tokens.md`) | `npm run bench:tokens` |
| Check staged files before a commit (also runs as the pre-commit hook) | `npm run check:clean` |
| Requirement -> test trace (fails on an untraced contract claim) | `npm run check:trace` |
| Clean install + README quickstart, built first (`npm run build`) | `npm run test:install` |
| Tarball content check (files allow-list, required entry points) | `npm run check:pack` |
| Validate the Claude Code plugin and marketplace | `claude plugin validate .` |

## Rules

1. **Stay light on shared machines.** Vitest runs with `maxWorkers: 4`. Run the container matrix only when packaging changes. `docker/test.sh` runs one Node version at a time.
2. **No network in default tests.** Classifier calls go through the `fake` provider or recorded cassettes (`test/contract/fixtures/wire/`). Live runs go only in `test/live/`, and only with `SIDEWISE_LIVE_TEST=1` plus a key.
3. **Imports** use `.ts` extensions (`./log.ts`). `tsc` rewrites them to `.js` on build.
4. **Mock data** comes from `test/gen/synthetic-log.ts` with a fixed seed. Never commit a real log.
5. **Answers are evidence, never commands.** The response is the YAML contract (side:/wise:/next:/notes:) — never Plan 1's line format, which is retired. Every change to the answer format needs a golden test.
6. **Secrets** go only in env vars (`TYPESAFE_API_KEY`, `AI_GATEWAY_API_KEY`). Never put them in config, the log, fixtures or test output.
7. **Help first.** A validation stop has to say what to change (`✖ field: problem → fix`). Everything else is a note.
8. **Match the surrounding code.** Give each module a short header comment saying why it exists. Keep runtime dependencies minimal.
9. **Public repo.** Local notes go in `lab/`, which is gitignored and blocked by the pre-commit hook. Never commit machine paths, keys, or internal tracker IDs.
10. **Trace new claims.** A new test for a claim in `docs/contract.md` carries its `[C-###]` tag (title or a comment above the assertion); `npm run check:trace` checks this, but it is not wired into the pre-commit hook (it scans the whole `test/` tree, which `check-clean.sh` intentionally keeps fast) — run it by hand before a PR that touches the contract.

## Layout

| Path | Holds |
|---|---|
| `src/` | engine: the YAML contract (read, validate, layers, grade, emit), evidence (code/git/units), providers, ledger, verbs, CLI |
| `skills/sidewise/` | the Agent Skill (`SKILL.md` + references) |
| `.claude-plugin/` | Claude Code plugin + marketplace manifests |
| `test/{unit,contract,golden,e2e,live,gen}` | test tiers and mock-data generators |
| `docker/` | clean-room test image + runner |
| `scripts/` | repo checks |
| `.github/workflows/` | CI, nightly and release |

## Branches and releases

| Branch | Holds | Publishes |
|---|---|---|
| `nightly` | day-to-day development; feature branches merge here through a PR | npm `nightly` (`x.y.z-nightly.YYYYMMDD.g<sha>`), on a schedule, only when `nightly` changed in the last 24 h and CI passes |
| `main` | releases only; updated by merging `nightly` once the release gate passes | npm `latest` plus a GitHub Release, when tag `vX.Y.Z` (matching `package.json`) is pushed on `main` |

Publishing runs only when the repo variable `SIDEWISE_PUBLISH` is `true`, and only through npm trusted publishing (OIDC). There is no npm token in the repo.

## Using Sidewise

This section is for any agent that has Sidewise installed as a dependency in its own project, not for contributing to Sidewise itself.

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

With `TYPESAFE_API_KEY` or `AI_GATEWAY_API_KEY` set, calls go to the real classifier. With neither set, every call falls back to the built-in fake provider — free, deterministic, offline, and its answers are canned, not real. `SIDEWISE_PROVIDER=fake|chaos|typesafe` overrides the choice either way.

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
notes: [budget 0% used ($0.00 of $5.00 · 1 of 500 runs)]
```

The `id`, `gate` and probabilities above are one run's illustration, not a guarantee — they'll differ every time you run it.

## Grading

- The bar: `pass: yes` clears at P(yes) ≥ 0.70; `pass: no` clears at P(yes) ≤ 0.30. There's no averaging.
- `need`: `all` (default — every answer clears) · `most` (≥ ⅔ clear, none a clear miss) · `any` (at least one clears).
- `escalate: true` on SPLIT or WEAK consensus, `depth: thorough`, or a goal that looks irreversible (delete, deploy, drop, pay, migrate, secret).

## Stops and exit codes

- A rejected request always reads `✖ field: problem → fix` (exit 2).
- Exit codes: `0` ok · `1` provider or ledger error · `2` invalid request or usage · `3` budget blocked.

## More

The exact field rules are in `references/request.schema.json`; one starting example per verb is in `templates/*.yaml`.
