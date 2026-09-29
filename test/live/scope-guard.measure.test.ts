/**
 * Live measurement (owner ruling, lab/research/2026-09-27-phase-b-measure.md): does the unwired scope guard
 * (src/contract/scope-guard.ts) actually catch out-of-scope evidence, against the REAL TypeSafe classifier?
 * Skipped unless SIDEWISE_LIVE_TEST=1 (AGENTS.md rule 2) — this is the one place a real key and a real call
 * are allowed; it never runs as part of `npm test`/CI (the `live` vitest project is excluded from both).
 *
 * 10 fixed cases, written down BEFORE any call: 5 in-scope (the excerpt shown fully decides the answer) and 5
 * out-of-scope (the true answer depends on code — a called function, a base class, a config source — that
 * isn't shown). Each case is exactly ONE call to the real client: the category's own yes/no questions plus
 * `scopeProbeQuestion(name)`, batched into the same `questions` map (never two calls for the same case — the
 * owner's constraint on not hammering the paid API). From that single answer set:
 *   - the gate WITHOUT the guard: `gradeCategory` on the category's own answers alone (today's, unwired,
 *     behavior — the probe's answer is simply never looked at);
 *   - the gate WITH the guard: `applyScopeGuard` folding the same call's probe answer into that gate.
 * Call budget: exactly 10 live calls expected (one per case); a counter throws before a 12th would ever be
 * sent (10 cases + 1 spare for the typesafe client's own built-in 429/529 retry, which is still one logical
 * `ask()` from here — client.ts already retries that transparently, so this file adds no retry loop of its
 * own). Spend budget: stop before the running total would pass $0.10 (expected: several orders of magnitude
 * under $0.01 at the published jev-1.13.0 rate, ~$0.042/Mtok input, output free).
 *
 * All code excerpts below are synthetic fixtures written for this test, never a real log or real Sidewise
 * source (AGENTS.md rule 4).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { gradeCategory } from '../../src/contract/grade.ts';
import { applyScopeGuard, scopeProbeQuestion } from '../../src/contract/scope-guard.ts';
import type { Answer, Category, Gate } from '../../src/contract/types.ts';
import { createJevClient, hasKey, noulQuestion, resolveJevConfig, type JevRequest } from '../../src/classifier/typesafe/client.ts';
import { redact, registerSecret } from '../../src/ledger/redact.ts';
import { resolveStoredKey } from '../../src/setup/keystore.ts';
import { realRunner } from '../../src/setup/runner.ts';

/** One case: a category (2 yes/no questions, sharing one `pass` polarity) plus a short code excerpt as its
 *  only evidence. `expectedGate` is the truth for an in-scope case (the excerpt alone decides it); an
 *  out-of-scope case has no expected pass/fail — the only right answer is `unsure`, because the excerpt
 *  genuinely doesn't decide it (a called function, a base class or a config source, not shown). */
interface Case {
  id: string;
  name: string;
  pass: 'yes' | 'no';
  inScope: boolean;
  expectedGate?: Gate;
  questions: readonly [string, string];
  code: string;
}

const CASES: readonly Case[] = [
  // --- in-scope: fully decidable from the excerpt shown -------------------------------------------------
  {
    id: 'null-check',
    name: 'null-check',
    pass: 'yes',
    inScope: true,
    expectedGate: 'pass',
    questions: ['Does the function check `user` for null before accessing `user.email`?', 'Is `user.email` read only after that null check has run?'],
    code: `function greet(user: { email: string } | null): string {
  if (user === null) {
    return 'Hello, guest';
  }
  return \`Hello, \${user.email}\`;
}`,
  },
  {
    id: 'secret-handling',
    name: 'secret-handling',
    pass: 'yes',
    inScope: true,
    expectedGate: 'fail',
    questions: ['Is the Stripe key loaded from an environment variable rather than written as a literal string?', 'Is the string `sk_live_` absent from this file?'],
    code: `const STRIPE_KEY = '${"sk" + "_live_" + "51NxAmpleFakeKeyDoNotUse00000000"}';
function charge(amount: number, stripeClient: { charges: { create: (p: unknown, o: unknown) => unknown } }) {
  return stripeClient.charges.create({ amount, currency: 'usd' }, { apiKey: STRIPE_KEY });
}`,
  },
  {
    id: 'sql-injection',
    name: 'sql-injection',
    pass: 'yes',
    inScope: true,
    expectedGate: 'fail',
    questions: ['Is the SQL query built with a parameterized placeholder instead of string interpolation?', 'Is `req.query.id` kept out of the raw SQL text?'],
    code: `function findUser(req: { query: { id: string } }, db: { query: (sql: string) => unknown }) {
  const sql = \`SELECT * FROM users WHERE id = \${req.query.id}\`;
  return db.query(sql);
}`,
  },
  {
    id: 'loop-bounds',
    name: 'loop-bounds',
    pass: 'yes',
    inScope: true,
    expectedGate: 'fail',
    questions: ['Does the loop stop before `i` reaches `items.length`?', 'Is `items[i]` accessed only while `i` is a valid index?'],
    code: `function sumAll(items: number[]): number {
  let total = 0;
  for (let i = 0; i <= items.length; i++) {
    total += items[i]!;
  }
  return total;
}`,
  },
  {
    id: 'dead-import',
    name: 'dead-import',
    pass: 'yes',
    inScope: true,
    expectedGate: 'fail',
    questions: ['Is the imported `format` function called anywhere in this file?', 'Would removing the `format` import change this file’s behavior?'],
    code: `// The entire contents of src/report/summarize.ts.
import { format } from './formatter.ts';

export function summarize(count: number): string {
  return \`\${count} items processed\`;
}`,
  },
  // --- out-of-scope: the true answer depends on code that isn't shown -----------------------------------
  {
    id: 'validated-input',
    name: 'validated-input',
    pass: 'yes',
    inScope: false,
    questions: ['Does `validateInput` reject a payload with a negative `amount`?', 'Is `payload` guaranteed to be non-null after `validateInput` returns truthy?'],
    code: `function handlePayment(payload: unknown, validateInput: (p: unknown) => unknown, process: (p: unknown) => unknown) {
  const valid = validateInput(payload);
  if (!valid) return { error: 'invalid' };
  return process(valid);
}`,
  },
  {
    id: 'config-bounds',
    name: 'config-bounds',
    pass: 'yes',
    inScope: false,
    questions: ['Is `timeout` guaranteed to be a positive number?', "Does `getConfig('timeout')` fall back to a safe default when the key is missing?"],
    code: `function withTimeout(task: () => void, getConfig: (key: string) => number, runWithDeadline: (t: () => void, ms: number) => void) {
  const timeout = getConfig('timeout');
  return runWithDeadline(task, timeout);
}`,
  },
  {
    id: 'admin-gate',
    name: 'admin-gate',
    pass: 'yes',
    inScope: false,
    questions: ["Does `isAdmin(user)` correctly verify the user's role against the database?", 'Is it impossible for a non-admin user to reach `deleteAccount` here?'],
    code: `function handleDelete(user: { id: string }, accountId: string, isAdmin: (u: unknown) => boolean, deleteAccount: (id: string) => unknown) {
  if (isAdmin(user)) {
    return deleteAccount(accountId);
  }
  return { error: 'forbidden' };
}`,
  },
  {
    id: 'base-sanitize',
    name: 'base-sanitize',
    pass: 'yes',
    inScope: false,
    questions: ["Does the base class's constructor sanitize `id` before this subclass uses it?", 'Is `this.id` guaranteed to be free of path-traversal characters here?'],
    code: `class FileHandler extends BaseHandler {
  read(fs: { readFileSync: (p: string, enc: string) => string }): string {
    return fs.readFileSync(\`/data/\${this.id}\`, 'utf8');
  }
}`,
  },
  {
    id: 'cache-freshness',
    name: 'cache-freshness',
    pass: 'yes',
    inScope: false,
    questions: ['Does the cache module enforce a TTL that prevents this code from reading stale data?', 'Is `cache.get(key)` guaranteed to return data no older than 60 seconds?'],
    code: `function getUserProfile(key: string, cache: { get: (k: string) => unknown }, fetchAndCacheProfile: (k: string) => unknown) {
  const cached = cache.get(key);
  return cached ?? fetchAndCacheProfile(key);
}`,
  },
];

const categoryOf = (c: Case): Category => ({
  name: c.name,
  section: 'concerns',
  pass: c.pass,
  need: 'all',
  tags: [],
  questions: [
    { n: 1, kind: 'yesno', text: c.questions[0] },
    { n: 2, kind: 'yesno', text: c.questions[1] },
  ],
});

interface CaseResult {
  id: string;
  inScope: boolean;
  probeP: number;
  gateWithout: Gate;
  gateWith: Gate;
  rightWithout: boolean;
  rightWith: boolean;
  falseAlarm: boolean; // an in-scope (decidable) case the guard wrongly forced to unsure
  inputTokens: number;
  outputTokens: number;
  costUsd: number | undefined;
  costEstimated: boolean | undefined;
  note?: string;
}

const HARD_SPEND_CAP_USD = 0.1;
const MAX_LIVE_CALLS = 11; // 10 cases + 1 spare; the typesafe client already retries a 429/529 internally

// Durable capture: vitest's default/verbose reporters swallow console.log for a PASSING test in this repo's
// setup (confirmed with a zero-cost probe test before ever touching the live path), so the only reliable
// record of a live run is a file — never printed reporter output. lab/ is gitignored (never committed); this
// contains no secret, only the computed gates/probabilities/token counts/costs below.
const RESULTS_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../lab/research/2026-09-27-scope-guard-live-raw.json');

describe.skipIf(process.env.SIDEWISE_LIVE_TEST !== '1')('scope guard: measured against the live TypeSafe classifier', () => {
  it(
    'runs 10 fixed cases (one call each) and reports probe P, gate-without vs gate-with, and totals',
    async () => {
      const config = resolveJevConfig(process.env, { resolveStored: () => resolveStoredKey(realRunner, os.platform(), process.env) });
      if (!hasKey(config)) throw new Error('✖ no TypeSafe key resolvable (env, keychain, or ~/.config/sidewise/env) → run "sidewise init" first');
      registerSecret(config.apiKey); // defense in depth: never let the key's literal value reach a log line below
      const client = createJevClient(config);

      let calls = 0;
      let totalCostUsd = 0;
      let anyCostUnreported = false;
      let model: string | undefined;
      const results: CaseResult[] = [];

      for (const c of CASES) {
        calls += 1;
        if (calls > MAX_LIVE_CALLS) throw new Error(`live call budget exceeded: attempted call ${calls} > ${MAX_LIVE_CALLS}`);

        const probe = scopeProbeQuestion(c.name);
        const request: JevRequest = {
          state: { goal: `Review: ${c.name}`, code: { [`${c.id}.ts`]: c.code } },
          questions: {
            '1': noulQuestion(c.questions[0]),
            '2': noulQuestion(c.questions[1]),
            [probe.id]: noulQuestion(probe.text),
          },
        };

        let res;
        try {
          res = await client.ask(request);
        } catch (e) {
          throw new Error(redact(`case ${c.id}: classifier call failed: ${e instanceof Error ? e.message : String(e)}`));
        }

        const a1 = res.answers['1'];
        const a2 = res.answers['2'];
        const aProbe = res.answers[probe.id];
        if (!a1 || a1.type !== 'noul' || !a2 || a2.type !== 'noul' || !aProbe || aProbe.type !== 'noul') {
          throw new Error(`case ${c.id}: expected three noul answers back`);
        }

        const answers: Record<number, Answer> = { 1: { kind: 'yesno', p: a1.probability }, 2: { kind: 'yesno', p: a2.probability } };
        const graded = gradeCategory(categoryOf(c), (n) => answers[n]);
        const gateWithout = graded.gate;
        const guard = applyScopeGuard(gateWithout, aProbe.probability, c.name);
        const gateWith = guard.gate;

        const rightWithout = c.inScope ? gateWithout === c.expectedGate : gateWithout === 'unsure';
        const rightWith = c.inScope ? gateWith === c.expectedGate : gateWith === 'unsure';
        const falseAlarm = c.inScope && gateWith === 'unsure' && gateWithout !== 'unsure';

        if (res.costUsd === undefined) anyCostUnreported = true;
        totalCostUsd += res.costUsd ?? 0;
        if (totalCostUsd > HARD_SPEND_CAP_USD) throw new Error(`hard spend cap hit: $${totalCostUsd.toFixed(4)} > $${HARD_SPEND_CAP_USD} after case ${c.id}`);

        if (model === undefined) model = res.model;
        else expect(res.model, `case ${c.id}: model changed mid-run`).toBe(model);

        results.push({
          id: c.id,
          inScope: c.inScope,
          probeP: aProbe.probability,
          gateWithout,
          gateWith,
          rightWithout,
          rightWith,
          falseAlarm,
          inputTokens: res.usage.inputTokens,
          outputTokens: res.usage.outputTokens,
          costUsd: res.costUsd,
          costEstimated: res.costEstimated,
          note: guard.note,
        });
      }

      const confidentWrongWithout = results.filter((r) => (r.gateWithout === 'pass' || r.gateWithout === 'fail') && !r.rightWithout).length;
      const confidentWrongWith = results.filter((r) => (r.gateWith === 'pass' || r.gateWith === 'fail') && !r.rightWith).length;
      const falseAlarms = results.filter((r) => r.falseAlarm).length;
      const totalInputTokens = results.reduce((s, r) => s + r.inputTokens, 0);
      const totalOutputTokens = results.reduce((s, r) => s + r.outputTokens, 0);
      const costEstimated = results.some((r) => r.costEstimated);

      // Written before any console output: the reporter can swallow stdout, but the file always lands.
      mkdirSync(path.dirname(RESULTS_FILE), { recursive: true });
      writeFileSync(
        RESULTS_FILE,
        JSON.stringify(
          {
            model,
            calls,
            confidentWrongWithout,
            confidentWrongWith,
            falseAlarms,
            totalInputTokens,
            totalOutputTokens,
            totalCostUsd,
            costEstimated,
            anyCostUnreported,
            results,
          },
          null,
          2,
        ),
        'utf8',
      );

      // eslint-disable-next-line no-console
      console.log('\nid'.padEnd(20) + 'scope'.padEnd(8) + 'probeP'.padEnd(9) + 'without'.padEnd(10) + 'with'.padEnd(8) + 'rightW/o'.padEnd(10) + 'rightW');
      for (const r of results) {
        // eslint-disable-next-line no-console
        console.log(r.id.padEnd(20) + (r.inScope ? 'in' : 'out').padEnd(8) + r.probeP.toFixed(2).padEnd(9) + r.gateWithout.padEnd(10) + r.gateWith.padEnd(8) + String(r.rightWithout).padEnd(10) + String(r.rightWith));
      }
      // eslint-disable-next-line no-console
      console.log(
        `\nmodel=${model} calls=${calls} confidentWrongWithout=${confidentWrongWithout} confidentWrongWith=${confidentWrongWith} falseAlarms=${falseAlarms} ` +
          `tokens(in/out)=${totalInputTokens}/${totalOutputTokens} costUsd=${totalCostUsd.toFixed(6)} costEstimated=${costEstimated} anyCostUnreported=${anyCostUnreported}`,
      );

      expect(calls).toBeLessThanOrEqual(MAX_LIVE_CALLS);
      expect(calls).toBe(CASES.length);
      expect(totalCostUsd).toBeLessThan(HARD_SPEND_CAP_USD);
      expect(results).toHaveLength(CASES.length);
    },
    120_000,
  );
});
