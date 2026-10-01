# Where the README's numbers come from

The front page's header ("Knows in ~20 ms. Learns in ~500 ms."), its "tested to 100,000 runs" line and the figures under the picture each come from a real run or command; the cost is the token-based estimate MM3 records. Each has its method here, with its caveats. If you can't reproduce one, open an issue. A last section explains the word "calibrated", which the README uses but is not a figure.

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

**1,181 tests**: the default suite (`npm test`: unit, contract and golden tiers) passes with no network and no key. The number is the `Tests` line of that command's summary, taken at `cf29635` (the commit before the one that added it here) with `npm test`.

```bash
npm test    # ... Tests  1181 passed (1181)
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

## Knows in ~20 ms

**Under 20 ms** for a typical call: the time for an agent to get back a verdict MM3 already holds, with the answer read from the ledger and no model call. Across seven repeats of the method below, the median ranged from 4.3 to 9.6 ms and the p90 from 8.1 to 15.6 ms, so nine calls in ten were under 20 ms every time. A few single calls were slower: the slowest in any repeat was 60 ms. Measured 2026-10-01 on Node 22.23.

"Knows" means the same request about code that has not changed: `view <request>` finds the stored answer (`reuse: MM3-nnnn` in the reply). The time is for the call through the MCP server, which is how Claude Code calls MM3 and which stays running between calls, so Node's start-up is paid once.

Method: in a scratch git project, run one `class` request with the fake provider (free), then call `view` on that same request 40 times through `mm3 mcp`, timing each round trip. Repeat the second step a few times and read the range.

```bash
export MM3_PROVIDER=fake
mm3 class req.yaml        # one real run, so the ledger holds an answer
node -e '
const { spawn } = require("child_process");
const p = spawn("mm3", ["mcp"]); let buf = ""; const wait = new Map();
p.stdout.on("data", (d) => { buf += d; let i; while ((i = buf.indexOf("\n")) >= 0) { const m = JSON.parse(buf.slice(0, i)); buf = buf.slice(i + 1); wait.get(m.id)?.(m); } });
const call = (id, method, params) => new Promise((r) => { wait.set(id, r); p.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n"); });
(async () => {
  await call(1, "initialize", { protocolVersion: "2025-06-18" });
  const t = [];
  for (let i = 0; i < 40; i++) { const a = process.hrtime.bigint(); await call(10 + i, "tools/call", { name: "mm3", arguments: { args: ["view", "req.yaml"], project: process.cwd() } }); t.push(Number(process.hrtime.bigint() - a) / 1e6); }
  t.sort((x, y) => x - y); console.log("median", t[20].toFixed(1), "p90", t[36].toFixed(1), "max", t[39].toFixed(1)); p.kill();
})()'
```

Caveats: a small ledger (up to 21 runs), one machine, one request, and the figure moves a few milliseconds from run to run, which is why the header uses a round ceiling (20 ms) over the measured medians. From a terminal, each `mm3 view` also starts Node and loads MM3, which took about 110 ms for the bundled CLI, so "20 ms" is the in-agent figure, not a one-off command. The ledger lookup alone stays near a millisecond at 100,000 runs (see below).

## Learns in ~500 ms

**Single decisions take about 300 ms; nine in ten are under 440 ms.** Across 82 recorded classifier calls the median was **300 ms**, the p90 435 ms, and 75 of the 82 were under 500 ms. The slowest was 798 ms, a `scan` sweeping 401 questions. Measured 2026-09-30 and 10-01 from our own ledgers: the three WordPress journeys in [mm3-journeys](https://github.com/mvp-scale/mm3-journeys) plus the demo and play projects.

"Learns" means a question MM3 has not answered before: it goes to the classifier, and the answer is stored so the next ask is a "knows". Every paid call records its own `latencyMs` in the ledger (`telemetry`), measured locally around the call. Only the real classifier is counted here; the fake provider and failed calls are left out, and a run copied between ledgers is counted once (by its `uid`).

The front-page picture puts a rough guide in gray beside each verb, with a tilde because it is a guide and not a measurement: `view` about 20 ms and the other five about 500 ms. The header says the same ("Knows in ~20 ms. Learns in ~500 ms."). What the calls show behind each:

| Verbs | Guide on the picture | What the calls show |
|---|---|---|
| `view` | ~20 ms | medians 4.3 to 9.6 ms and p90 up to 15.6 ms (section above) |
| `class`, `replay`, `drill`, `loop` | ~500 ms | median about 300 ms; 67 of 68 calls under 500 ms, 66 under 400, 41 under 300; the slowest was 535 ms |
| `scan` | ~500 ms | median 490 ms; 8 of 14 calls under 500 ms, 13 under 700, all under 800; the slowest was 798 ms |

`scan` is the slowest because it sweeps many items in one call, so it sits at the top of the guide. If the classifier, the model or the request size changes, so will these times, which is why every figure here carries a tilde. The guide is not tied to the picture's Know, Judge and Prove columns: a verb's speed depends on what it does, not which column it sits in. The per-verb numbers behind it, small samples all:

| Verb | Calls | Fastest | Median | p90 | Slowest | Questions per call |
|---|---|---|---|---|---|---|
| `class` | 35 | 166 | 294 | 364 | 381 | 11–31 |
| `replay` | 9 | 147 | 249 | 435 | 435 | 1–13 |
| `scan` | 14 | 317 | 490 | 649 | 798 | 21–401 |
| `drill` | 11 | 227 | 273 | 320 | 346 | 12–121 |
| `loop` | 13 | 200 | 266 | 379 | 535 | 3–380 |

(Milliseconds.) `view` is not in this table because it makes no classifier call; its figures are in the section above.

Method: take every provider call with `status: ok` and a `jev` model from each ledger, once per run `uid`.

```bash
node -e '
const fs = require("fs"); const seen = new Set(); const by = {};
for (const f of process.argv.slice(1))                         // pass your log.jsonl files
  for (const l of fs.readFileSync(f, "utf8").trim().split("\n")) {
    const x = JSON.parse(l); if (x.kind !== "run") continue;
    (x.telemetry || []).forEach((t, i) => {
      const k = (x.uid || x.id) + "#" + i;
      if (t.source !== "provider" || t.status !== "ok" || !/jev/.test(t.model) || seen.has(k)) return;
      seen.add(k); (by[x.verb] = by[x.verb] || []).push(t.latencyMs);
    });
  }
const q = (a, p) => a[Math.min(a.length - 1, Math.floor(p * a.length))];
for (const [v, a] of Object.entries(by)) { a.sort((x, y) => x - y); console.log(v.padEnd(7), a.length, "calls: fastest", a[0], "median", q(a, 0.5), "p90", q(a, 0.9), "slowest", a[a.length - 1]); }
' wordpress/run-*/ledger/log.jsonl
```

Caveats, and they matter:

- **`scan` is the slow verb.** It sweeps many items in one call (up to 401 questions here), so its median is 490 ms and its p90 649 ms. "Learns in 500" is true for single decisions (`class`, `drill`, `loop`, `replay`: p90 at most 435 ms) and not for a broad sweep.
- The samples are small for four of the five verbs (9 to 14 calls each), so treat those ranges as indicative.
- One classifier (TypeSafe `jev-1.13.0`) on one endpoint, and the figure is the provider call alone, not MM3's own work around it (a few milliseconds, as above). We do not claim the same time for other endpoints.
- The snippet above, run on the three public journey ledgers alone, covers 21 of the 82 calls (median 262 ms, p95 382 ms, 20 under 500 ms, slowest 535 ms).

## Tested to 100,000 runs

The ledger bench builds a generated ledger of 10,000 and of 100,000 runs (`test/gen/synthetic-ledger.ts`, fixed seed) and times each operation. The full tables are in [`docs/evidence/ledger-scale.md`](evidence/ledger-scale.md).

```bash
npm run bench:ledger -- --sizes 10000,100000
```

What stays fast at 100,000 runs, and what does not (p50, from the committed evidence):

| Operation | At 100,000 runs |
|---|---|
| Look up an answer that is already stored (`reuseHit`) | 0.8 ms |
| Look up a question never asked (`reuseMiss`) | 0.7 ms |
| Browse what is known about a place (`placeBroad`, `placeNarrow`) | 7.6 s and 9.1 s |
| Rebuild the index from the log | 16 s |
| Rebuild the graph | 48 s |

So "tested to 100,000 runs" does not mean everything stays fast: the exact-answer lookup does, and browsing a whole place or rebuilding an index does not. Caveats: generated data, not a real ledger; the run counts are runs, not distinct questions; the browse figures were noisy on a shared machine.

## What calibrated means

A verdict's numbers (`p`, the odds on a question) are the classifier's own probability that the answer is yes. "Calibrated" is the claim that those odds mean what they say: of the answers given 0.9, about nine in ten turn out right, so a false pass at 0.9 happens about one time in ten.

That is a property of the classifier (TypeSafe's Jev), not something MM3 has measured across its own runs. MM3 does not re-calibrate anything. It keeps the odds with every answer, and `mm3 outcome` records whether each verdict held, so `mm3 report` can show, over time and on your own code, which verdicts to distrust. Until you have that history, treat 0.9 as "probably right", and `unsure` as a real answer.
