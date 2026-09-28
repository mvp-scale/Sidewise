# Sidewise

**A System One needs a Knowledge One.**

<p align="center"><img src="docs/assets/knowledge-one-compare.svg" width="1000" alt="System One is great, but the scaffolding is yours to build. A checklist: caching, templates, well-formed checking, many angles, routing, context, a traceable record, knowledge you can build on, learning. System One alone: your job. Knowledge One: built in."></p>

Turn a yes/no checklist about your code into a calibrated pass / fail / unsure verdict, and keep everything it learns.

[![License](https://img.shields.io/badge/license-Apache--2.0-blue)](LICENSE) [![npm](https://img.shields.io/npm/v/@mvpscale/sidewise)](https://www.npmjs.com/package/@mvpscale/sidewise) [![Claude Code plugin](https://img.shields.io/badge/Claude%20Code-plugin-orange)](#install)

```
Builders want agents that make the call…    minus the homework they graded themselves.
Founders want every merge reviewed…         without paying twice for the same answer.
```

## See it

<p align="center"><img src="docs/assets/knowledge-one.svg" width="1000" alt="Top lane: your prompt goes through a System One you do not control, one yes/no, the code ships, no trace. Bottom lane: a standard request is validated for free, checked for reuse, routed, answered per concern, kept in an append-only ledger and indexed in SQLite; the next ask starts smarter."></p>

The code (`src/user.ts`):

```ts
export async function getUser(req, db) {
  return db.query("SELECT * FROM users WHERE id = " + req.query.id);
}
```

You ask: the full request, 10 yes/no questions plus a severity scale and a routing choice:

```yaml
side:
  goal: This login handler is safe to merge
  depth: quick
  where: [src/user.ts:1-3]
  ask:
    injection:
      pass: no
      1: Is request text placed directly into the SQL query?
      2: Could a caller change what the query does?
      10: Would a standard security scanner flag this code?
    guards:
      pass: yes
      need: most
      tags: [sql, backend]
      3: Is the id checked to be a number before use?
      6: Is the caller compared to the record owner?
      9: Does the query select only needed columns?
    access:
      pass: no
      4: Could one user read another user's record?
      5: Can any caller read any record without a permission check?
    leaks:
      pass: no
      7: Does the error sent back reveal the query?
      8: Does the code log an email address?
    severity:
      pass: [none, low]
      11:
        scale: How severe is the worst issue?
        levels: [none, low, medium, high, critical]
    route:
      pass: [ship]
      12:
        choice: Where should this go?
        options: [ship, fix, block]
wise:
  why: validate
  area: data
```

You get: one call to TypeSafe's Jev, real output:

```yaml
side:
  id: SW-0001
  gate: fail
  goal: {gate: fail, p: 0.02}
  injection: {gate: fail, 1: 0.98, 2: 0.93, 10: 0.95}
  guards: {gate: fail, 3: 0.03, 6: 0.05, 9: 0.09}
  access: {gate: fail, 4: 0.92, 5: 0.84}
  leaks: {gate: unsure, 7: 0.48, 8: 0.01}
  severity: {gate: fail, 11: {top: critical, p: 0.97}}
  route: {gate: fail, 12: {top: fix, p: 0.55}}
  consensus: STRONG
  escalate: false
wise: {recorded: [why, area]}
next: sidewise template drill --parent SW-0001 --from injection
```

Every concern has its own verdict and odds. The goal fails, severity is critical, and `next:` says where to look deeper. It's all kept, reused free until the code changes, and mapped by `sidewise report`.

## Install

**Claude Code:**
```
/plugin marketplace add mvp-scale/Sidewise
/plugin install sidewise@mvp-scale
```
Pick **project** scope. For the key: press Enter on "TypeSafe API key", paste, Enter, "Save configuration".

**Anywhere else** (terminal, Codex, Gemini CLI…), inside your project:
```bash
npx @mvpscale/sidewise init
```
Needs Node 22.13+. No key? Free sample answers, clearly labelled, never evidence.

## Quickstart

```bash
# sidewise-quickstart
sidewise template class > review.yaml
sidewise class review.yaml
sidewise view src
sidewise report
sidewise outcome SW-0001 held --by you
sidewise budget
```

Agents: run `sidewise agent` first. Humans: `sidewise help`.

## Why: a Knowledge One system

Classifiers got good. TypeSafe's Jev answers a plain question about your code with a calibrated yes or no, fast, for a fraction of a cent. Drop one into your agent and it will make a bad call you can't trace. Running it ten more times is louder, not smarter.

What's needed is a standard way to ask, and a place to keep what you learn:

```
1. Engineering leads want a decision…       without betting on one angle.
2. Founders want answers now…               without paying twice.
3. Builders want answers they can act on…   minus yesterday's code.
4. Security teams want proof a fix worked…  instead of self-approval.
5. Vibe coders want to get wiser…           instead of starting from zero every morning.
6. You…                                     tell us what we missed.
```

Sidewise splits the problem in half: **Side** decides now, **Wise** learns as you go.

## Honest status

Tested end to end with Claude Opus 5.5 and Sonnet 5 on a real app with planted flaws; other agents next. Built on TypeSafe's Jev; other classifiers can plug in. Our last full test: $0.0005 for a whole review session.

## More

[The contract](docs/contract.md) · [Evidence for every claim](docs/evidence/README.md) · Apache-2.0, free. Enjoy.
