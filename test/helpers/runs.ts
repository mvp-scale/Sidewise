import type { NewContractRun, NewRun } from '../../src/ledger/log.ts';

export function sampleRun(over: Partial<NewRun> = {}): NewRun {
  return {
    verb: 'class',
    level: 1,
    actor: 'reviewer',
    perspective: 'reviewer',
    where: [{ path: 'src/api/user.ts', area: 'api' }],
    problem: 'login lookup builds SQL',
    tags: ['sql'],
    focus: 'handler is safe to merge',
    slots: [{ pos: 1, text: 'Is request text in the query?', reverse: false, p: 0.9 }],
    primitives: [],
    consensus: 'STRONG',
    verdict: 'concern',
    notes: [],
    adapter: 'stub',
    model: 'stub-1',
    costUsd: 0,
    task: null,
    ...over,
  };
}

/** A class-shaped contract run: one category, question 1 answered yes (0.9), keyed "k-1". */
export function sampleContractRun(over: Partial<NewContractRun> = {}): NewContractRun {
  return {
    verb: 'class',
    actor: 'reviewer',
    task: null,
    goal: 'The handler is safe to merge',
    depth: 'quick',
    where: ['src/api/user.ts'],
    parent: null,
    from: null,
    compare: null,
    mdl: { why: 'validate', area: 'api' },
    ask: { categories: [{ name: 'injection', section: 'concerns', pass: 'no', need: 'all', tags: ['sql'], questions: [{ n: 1, kind: 'yesno', text: 'Is request text in the query?' }] }], layers: [] },
    over: null,
    items: null,
    answers: { goal: { kind: 'yesno', p: 0.2 }, 1: { kind: 'yesno', p: 0.9 } },
    keys: { goal: 'k-goal', 1: 'k-1' },
    reusedFrom: {},
    categories: { injection: 'fail' },
    gate: 'fail',
    goalGate: 'fail',
    goalP: 0.2,
    consensus: 'STRONG',
    response: (id, budget) => `mak:\n  id: ${id}\n  gate: fail\nnotes: [${budget}]\n`,
    notes: [],
    adapter: 'stub',
    model: 'stub-1',
    costUsd: 0,
    calls: 1,
    ...over,
  };
}
