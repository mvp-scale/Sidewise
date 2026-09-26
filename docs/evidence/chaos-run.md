# Agent chaos run

Generated 2026-09-26T13:23:23.996Z by `scripts/chaos-report.ts` from `test/fixtures/chaos/recorded-results.json`.

Sidewise itself stays offline for this run (`SIDEWISE_PROVIDER=chaos`, no TypeSafe key) — only the agent CLIs call out, on their own login. Caps: 3 scenarios shared across both agents (not 3 each), one agent at a time, a 90s wall-clock `SIGKILL` timeout per run. `claude -p` is capped at $0.20/run via `--max-budget-usd`, the one cap that is both real and enforced. `gemini -p` has no cost or turn cap flag at all — its wall-clock timeout is the *only* cap, stated here plainly rather than pretending otherwise.

## Runs

| agent | scenario | ok | exit | duration | cost | summary |
|---|---|---|---|---|---|---|
| claude | clean | yes | 0 | 7.1s | $0.1953 | The overall `gate` came back as **fail** (route says `block`, consensus is `SPLIT`, and it's flagged to escalate), and the `next:` line says to drill into the failing guards section by running `sidewise template drill --parent SW-0001 --from guards`, which I haven't run since you asked for a single… |
| claude | retry-after-503 | yes | 0 | 9.6s | $0.0611 | 🟢 **GREEN, FYI only.** The retry worked. Attempt 1 exited with code 1 and attempt 2 exited with code 0. I ran the command exactly twice. \| Attempt \| Exit code \| Result \| |
| claude | malformed-answer | yes | 0 | 5.2s | $0.0454 | 🔴 **RED — the command failed.** It didn't classify the request, and no `gate` value was printed. - **Exit code:** 1 |
| gemini | clean | yes | 0 | 10.1s | n/a | The `gate` came back as `fail`, and the `next:` line tells me to run the command `sidewise template drill --parent SW-0001 --from guards`. |
| gemini | retry-after-503 | yes | 0 | 15.0s | n/a | Here is the summary of the execution results for the Sidewise command: ### First Attempt |
| gemini | malformed-answer | yes | 0 | 9.7s | n/a | Exit Code: 1 ✖ classifier: the goal probability 1.4 is not between 0 and 1 → retry; the call was counted against the budget |

