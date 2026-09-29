# The README demo

The demo is the **player**: five real MM3 runs on OWASP NodeGoat (class, scan, drill, replay, loop) shown as a split
panel, terminal and request YAML beside a colour-coded verdict. mm3lab.dev has it interactive (a tab per verb,
step-through, hover a question to light its answer); the README has the same scenes as two animated GIFs
(`docs/assets/demo-player-light.gif` and `-dark.gif`, one per colour scheme, each about 75 s: 5 scenes of about 15 s).

Every scene is frozen data in `docs/demo/scenes/*.json`: the request, the response MM3 printed (verbatim; only
the scratch checkout's `stage/NodeGoat/` prefix is dropped), and a footer (model, endpoint, latency, cost,
questions, calls, id, date) read from that run's own ledger row. Nothing in a footer is typed by hand.
Rendering the site or the GIFs reads only these JSON files, so a re-render never calls a classifier and never spends.
`npm run check:readme` fails if a footer on the site or the README's frozen response drifts from its scene.

| File | Holds |
|---|---|
| `scenes/*.json` | the frozen scenes (committed source of truth) |
| `../../scripts/build-demo.ts` | extract, player markup, GIF render |
| `../../site/player.js` | the site's tabs, step-through, replay and question-to-answer highlight |
| `../../site/style.css` | the player styles (`.player`, `.pscene`, `.vrow`, ...) |

## Re-render the GIFs (free)

Needs Chrome or Chromium (set `MM3_CHROME` if it is not at a usual path) and `ffmpeg`. They are machine tools, not npm
dependencies, and nothing here runs in CI. About 2 to 3 minutes.

```bash
npx tsx scripts/build-demo.ts gif           # writes docs/assets/demo-player-{light,dark}.gif
npx tsx scripts/build-demo.ts               # no args: checks the scenes and prints each footer, no ledger read
npm run build:site                          # the interactive player on the site
```

## Re-extract the scenes (one time, free)

Reads a local play ledger and its request files, matches each request to its ledger row by `mak.goal`, and rewrites
`scenes/*.json`. It does not call a classifier. The ledger is a local file that is never committed.

```bash
npx tsx scripts/build-demo.ts extract --ledger <play-area>/.mm3/log.jsonl --requests <play-area>/notes/requests --questions <play-area>/notes/QUESTIONS.md
```

The runs, request files and task numbers are listed in `PICKS` in `scripts/build-demo.ts`; add
`--questions <play-area>/notes/QUESTIONS.md` so each scene's prompt is the verbatim task text given to the agent
(`promptSource` says which task; a long task is cut to its first sentence and marked with an ellipsis). The runs went through the
mm3 tool, so the terminal bar says "via the mm3 tool, shown as CLI" and the command is `mm3 <verb> request.yaml`.
Costs are estimates (every row has `costEstimated: true`), so they are shown with a "~". Question counts are what was sent to
the model, the goal question included, so they are one more than the response's own note; a loop that reused answers shows
"N asked · M reused from MM3-xxxx".

---

## Superseded: the single-terminal recording

The rest of this file describes the earlier single-run terminal GIF (`demo.tape`, `review.yaml`, `Dockerfile`,
`trim.sh`) that the player replaced. `docs/assets/demo.gif` is gone; these files are kept only so that recording
can be remade.

| File | Holds |
|---|---|
| `demo.tape` | the [VHS](https://github.com/charmbracelet/vhs) script: typing, timing, theme (the brand palette) |
| `review.yaml` | the request the tape runs (the goal, 9 concern questions, 2 decisions) |
| `Dockerfile` | the recorder: the VHS image plus Node 22 and an `mm3` shim for the built CLI |
| `trim.sh` | cuts the GIF to the last visible change plus a short hold, and shrinks it |

VHS, ttyd and ffmpeg are machine tools for whoever re-renders. They are not npm dependencies, and nothing here runs in CI.

## Check the request (free)

```bash
npm run build:plugin        # the tape runs bin/mm3.mjs
node bin/mm3.mjs class docs/demo/review.yaml --dry-run    # expect: calls: 1, no ✖ lines
```

## Rehearse (free, no key)

The fake provider answers with canned, labelled output, so the picture is right but the verdict is not evidence.

```bash
docker build -t mm3-vhs:local docs/demo
P=$(mktemp -d); O=$(mktemp -d)
mkdir -p "$P/.mm3" "$P/src/ledger" && cp docs/demo/review.yaml "$P/" && cp src/ledger/paths.ts "$P/src/ledger/"
chmod -R a+rwX "$P" "$O"
docker run --rm -e MM3_PROVIDER=fake -e MM3_DEMO_CAPTURE=/out/response.txt \
  -v "$PWD":/repo:ro -v "$P":/work -v "$O":/out mm3-vhs:local /repo/docs/demo/demo.tape
docs/demo/trim.sh "$O/demo.gif" "$O/demo-trim.gif" 7
```

The repo is mounted read-only, and the demo works in the throwaway project `$P`, so its ledger row never lands in the repo.
Use fresh `$P` and `$O` dirs for every render, rehearsal or real: an unchanged request in a used ledger is answered from it, with no call.

## Re-render for real (one paid call, manual only)

A real render makes exactly one classifier call (about $0.00004). Never put it in CI, a loop or a retry: if it fails
after the call went out, look at the log first, because running it again pays again. Run the same command with no
`MM3_PROVIDER`, with fresh `$P` and `$O` dirs (as above), and mount your key file where MM3 looks for it (MM3 reads it itself; do not print or copy it):

```bash
docker run --rm -e MM3_DEMO_CAPTURE=/out/response.txt \
  -v "$HOME/.config/mm3/env":/root/.config/mm3/env:ro \
  -v "$PWD":/repo:ro -v "$P":/work -v "$O":/out mm3-vhs:local /repo/docs/demo/demo.tape
```

Then:

1. `docs/demo/trim.sh "$O/demo.gif" docs/assets/demo.gif 7` (keep it under 2 MB; 15 to 20 s).
2. Copy `$O/response.txt` into the `text` block under the GIF in `README.md` and `site/template.html`, and update the
   label: the model, date and cost come from `$P/.mm3/log.jsonl` (the run row's `model`, `costUsd` and time).
3. `npm run check:readme` must print `readme OK`.
