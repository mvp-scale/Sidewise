// item B (round 4 fix batch G) [C-197]: a request/evidence stop already ends with "→ see: sidewise agent <verb>"
// (C-153, via verbs/request.ts's stopText, shared by class/scan/drill/loop/change/view). This file checks the
// remaining stops — a verb or tool's OWN validation logic, outside that shared path — land the same pointer,
// naming the right target. Structured as a flat table of {label, target, text} so a captain-owned cli.ts row
// (UsageStop, NO_PROJECT, outcome/budget argument checks) or a crew-3-owned template.ts row can be appended
// later without restructuring; the async drill cases sit alongside it since a table entry can't await.
import { describe, expect, it } from 'vitest';
import { checkBudget, loadBudget, recordSpend, setBudget } from '../../src/budget/budget.ts';
import { mkdirSync, writeFileSync } from 'node:fs';
import { appendOutcome, appendRun } from '../../src/ledger/log.ts';
import { runDrill } from '../../src/verbs/drill.ts';
import { runLoop } from '../../src/verbs/loop.ts';
import { runReport } from '../../src/verbs/report.ts';
import { runView } from '../../src/verbs/view.ts';
import { tempProject } from '../helpers/project.ts';
import { sampleRun } from '../helpers/runs.ts';
import { stubProvider } from '../helpers/stub-provider.ts';

const env = { SIDEWISE_ACTOR: 'r' };

/** Every stop text checked here ends "\n→ see: sidewise agent <target>" — no trailing content after it. */
function expectPointer(text: string, target: string): void {
  expect(text, `expected a "sidewise agent ${target}" pointer in: ${JSON.stringify(text)}`).toMatch(new RegExp(`\\n→ see: sidewise agent ${target}$`));
}

describe('every non-request-validation stop still points at its own "sidewise agent <target>" (item B)', () => {
  const cases: ReadonlyArray<{ label: string; target: string; text: string }> = (() => {
    const { paths: viewPaths } = tempProject({});
    const { paths: reportPaths } = tempProject({});
    const { paths: budgetPaths } = tempProject({});
    setBudget(budgetPaths, { capRuns: 1 });
    recordSpend(budgetPaths, 0);
    const corruptPaths = tempProject({}).paths;
    mkdirSync(corruptPaths.dir, { recursive: true });
    writeFileSync(corruptPaths.budget, '{ nope');
    const { paths: outcomePaths } = tempProject({});
    appendRun(outcomePaths, sampleRun({ actor: 'someone' })); // SW-0001

    const hasText = (v: unknown): v is { text: string } => !!v && typeof v === 'object' && typeof (v as { text?: unknown }).text === 'string';
    const textOf = (fn: () => unknown): string => {
      try {
        const r = fn();
        if (hasText(r)) return r.text;
        throw new Error(`expected a {text} result, got ${JSON.stringify(r)}`);
      } catch (e) {
        return (e as Error).message;
      }
    };

    return [
      { label: 'view: unknown run id', target: 'view', text: textOf(() => runView('SW-9999', 1, { paths: viewPaths, env: {} })) },
      { label: 'view: control characters in the target', target: 'view', text: textOf(() => runView('a\u0000b', 1, { paths: viewPaths, env: {} })) },
      { label: 'view: a path outside the project', target: 'view', text: textOf(() => runView('../../etc', 1, { paths: viewPaths, env: {} })) },
      { label: 'report: not a recognized view', target: 'report', text: textOf(() => runReport('nonsense', { paths: reportPaths })) },
      {
        label: 'budget: cap already reached',
        target: 'budget',
        text: textOf(() => {
          const gate = checkBudget(loadBudget(budgetPaths).state);
          if (gate.ok) throw new Error('expected the cap to already be reached');
          return { text: gate.message };
        }),
      },
      { label: 'budget: a corrupt budget.json', target: 'budget', text: textOf(() => loadBudget(corruptPaths)) },
      { label: 'outcome: an unknown run id', target: 'outcome', text: textOf(() => appendOutcome(outcomePaths, 'SW-9999', 'held', 'anyone')) },
      { label: 'outcome: the asking actor can\'t self-certify "held"', target: 'outcome', text: textOf(() => appendOutcome(outcomePaths, 'SW-0001', 'held', 'someone')) },
    ];
  })();

  it.each(cases)('$label', ({ target, text }) => expectPointer(text, target));

  // drill has several of its OWN stops beyond the evidence/parent-lookup ones stopText already covers — each
  // needs its own async setup (a real parent run), so these sit outside the sync table above.
  it('drill: an unknown parent', async () => {
    const { paths } = tempProject({});
    const r = await runDrill('side:\n  goal: check this\n  parent: SW-0042\n  from: x\n  ask:\n    a:\n      pass: yes\n      1: is it true?\n', {
      paths,
      provider: stubProvider(),
      env,
    });
    expectPointer(r.text, 'drill');
  });

  it('drill: side.over given when the parent was not a sweep', async () => {
    const { paths } = tempProject({ 'src/a.ts': 'export function f(x) { return x; }\n' });
    const classReq =
      'side:\n  goal: check this code\n  depth: quick\n  where: [src/a.ts]\n  ask:\n    injection:\n      pass: no\n' +
      Array.from({ length: 10 }, (_, i) => `      ${i + 1}: is question ${i + 1} true?\n`).join('');
    const { runClass } = await import('../../src/verbs/class.ts');
    await runClass(classReq, { paths, provider: stubProvider({ yes: () => 0.9 }), env }); // SW-0001
    const bad =
      'side:\n  goal: find the bug\n  parent: SW-0001\n  from: injection\n  over:\n    call: each\n  ask:\n    call:\n      x:\n        pass: no\n        1: is it unsafe?\n';
    const r = await runDrill(bad, { paths, provider: stubProvider(), env });
    expectPointer(r.text, 'drill');
  });

  // loop is already fully routed through stopText/loadRequest (like class/scan) — one smoke case confirms it,
  // rather than re-asserting C-153's own coverage.
  it('loop: an invalid request (no ask:) still points at "sidewise agent loop"', async () => {
    const { paths } = tempProject({});
    const r = await runLoop('side:\n  goal: x\n', { paths, provider: stubProvider(), env });
    expectPointer(r.text, 'loop');
  });
});
