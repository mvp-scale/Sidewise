# Where the README's numbers come from

Three figures sit under the picture on the front page. Each comes from a real run or command; the cost is the token-based estimate MM3 records. Each has its method here. If you can't reproduce one, open an issue. A last section explains the word "calibrated", which the README uses but is not a figure.

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

The twelve tasks, what each expected, and what the agent chose. "Full" means verb, depth and setup all as expected; "verb and depth" means those matched and the setup did not.

| # | The task, in one line | Expected verb and depth | Chosen verb and depth | Match |
|---|---|---|---|---|
| 1 | Before spending anything, check what is on record about the contribution handler | `view`, free | `view`, no spend | full |
| 2 | Take a first look: is the contribution handler safe to merge? | `class`, quick, 3 concerns of 3 questions | `class`, quick, 3 concerns of 3 questions | full |
| 3 | First pass across all route handlers, worst first | `scan`, quick | `scan`, quick (each file as the unit, not each function) | full |
| 4 | Dig into the single worst spot that pass found | `drill` from a scan item, quick | `drill` from that scan item | full |
| 5 | For the worst concern in task 2, pin down exactly why it failed | `drill` from a category, quick | `drill` from that category | full |
| 6 | Fix the eval-based parsing, then prove the problem is gone without re-checking everything | `replay`, with an `expect:` naming only the concerns the fix should clear | `replay` over the fix commit, `expect:` naming all three concerns | verb and depth |
| 7 | Check a password-reset design before any code exists | `loop`, quick | `loop`, quick | full |
| 8 | The same design, now also touching bank details: look again with more certainty | `loop`, standard or thorough, linked to task 7 | `loop`, thorough, reason "touches money", no link to task 7 | verb and depth |
| 9 | The user-data module ships tomorrow: be as certain as possible | `class`, thorough, 9 concerns | `class`, thorough, 9 concerns | full |
| 10 | Give an open pull request a normal pre-merge review | `class`, standard | `class`, standard | full |
| 11 | Brief a new teammate using only what is on record | `view` or `report`, free | `report` (four views), no new run | full |
| 12 | Which of your requests was the weakest, and what would you change? | none (reflection) | none: named the weakest request and a fix for it | full |

The two partials (tasks 6 and 8) are the ones described above.

This is a smoke test, not a benchmark: one agent, one run, one codebase. The twelve tasks cost $0.0017 in total.

## What calibrated means

A verdict's numbers (`p`, the odds on a question) are the classifier's own probability that the answer is yes. "Calibrated" is the claim that those odds mean what they say: of the answers given 0.9, about nine in ten turn out right, so a false pass at 0.9 happens about one time in ten.

That is a property of the classifier (TypeSafe's Jev), not something MM3 has measured across its own runs. MM3 does not re-calibrate anything. It keeps the odds with every answer, and `mm3 outcome` records whether each verdict held, so `mm3 report` can show, over time and on your own code, which verdicts to distrust. Until you have that history, treat 0.9 as "probably right", and `unsure` as a real answer.
