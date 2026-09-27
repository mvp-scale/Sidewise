// The scope guard (lessons-2026-09-27.md §4.3 option (a)): a hidden per-category probe, "can this be judged
// from the code shown?", and what a low answer does to a category's gate. Built and tested here in isolation;
// NOT wired into any verb yet (see src/contract/scope-guard.ts's own header for why).
import { describe, expect, it } from 'vitest';
import { applyScopeGuard, scopeProbeQuestion } from '../../src/contract/scope-guard.ts';

describe('scopeProbeQuestion', () => {
  it('is a yes/no question keyed off the category name, asking whether the code shown is enough', () => {
    const q = scopeProbeQuestion('injection');
    expect(q.kind).toBe('yesno');
    expect(q.id).toBe('injection__scope');
    expect(q.n).toBeNull();
    expect(q.text.toLowerCase()).toContain('injection');
    expect(q.text).toMatch(/code shown/);
  });

  it('keys different categories to different ids, so probes never collide', () => {
    expect(scopeProbeQuestion('guards').id).not.toBe(scopeProbeQuestion('access').id);
  });
});

describe('applyScopeGuard', () => {
  it('leaves the gate untouched on a clear pass (probe P(yes) >= 0.70)', () => {
    expect(applyScopeGuard('pass', 0.7, 'injection')).toEqual({ gate: 'pass' });
    expect(applyScopeGuard('fail', 0.95, 'injection')).toEqual({ gate: 'fail' });
  });

  it('leaves the gate untouched on a mid-range probe (neither a clear pass nor a clear miss)', () => {
    expect(applyScopeGuard('pass', 0.5, 'injection')).toEqual({ gate: 'pass' });
    expect(applyScopeGuard('fail', 0.31, 'injection')).toEqual({ gate: 'fail' });
  });

  it('forces unsure and adds a note naming the category on a clear miss (P(yes) <= 0.30), whatever the original gate', () => {
    expect(applyScopeGuard('pass', 0.3, 'injection')).toEqual({ gate: 'unsure', note: 'evidence not in scope for injection → add more of the surrounding code' });
    expect(applyScopeGuard('fail', 0.1, 'access')).toEqual({ gate: 'unsure', note: 'evidence not in scope for access → add more of the surrounding code' });
  });
});
