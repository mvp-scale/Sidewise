# Where the README's numbers come from

Three figures sit under the picture on the front page. Each is measured, not estimated, and each has its method here. If you can't reproduce one, open an issue. A last section explains the word "calibrated", which the README uses but is not a figure.

## Cost per check

**$0.000065**: the median cost of one `class` check, across the five paid `class` runs in one real ledger (model `jev-1.13.0`, TypeSafe's classifier, 2026-09-29). The five ranged from $0.000039 to $0.000093.

Method: a scratch project (OWASP NodeGoat) was checked by an agent using MM3 over two short sessions. Every run is one line in that project's `.mm3/log.jsonl`. Take the rows with `kind: run` and `verb: class`, drop the one that cost nothing because it was answered from the ledger (`calls: 0`), and take the median of `costUsd`.

```bash
node -e '
const rows = require("fs").readFileSync(".mm3/log.jsonl", "utf8").trim().split("\n").map(JSON.parse);
const c = rows.filter((r) => r.kind === "run" && r.verb === "class" && r.calls > 0).map((r) => r.costUsd).sort((a, b) => a - b);
console.log(c.length, "paid class runs; median", c[Math.floor(c.length / 2)]);
'
```

Caveats: the cost is estimated from tokens (the run's own note says so), a bigger checklist costs more, and this is five runs on one codebase. It shows the order of magnitude: a fraction of a hundredth of a cent, not a dollar.

## Test count

**1,118 tests**: the default suite (`npm test`: unit, contract and golden tiers) passes with no network and no key. The number is the `Tests` line of that command's summary, taken on the commit that introduced this page.

```bash
npm test    # ... Tests  1118 passed (1118)
```

The number moves with every test added. `npm run check:trace` maps each claim in [`contract.md`](contract.md) to the tests that prove it.

## Agent smoke score

**12/12 verb and depth decisions**: a coding agent (Claude) was given twelve plain-language tasks about OWASP NodeGoat, in order, and MM3 as its only checking tool. Each task has an expected verb and depth (for example "before spending anything, check what is on record" expects `view`, and "prove the fix worked without re-checking everything" expects `replay`). We graded which call the agent chose.

Result on 2026-09-29: the agent chose the expected verb and depth on all 12 tasks. It matched the expected call in full on 10 of 12. The two partials were the agent's own choices: it asked `replay` to expect every concern to turn (the task said not every one), and it did not link a second `loop` run to the first as its parent.

This is a smoke test, not a benchmark: one agent, one run, one codebase. The twelve tasks cost $0.0017 in total.

## What calibrated means

A verdict's numbers (`p`, the odds on a question) are the classifier's own probability that the answer is yes. "Calibrated" is the claim that those odds mean what they say: of the answers given 0.9, about nine in ten turn out right, so a false pass at 0.9 happens about one time in ten.

That is a property of the classifier (TypeSafe's Jev), not something MM3 has measured across its own runs. MM3 does not re-calibrate anything. It keeps the odds with every answer, and `mm3 outcome` records whether each verdict held, so `mm3 report` can show, over time and on your own code, which verdicts to distrust. Until you have that history, treat 0.9 as "probably right", and `unsure` as a real answer.
