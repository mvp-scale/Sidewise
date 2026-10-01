// on reuse, one source:'cache' telemetry entry per distinct origin run, prorated from
// that origin's own provider telemetry.
import { describe, expect, it } from 'vitest';
import { appendContractRun } from '../../src/ledger/log.ts';
import { cacheTelemetry } from '../../src/ledger/reuse.ts';
import { sampleContractRun } from '../helpers/runs.ts';
import { tempProject } from '../helpers/project.ts';

describe('cacheTelemetry', () => {
  it('no reuse at all: no entries', () => {
    const { paths } = tempProject({});
    expect(cacheTelemetry(paths, {})).toEqual([]);
  });

  it('reusing PART of an origin\'s call: prorated tokens/cost, estimated: true', () => {
    const { paths } = tempProject({});
    const origin = appendContractRun(
      paths,
      sampleContractRun({
        costUsd: 0.04,
        telemetry: [{ source: 'provider', model: 'stub-1', questions: 4, inputTokens: 400, latencyMs: 5, status: 'ok', evidenceBytes: 10, costUsd: 0.04 }],
      }),
      Date.now(),
      'free',
    );
    const entries = cacheTelemetry(paths, { q1: origin.id, q2: origin.id }); // 2 of the origin's own 4 questions
    expect(entries).toEqual([{ source: 'cache', from: origin.id, questions: 2, original: { inputTokens: 200, costUsd: 0.02 }, savedUsd: 0.02, estimated: true }]);
  });

  it('reusing the origin\'s ENTIRE call whole: exact figures, not an estimate', () => {
    const { paths } = tempProject({});
    const origin = appendContractRun(
      paths,
      sampleContractRun({
        costUsd: 0.04,
        telemetry: [{ source: 'provider', model: 'stub-1', questions: 4, inputTokens: 400, latencyMs: 5, status: 'ok', evidenceBytes: 10, costUsd: 0.04 }],
      }),
      Date.now(),
      'free',
    );
    const entries = cacheTelemetry(paths, { q1: origin.id, q2: origin.id, q3: origin.id, q4: origin.id });
    expect(entries).toEqual([{ source: 'cache', from: origin.id, questions: 4, original: { inputTokens: 400, costUsd: 0.04 }, savedUsd: 0.04, estimated: false }]);
  });

  it('an origin with no provider telemetry at all: tokens/cost omitted, still estimated: true', () => {
    const { paths } = tempProject({});
    const origin = appendContractRun(paths, sampleContractRun({ telemetry: [] }), Date.now(), 'free');
    expect(cacheTelemetry(paths, { q1: origin.id })).toEqual([{ source: 'cache', from: origin.id, questions: 1, original: {}, estimated: true }]);
  });

  it('an origin id not in the ledger at all: same "nothing to prorate from" shape, never throws', () => {
    const { paths } = tempProject({});
    expect(cacheTelemetry(paths, { q1: 'MM3-9999' })).toEqual([{ source: 'cache', from: 'MM3-9999', questions: 1, original: {}, estimated: true }]);
  });

  it('two distinct origins: one entry each', () => {
    const { paths } = tempProject({});
    const a = appendContractRun(paths, sampleContractRun({ telemetry: [] }), Date.now(), 'free');
    const b = appendContractRun(paths, sampleContractRun({ telemetry: [] }), Date.now(), 'free');
    const entries = cacheTelemetry(paths, { q1: a.id, q2: a.id, q3: b.id });
    expect(entries).toHaveLength(2);
    expect(entries.find((e) => e.source === 'cache' && e.from === a.id)).toMatchObject({ questions: 2 });
    expect(entries.find((e) => e.source === 'cache' && e.from === b.id)).toMatchObject({ questions: 1 });
  });
});
