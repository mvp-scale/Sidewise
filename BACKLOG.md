# Backlog

What's next and what's parked. It lives on `nightly`. When something ships, delete its line.

## Next: small and ready

- **Default branch to `main`.** The plugin install and the README links resolve against the default branch, which is still `nightly`. Repo settings, maintainer only.
- **Push `mm3-journeys`** so the README's link to the journey 2 plan stops being a 404. Fix the plan's dial arms first: one `class` call tops out at 27 yes/no questions (`depth: thorough`), so the arms are 9, 18 and 27, with more calls beyond that.
- **Open PRs:** merge or close the guidance fix and the Dependabot bump.
- **Delete merged feature branches**, remote and local. Their commits are all in `nightly`.
- **Raise the timeout** on the ledger-scale doc test. It timed out once on Node 22 and passed on rerun.
- **Scripted link check** in `npm run check:readme`: fail on any 404 in the README's links, so a dead link can't ship.
- **Run `mm3 init --agents` in this repo**, so a contributor's agent gets the pointer to MM3's command cards.

## Journeys

A journey asks what one agent can do on a $1 cap that covers everything, using the same three beats (Know, Judge, Prove). The runs live in [mm3-journeys](https://github.com/mvp-scale/mm3-journeys).

- **Journey 2: turn one dial.** What changes when each `class` call asks more questions? Same brief, model and cap, only the questions per call differ. Two runs per arm.
- **A bigger-model baseline** on the same brief and cap, so the card can show what a cheaper agent plus MM3 learns against an expensive agent alone.
- **Reuse on a kept ledger.** A second pass on the same repo: how much is answered free from the ledger.
- **A journey skill** (kept out of the shipped skills): how to run and consolidate a journey, with the Know, Judge, Prove steps and map-first. Lives in `mm3-journeys`, so journey runs stay consistent without becoming MM3's default.
- **Record the agent's own tokens per run** in each journey's capture, tokens first and dollars as a dated note.

## Website

- `mm3lab.dev` isn't live yet. The site code (`site/`, `scripts/build-site.ts`, the demo) moves to its own repo. The README's image generators read `site/scenes/`, and `check-readme` reads `site/story.yaml`, so that move needs a small refactor first.
- Put the README's "step through the stories" link back once the site is up.

## Release

- Nightly publishes at 07:00 UTC when `nightly` changed. A release is by hand: tag `vX.Y.Z` on `main`, run the publish workflow. `nightly` is at 0.1.1; `0.1.0` is out.
- **Anthropic directory listing (optional).** Run `claude plugin validate --strict .`, work through Anthropic's pre-submission checklist, and confirm the local Node MCP server behaves outside Claude Code.

## Ideas, post-v1 (not committed)

- **`mm3 key set`:** store the TypeSafe key in the OS keychain through platform tools, with no new dependency. The CLI reads it when no env var is set.
- **`report stops`:** record each rejected request as the field and rule id only, never the request text. The most common mistakes then show which `help` pattern to improve first.
- **Templates show the full envelope:** every optional field present, marked optional or required, so an agent trims what it doesn't need.
- **Ledger index strategy:** decide which searches to index (reuse by answer key, run by id, outcome, place history, tags, patterns over time). Some rebuild tuning was measured earlier and not applied.
- **Knowledge layer:** consensus across every run tied to a commit, PR or release. Where answers agree across runs and agents they're strong signals; where they flip they're weak. `mm3 report graph` is the first piece.
- **A challenger pair of questions** (opposite polarity). The design is undecided.
