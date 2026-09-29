# The README demo

`docs/assets/demo.gif` is a recording of one real `mm3 class` run: an agent's one-line ask, the request it wrote
(`review.yaml`, run on this repo's own `src/ledger/paths.ts`), the call, and the verdict. The exact response is
frozen as text under the GIF in `README.md` (and on the site), labelled with model, date and cost.

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
