// sidewise report [graph|problems|wise|calls|fields] (plan 2c C3): the graph-tier reader views wired into
// `report`, plus `fields`'s own undeclared-wise-key discovery and `--accept` write-back. Builds small
// hand-crafted ledgers (appendContractRun, same helper every other report test uses) and reads them back
// through `runReport` only — never the graph tier's own internals (ledger-graph.test.ts already covers those).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { withIndex } from '../../src/ledger/index.ts';
import { appendContractRun } from '../../src/ledger/log.ts';
import type { SidewisePaths } from '../../src/ledger/paths.ts';
import { runReport } from '../../src/verbs/report.ts';
import { tempProject } from '../helpers/project.ts';
import { sampleContractRun } from '../helpers/runs.ts';

const T = Date.now();

/** The hot tier's own on-disk index (ledger/index.ts) lags by exactly the most recent write until some other
 *  `withIndex` call (readOnly:false) catches it up — `nextRunNumber`'s own catch-up, run at the START of each
 *  append, only ever covers runs already on disk BEFORE that append. `wise`/`problems`/`calls`/`fields` all read
 *  the hot tier's own tables straight off disk (ledger/graph.ts), with no linear-scan fallback, so a test that
 *  appends and immediately reads needs one more (real, non-readOnly) `withIndex` call in between — exactly what
 *  a follow-up CLI command (another run, `sidewise outcome`, etc.) would naturally provide in real usage. */
function syncHotIndex(paths: SidewisePaths): void {
  withIndex(paths, () => undefined);
}

describe('runReport: graph-tier views, empty state', () => {
  it('problems/wise/calls/fields all say plainly there is nothing yet', () => {
    const { paths } = tempProject({});
    expect(runReport('problems', { paths }).text).toBe('sidewise report problems · no runs yet → "sidewise class <request>" starts one');
    expect(runReport('wise', { paths }).text).toBe('sidewise report wise · no runs yet → "sidewise class <request>" starts one');
    expect(runReport('calls', { paths }).text).toBe('sidewise report calls · no calls in the last 30 days → "sidewise class <request>" starts one');
    expect(runReport('fields', { paths }).text).toBe('sidewise report fields · no undeclared fields yet → every wise key so far is a base field or already configured');
  });

  it('graph with no target names how to give one; with a target but nothing there says not found [C-219]', () => {
    const { paths } = tempProject({});
    const noTarget = runReport('graph', { paths });
    expect(noTarget.exit).toBe(0);
    expect(noTarget.text).toBe('sidewise report graph · name a target → sidewise report graph <kind>:<label> (e.g. category:injection)');
    const notFound = runReport('graph', { paths }, 'category:injection');
    expect(notFound.exit).toBe(0);
    expect(notFound.text).toBe('sidewise report graph category:injection · not found → run "sidewise class <request>" first, or check the kind:label spelling');
  });

  it('graph rejects a target that is not kind:label', () => {
    const { paths } = tempProject({});
    const bad = runReport('graph', { paths }, 'notakindlabel');
    expect(bad.exit).toBe(2);
    expect(bad.text).toContain('✖ report graph: "notakindlabel" is not kind:label');
  });
});

describe('runReport: problems', () => {
  it('ranks family x place by gate counts, worst (most fail) first [C-220]', () => {
    const { paths } = tempProject({});
    const cat = (name: string, family: string) => ({ name, section: 'concerns' as const, pass: 'no' as const, need: 'all' as const, tags: [], family: family as never, questions: [{ n: 1, kind: 'yesno' as const, text: 'q?' }] });
    appendContractRun(paths, sampleContractRun({ where: ['src/a.ts'], ask: { categories: [cat('injection', 'injection')], layers: [] }, categories: { injection: 'fail' } }), T, 'b'); // SW-0001
    appendContractRun(paths, sampleContractRun({ where: ['src/b.ts'], ask: { categories: [cat('guards', 'guards')], layers: [] }, categories: { guards: 'pass' } }), T, 'b'); // SW-0002
    syncHotIndex(paths);
    const r = runReport('problems', { paths });
    expect(r.exit).toBe(0);
    expect(r.text).toContain('sidewise report problems · 2 rows');
    const lines = r.text.split('\n');
    expect(lines[1]).toContain('injection × src/a.ts · fail 1 unsure 0 pass 0'); // worst (fail) first
    expect(lines[2]).toContain('guards × src/b.ts · fail 0 unsure 0 pass 1');
  });
});

describe('runReport: wise', () => {
  it('lists every run\'s own wise fields, newest first [C-221]', () => {
    const { paths } = tempProject({});
    appendContractRun(paths, sampleContractRun({ where: ['src/a.ts'], wise: { why: 'validate', area: 'api', risk: 'high' } }), T, 'b'); // SW-0001
    appendContractRun(paths, sampleContractRun({ where: ['src/b.ts'], wise: { why: 'find', stage: 'build' } }), T + 1000, 'b'); // SW-0002, later ts
    syncHotIndex(paths);
    const r = runReport('wise', { paths });
    expect(r.exit).toBe(0);
    expect(r.text).toContain('sidewise report wise · 2 runs');
    const lines = r.text.split('\n');
    expect(lines[1]).toContain('SW-0002'); // newest first
    expect(lines[1]).toContain('why:find');
    expect(lines[2]).toContain('SW-0001');
    expect(lines[2]).toContain('risk:high');
  });
});

describe('runReport: calls', () => {
  it('rolls telemetry up by day/verb/model/source [C-222]', () => {
    const { paths } = tempProject({});
    appendContractRun(
      paths,
      sampleContractRun({
        where: ['src/a.ts'],
        telemetry: [{ source: 'provider', model: 'jev-1.13.0', questions: 1, latencyMs: 100, status: 'ok', evidenceBytes: 10, inputTokens: 200, outputTokens: 50, costUsd: 0.01 }],
      }),
      T,
      'b',
    ); // SW-0001
    syncHotIndex(paths);
    const r = runReport('calls', { paths });
    expect(r.exit).toBe(0);
    expect(r.text).toContain('sidewise report calls · 1 row');
    expect(r.text).toContain('jev-1.13.0 (provider) · calls 1 · tokens 250 · cost $0.0100');
  });
});

describe('runReport: graph', () => {
  it('shows the neighborhood around one kind:label target as predicate lines', () => {
    const { paths } = tempProject({});
    appendContractRun(
      paths,
      sampleContractRun({
        where: ['src/a.ts'],
        ask: { categories: [{ name: 'injection', section: 'concerns', pass: 'no', need: 'all', tags: [], questions: [{ n: 1, kind: 'yesno', text: 'q?' }] }], layers: [] },
        categories: { injection: 'fail' },
      }),
      T,
      'b',
    ); // SW-0001
    const r = runReport('graph', { paths }, 'category:injection');
    expect(r.exit).toBe(0);
    expect(r.text).toContain('run:SW-0001 --asks--> category:injection');
    expect(r.text).toContain('category:injection --checks--> place:src/a.ts');
  });
});

describe('runReport: fields', () => {
  it('classifies closed: <=8 distinct values across >=5 runs [C-223]', () => {
    const { paths } = tempProject({});
    const values = ['low', 'high', 'low', 'high', 'low'];
    for (const v of values) appendContractRun(paths, sampleContractRun({ where: ['src/a.ts'], wise: { why: 'validate', extras: { severity: v } } }), T, 'b');
    syncHotIndex(paths);
    const r = runReport('fields', { paths });
    expect(r.exit).toBe(0);
    expect(r.text).toContain('severity (5 runs)');
    expect(r.text).toContain('suggest: closed [low, high]');
  });

  it('classifies pattern: every value matches one fixed regex shape (numeric), too few runs for closed', () => {
    const { paths } = tempProject({});
    appendContractRun(paths, sampleContractRun({ where: ['src/a.ts'], wise: { why: 'validate', extras: { statuscode: '200' } } }), T, 'b');
    appendContractRun(paths, sampleContractRun({ where: ['src/b.ts'], wise: { why: 'validate', extras: { statuscode: '404' } } }), T, 'b');
    syncHotIndex(paths);
    const r = runReport('fields', { paths });
    expect(r.text).toContain('statuscode (2 runs)');
    expect(r.text).toContain('suggest: pattern: ^\\d+$');
  });

  it('classifies reference: every value looks like a where/route path', () => {
    const { paths } = tempProject({});
    appendContractRun(paths, sampleContractRun({ where: ['src/a.ts'], wise: { why: 'validate', extras: { handledin: 'src/handler.ts' } } }), T, 'b');
    appendContractRun(paths, sampleContractRun({ where: ['src/b.ts'], wise: { why: 'validate', extras: { handledin: 'src/other.ts' } } }), T, 'b');
    syncHotIndex(paths);
    const r = runReport('fields', { paths });
    expect(r.text).toContain('handledin (2 runs)');
    expect(r.text).toContain('suggest: reference (link: where)');
  });

  it('no suggestion yet when nothing fits', () => {
    const { paths } = tempProject({});
    appendContractRun(paths, sampleContractRun({ where: ['src/a.ts'], wise: { why: 'validate', extras: { blurb: 'this has spaces' } } }), T, 'b');
    appendContractRun(paths, sampleContractRun({ where: ['src/b.ts'], wise: { why: 'validate', extras: { blurb: 'another one here' } } }), T, 'b');
    syncHotIndex(paths);
    const r = runReport('fields', { paths });
    expect(r.text).toContain('blurb (2 runs)');
    expect(r.text).toContain('suggest: no suggestion yet — not enough signal');
  });

  it('--accept writes the suggestion into .sidewise/config.yaml, and stops cleanly for a field with no suggestion', () => {
    const { paths } = tempProject({});
    const values = ['low', 'high', 'low', 'high', 'low'];
    for (const v of values) appendContractRun(paths, sampleContractRun({ where: ['src/a.ts'], wise: { why: 'validate', extras: { severity: v } } }), T, 'b');
    appendContractRun(paths, sampleContractRun({ where: ['src/a.ts'], wise: { why: 'validate', extras: { blurb: 'this has spaces' } } }), T, 'b');
    syncHotIndex(paths);

    const noSuggestion = runReport('fields', { paths }, undefined, 'blurb');
    expect(noSuggestion.exit).toBe(2);
    expect(noSuggestion.text).toContain('has no suggestion yet');

    const notUndeclared = runReport('fields', { paths }, undefined, 'why'); // a base field, never undeclared
    expect(notUndeclared.exit).toBe(2);
    expect(notUndeclared.text).toContain('is not an undeclared field');

    const accepted = runReport('fields', { paths }, undefined, 'severity');
    expect(accepted.exit).toBe(0);
    expect(accepted.text).toBe('sidewise report fields --accept severity · wrote wise.severity (values: [low, high]) to .sidewise/config.yaml');

    const written = readFileSync(paths.config, 'utf8');
    expect(written).toContain('severity');
    expect(written).toContain('low');
    expect(written).toContain('high');

    // A second `report fields` no longer lists `severity` as undeclared — it's configured now.
    const after = runReport('fields', { paths });
    expect(after.text).not.toContain('severity');
  });
});
