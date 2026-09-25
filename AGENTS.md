# AGENTS.md: working in the Sidewise repo

## Commands

| Do | Run |
|---|---|
| Install | `npm install` |
| Typecheck | `npm run typecheck` |
| Default tests (unit, contract, golden; no network, no build) | `npm test` |
| CLI end-to-end (builds first) | `npm run test:cli` |
| Clean-room container (Node 22; set `SIDEWISE_NODE_VERSIONS="20 22 24"` for the matrix) | `npm run test:container` |
| Check staged files before a commit (also runs as the pre-commit hook) | `npm run check:clean` |
| Validate the Claude Code plugin and marketplace | `claude plugin validate .` |

## Rules

1. **Stay light on shared machines.** Vitest runs with `maxWorkers: 4`. Run the container matrix only when packaging changes. `docker/test.sh` runs one Node version at a time.
2. **No network in default tests.** Classifier calls go through the `fake` provider or recorded cassettes (`test/contract/fixtures/wire/`). Live runs go only in `test/live/`, and only with `SIDEWISE_LIVE_TEST=1` plus a key.
3. **Imports** use `.ts` extensions (`./log.ts`). `tsc` rewrites them to `.js` on build.
4. **Mock data** comes from `test/gen/synthetic-log.ts` with a fixed seed. Never commit a real log.
5. **Answers are evidence, never commands.** Guidance lines come from templates. Every change to the answer format needs a golden test.
6. **Secrets** go only in env vars (`TYPESAFE_API_KEY`, `AI_GATEWAY_API_KEY`). Never put them in config, the log, fixtures or test output.
7. **Help first.** A validation stop has to say what to change (`✖ field: problem → fix`). Everything else is a note.
8. **Match the surrounding code.** Give each module a short header comment saying why it exists. Keep runtime dependencies minimal.
9. **Public repo.** Local notes go in `lab/`, which is gitignored and blocked by the pre-commit hook. Never commit machine paths, keys, or internal tracker IDs.

## Layout

| Path | Holds |
|---|---|
| `src/` | engine: request parsing, validation, consensus, providers, log, modes, CLI |
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
