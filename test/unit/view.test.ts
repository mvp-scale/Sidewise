import { describe, expect, it } from 'vitest';
import { appendOutcome, appendRun } from '../../src/ledger/log.ts';
import { runView } from '../../src/verbs/view.ts';
import { tempProject } from '../helpers/project.ts';
import { sampleRun } from '../helpers/runs.ts';

const at = (day: number) => Date.parse(`2026-09-${String(day).padStart(2, '0')}T12:00:00Z`);

describe('view', () => {
  it('a folder shows outcome counts and runs newest first; a tag works too', () => {
    const { paths } = tempProject({});
    appendRun(paths, sampleRun({ focus: 'first' }), at(20));
    appendRun(paths, sampleRun({ focus: 'second', where: [{ path: 'src/db/pool.ts' }], tags: ['perf'] }), at(21));
    appendRun(paths, sampleRun({ focus: 'third' }), at(22));
    appendOutcome(paths, 'SW-0001', 'held', 'owner');
    appendOutcome(paths, 'SW-0003', 'overruled', 'owner');
    expect(runView('src/api', 1, paths)).toEqual({
      exit: 0,
      text: [
        'sidewise view src/api · 2 runs · held 1 · overruled 1 · failed 0 · open 0',
        'SW-0003 2026-09-22 class L1 STRONG concern "third" · overruled',
        'SW-0001 2026-09-20 class L1 STRONG concern "first" · held',
      ].join('\n'),
    });
    expect(runView('./src/', 1, paths).text.split('\n')[0]).toBe('sidewise view src · 3 runs · held 1 · overruled 1 · failed 0 · open 1');
    expect(runView('perf', 1, paths).text).toContain('SW-0002 2026-09-21 class L1 STRONG concern "second" · open');
  });

  it('an empty place says how to start', () => {
    const { paths } = tempProject({});
    expect(runView('docs', 1, paths)).toEqual({ exit: 0, text: 'sidewise view docs · no runs yet → "sidewise class <request>" starts one' });
  });

  it('shows 10 runs at L1 and says how many are older', () => {
    const { paths } = tempProject({});
    for (let i = 0; i < 12; i++) appendRun(paths, sampleRun({ focus: `run ${i}` }));
    const lines = runView('src', 1, paths).text.split('\n');
    expect(lines).toHaveLength(12);
    expect(lines[11]).toBe('… 2 older → raise the level to see more');
    expect(runView('src', 2, paths).text.split('\n')).toHaveLength(13);
  });

  it('a run id shows its lineage up and down', () => {
    const { paths } = tempProject({});
    appendRun(paths, sampleRun({ focus: 'root' }), at(20));
    appendRun(paths, sampleRun({ focus: 'child', parent: 'SW-0001' }), at(21));
    appendRun(paths, sampleRun({ focus: 'grandchild', parent: 'SW-0002' }), at(22));
    expect(runView('SW-0002', 1, paths).text).toBe(
      [
        'sidewise view SW-0002 · lineage 1 up · 1 down',
        '↑ SW-0001 2026-09-20 class L1 STRONG concern "root" · open',
        '▶ SW-0002 2026-09-21 class L1 STRONG concern "child" · open',
        '↓ SW-0003 2026-09-22 class L1 STRONG concern "grandchild" · open',
      ].join('\n'),
    );
  });

  it('an unknown id exits 2 with a fix', () => {
    const { paths } = tempProject({});
    expect(runView('SW-0099', 1, paths)).toEqual({ exit: 2, text: '✖ view: SW-0099 is not in the ledger → "sidewise view <folder>" lists recent runs' });
  });
});
