# The README demo

The demo is the **player**: two stories of real MM3 runs, each driven by a Haiku agent on unmodified public source.
**MAK³ · make**, "Where do agents plug into WordPress?" (WordPress/wordpress-develop at `3ffb1df`), and
**MDL³ · model**, "I've never worked in n8n and I want it faster" (n8n-io/n8n at the tags `n8n@2.40.7`, then `n8n@2.41.3`).
Each story is four steps; each step follows one agent session in six beats: 1 the task the agent was given (its kickoff,
question verbatim, paths shortened), 2 the request it fired, 3 the response MM3 returned (both as syntax-highlighted YAML,
in full, wrapped, never cut), 4 a colour-coded quick read of it (gates, p bars, consensus, escalate), 5 **the decision it
infers** (the move MM3's `next:` names and why: gate, concerns, consensus, escalate, reuse) and 6 what the ledger now
holds (lineage, reuse, what was recorded, the budget line). mm3lab.dev has it interactive (story tabs, a step-through,
request and response tabs, hover a question to light its answer, a replay); the README has the same steps as two
animated GIFs at 1600x900 (`docs/assets/demo-player-light.gif` and `-dark.gif`), where a long request or response is
paged through so the whole text is shown.

Every step is frozen data in `docs/demo/scenes/{mak,mdl}.json`: the request, the response MM3 printed (verbatim), the
footer (model, endpoint, latency, cost, questions, reuse, calls, id, date, pinned commit or tag) and the ledger facts, all
read from that run's own ledger row by `extract`. The decision text is derived from the response itself by
`inferDecision`, not typed. Nothing in a footer is typed by hand. Rendering the site or the GIFs reads only these JSON
files, so a re-render never calls a classifier and never spends. `npm run check:readme` fails if a footer on the site or
the README's frozen response drifts from its step.

Which runs are shown: MAK³ shows 4 of 6 (MM3-0001 blocks, 0003 REST API, 0004 Abilities API, 0005 the drill into its
access check; left out 0002 and 0006, each a repeat of a move already shown). MDL³ shows 4 of 6 (0001 scan, 0003 class, 0004
drill, 0006 the scan re-run at n8n@2.41.3, fully reused from MM3-0001 at $0.00000; left out 0002, a replay that came back
unsure because every item was skipped, and 0005, a class re-check reused the same way). Each story's `about` line
states what was left out. Run ids repeat across the two stories, so a step is addressed as story plus id
(`scene-mak-MM3-0004`).

What is not MM3 output: the agent's own notes (REPORT.md, STOPS.md) were read only to pick steps; none of its prose or
estimates appears. The kickoff is what the agent was given, not something MM3 said.

| File | Holds |
|---|---|
| `scenes/mak.json`, `scenes/mdl.json` | the frozen stories (committed source of truth) |
| `../../scripts/build-demo.ts` | extract, YAML highlight, decision, player markup, README frame page |
| `../../scripts/demo-gif.ts` | the GIF renderer (headless Chrome over CDP, then ffmpeg) |
| `../../site/player.js` | the site's story tabs, step-through, request/response tabs, replay, question-to-answer highlight |
| `../../site/style.css` | the player styles (`.player`, `.pscene`, `.codecard`, `.decision`, ...) |

## Re-render the GIFs (free)

Needs Chrome or Chromium (set `MM3_CHROME` if it is not at a usual path) and `ffmpeg`. They are machine tools, not npm
dependencies, and nothing here runs in CI. About 1 to 2 minutes; the render stops if a quick read or the decision
would be cut off instead of shipping it cropped.

```bash
npx tsx scripts/demo-gif.ts                 # writes docs/assets/demo-player-{light,dark}.gif
npx tsx scripts/build-demo.ts               # no args: checks the scenes and prints each footer, no ledger read
npm run build:site                          # the interactive player on the site
```

## Re-extract the scenes (one time, free)

Reads a local play area (one clone per story with its `.mm3/log.jsonl`, and the agent's `requests/` folder), matches each
request file to its ledger row by `mak.goal` and every question text, and rewrites `scenes/*.json`. It does not call a
classifier. The play area and the kickoff text files are local and never committed. The play area's folder name is
scrubbed from every committed string; the pattern comes from the `--play` path you pass, so no name is written in the code.

```bash
npx tsx scripts/build-demo.ts extract --play <play-area> --kickoff-mak <mak-kickoff.txt> --kickoff-mdl <mdl-kickoff.txt>
```

The runs and request files are listed in `STORIES` in `scripts/build-demo.ts`. Costs are estimates (every row says
`costEstimated`), so they are shown with a "~". Question counts are what was sent to the model, the goal question
included, so they are one more than the response's own note; a reused run shows "N asked · M reused from MM3-xxxx".
