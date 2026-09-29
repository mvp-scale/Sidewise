# Agent chaos run

Generated 2026-09-26T13:23:23.996Z by `scripts/chaos-report.ts` from `test/fixtures/chaos/recorded-results.json`.

MM3 itself stays offline for this run (`MM3_PROVIDER=chaos`, no TypeSafe key) — only the agent CLIs call out, on their own login. Caps: 3 scenarios shared across both agents (not 3 each), one agent at a time, a 90s wall-clock `SIGKILL` timeout per run. `claude -p` is capped at $0.20/run via `--max-budget-usd`, the one cap that is both real and enforced. `gemini -p` has no cost or turn cap flag at all — its wall-clock timeout is the *only* cap, stated here plainly rather than pretending otherwise.

Models: claude ran with `--model sonnet`; gemini ran with `--model flash`.

What this run does not prove: it is 3 scenarios, run once each, against these specific models only — a different model, prompt, or a second run of the same scenario could behave differently. gemini's cost is unknown by construction (its JSON output carries no dollar figure), not merely unmeasured this time.

## Runs

| agent | model | scenario | ok | exit | duration | cost | summary |
|---|---|---|---|---|---|---|---|
| claude | sonnet | clean | yes | 0 | 7.1s | $0.1953 | The overall `gate` came back as **fail** (route says `block`, consensus is `SPLIT`, and it's flagged to escalate), and the `next:` line says to drill into the failing guards section by running `mm3 template drill --parent MM3-0001 --from guards`, which I haven't run since you asked for a single… |
| claude | sonnet | retry-after-503 | yes | 0 | 9.6s | $0.0611 | 🟢 **GREEN, FYI only.** The retry worked. Attempt 1 exited with code 1 and attempt 2 exited with code 0. I ran the command exactly twice. \| Attempt \| Exit code \| Result \| |
| claude | sonnet | malformed-answer | yes | 0 | 5.2s | $0.0454 | 🔴 **RED — the command failed.** It didn't classify the request, and no `gate` value was printed. - **Exit code:** 1 |
| gemini | flash | clean | yes | 0 | 10.1s | n/a | The `gate` came back as `fail`, and the `next:` line tells me to run the command `mm3 template drill --parent MM3-0001 --from guards`. |
| gemini | flash | retry-after-503 | yes | 0 | 15.0s | n/a | Here is the summary of the execution results for the MM3 command: ### First Attempt |
| gemini | flash | malformed-answer | yes | 0 | 9.7s | n/a | Exit Code: 1 ✖ classifier: the goal probability 1.4 is not between 0 and 1 → retry; the call was counted against the budget |

