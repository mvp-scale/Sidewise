import type { NewRun } from '../../src/ledger/log.ts';

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
