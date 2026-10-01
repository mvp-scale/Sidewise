// mm3 report [graph|problems|mdl|calls|fields]: the graph-tier reader views wired into
// `report`, plus `fields`'s own undeclared-mdl-key discovery and `--accept` write-back. Builds small
// hand-crafted ledgers (appendContractRun, same helper every other report test uses) and reads them back
// through `runReport` only — never the graph tier's own internals (ledger-graph.test.ts already covers those).
//
// Controller fix (2026-09-28): `mdl`/`problems`/`calls`/`fields` read the hot tier's own tables straight off
// disk (ledger/graph.ts), with no linear-scan fallback of their own — unlike `hits`/`patterns`/`history`
// (test/unit/report.test.ts), which go through `withIndex(..., {readOnly:true})`'s `IndexHandle` and so can
// never be wrong on a stale/missing index, only slow. These tests used to work around that with their own
// `syncHotIndex` helper (one extra `withIndex` call between the append and the read); `runReport` now does that
// itself (`ensureHotIndexFresh`, report.ts), so every test below reads immediately after appending, exactly as
// an agent calling `mm3 report ...` right after `mm3 class ...` would.
import { existsSync, rmSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { appendContractRun } from '../../src/ledger/log.ts';
import { runReport } from '../../src/verbs/report.ts';
import { tempProject } from '../helpers/project.ts';
import { sampleContractRun } from '../helpers/runs.ts';

const T = Date.now();

describe('runReport: graph-tier views, empty state', () => {
  it('problems/mdl/calls/fields all say plainly there is nothing yet', () => {
    const { paths } = tempProject({});
    expect(runReport('problems', { paths }).text).toBe('mm3 report problems · no runs yet → "mm3 class <request>" starts one');
    expect(runReport('mdl', { paths }).text).toBe('mm3 report mdl · no runs yet → "mm3 class <request>" starts one');
    expect(runReport('calls', { paths }).text).toBe('mm3 report calls · no calls in the last 30 days → "mm3 class <request>" starts one');
    expect(runReport('fields', { paths }).text).toBe('mm3 report fields · no undeclared fields yet → every mdl key so far is a base field or already configured');
  });

  it('graph with no target names how to give one; with a target but nothing there says not found [C-219]', () => {
    const { paths } = tempProject({});
    const noTarget = runReport('graph', { paths });
    expect(noTarget.exit).toBe(0);
    expect(noTarget.text).toBe('mm3 report graph · name a target → mm3 report graph <kind>:<label> (e.g. category:injection)');
    const notFound = runReport('graph', { paths }, 'category:injection');
    expect(notFound.exit).toBe(0);
    expect(notFound.text).toBe('mm3 report graph category:injection · not found → run "mm3 class <request>" first, or check the kind:label spelling');
  });

  it('graph rejects a target that is not kind:label', () => {
    const { paths } = tempProject({});
    const bad = runReport('graph', { paths }, 'notakindlabel');
    expect(bad.exit).toBe(2);
    expect(bad.text).toContain('✖ report graph: "notakindlabel" is not kind:label');
  });
});

describe('runReport: hot-tier freshness (controller fix)', () => {
  it('deleting index.db entirely still lists every run — the ledger, not a stale cache, is the truth [C-225]', () => {
    const { paths } = tempProject({});
    for (let i = 0; i < 3; i++) appendContractRun(paths, sampleContractRun({ where: [`src/${i}.ts`], mdl: { why: 'validate' } }), T + i, 'b'); // MM3-0001..MM3-0003
    expect(existsSync(paths.index)).toBe(true); // the append path already warms the hot tier
    rmSync(paths.index, { force: true });
    expect(existsSync(paths.index)).toBe(false);
    const r = runReport('mdl', { paths });
    expect(r.exit).toBe(0);
    expect(r.text).toContain('mm3 report mdl · 3 runs');
    expect(r.text).toContain('MM3-0001');
    expect(r.text).toContain('MM3-0002');
    expect(r.text).toContain('MM3-0003');
  });

  it('a run appended after the index.db already exists shows up in the very next report call, with no manual sync in between [C-225]', () => {
    const { paths } = tempProject({});
    appendContractRun(paths, sampleContractRun({ where: ['src/a.ts'] }), T, 'b'); // MM3-0001
    const before = runReport('mdl', { paths });
    expect(before.text).toContain('mm3 report mdl · 1 run');
    appendContractRun(paths, sampleContractRun({ where: ['src/b.ts'] }), T + 1000, 'b'); // MM3-0002 — index.db is now stale
    const after = runReport('mdl', { paths });
    expect(after.text).toContain('mm3 report mdl · 2 runs');
    expect(after.text).toContain('MM3-0002');
  });
});

describe('runReport: problems', () => {
  it('ranks family x place by gate counts, worst (most fail) first [C-220]', () => {
    const { paths } = tempProject({});
    const cat = (name: string, family: string) => ({ name, section: 'concerns' as const, pass: 'no' as const, need: 'all' as const, tags: [], family: family as never, questions: [{ n: 1, kind: 'yesno' as const, text: 'q?' }] });
    appendContractRun(paths, sampleContractRun({ where: ['src/a.ts'], ask: { categories: [cat('injection', 'injection')], layers: [] }, categories: { injection: 'fail' } }), T, 'b'); // MM3-0001
    appendContractRun(paths, sampleContractRun({ where: ['src/b.ts'], ask: { categories: [cat('guards', 'guards')], layers: [] }, categories: { guards: 'pass' } }), T, 'b'); // MM3-0002
    const r = runReport('problems', { paths });
    expect(r.exit).toBe(0);
    expect(r.text).toContain('mm3 report problems · 2 rows');
    const lines = r.text.split('\n');
    expect(lines[1]).toContain('injection × src/a.ts · fail 1 unsure 0 pass 0'); // worst (fail) first
    expect(lines[2]).toContain('guards × src/b.ts · fail 0 unsure 0 pass 1');
  });
});

describe('runReport: mdl', () => {
  it('lists every run\'s own mdl fields, newest first [C-221]', () => {
    const { paths } = tempProject({});
    appendContractRun(paths, sampleContractRun({ where: ['src/a.ts'], mdl: { why: 'validate', area: 'api', risk: 'high' } }), T, 'b'); // MM3-0001
    appendContractRun(paths, sampleContractRun({ where: ['src/b.ts'], mdl: { why: 'find', stage: 'build' } }), T + 1000, 'b'); // MM3-0002, later ts
    const r = runReport('mdl', { paths });
    expect(r.exit).toBe(0);
    expect(r.text).toContain('mm3 report mdl · 2 runs');
    const lines = r.text.split('\n');
    expect(lines[1]).toContain('MM3-0002'); // newest first
    expect(lines[1]).toContain('why:find');
    expect(lines[2]).toContain('MM3-0001');
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
    ); // MM3-0001
    const r = runReport('calls', { paths });
    expect(r.exit).toBe(0);
    expect(r.text).toContain('mm3 report calls · 1 row');
    expect(r.text).toContain('jev-1.13.0 (provider) · calls 1 · tokens 250 · cost $0.0100');
  });

  it('falls back to the run\'s own calls/costUsd/adapter/model for a pre-telemetry record, marked "none" [C-222]', () => {
    const { paths } = tempProject({});
    // No `telemetry` field at all — the shape every real pre-plan-2c-B2 ledger line has.
    appendContractRun(paths, sampleContractRun({ where: ['src/a.ts'], adapter: 'openai', model: 'gpt-x', calls: 2, costUsd: 0.5 }), T, 'b'); // MM3-0001
    const r = runReport('calls', { paths });
    expect(r.exit).toBe(0);
    expect(r.text).toContain('mm3 report calls · 1 row');
    expect(r.text).toContain('gpt-x (none) · calls 2 · tokens 0 · cost $0.5000 · saved $0.0000');
  });

  it('a fully-reused pre-telemetry record (calls: 0) contributes no row', () => {
    const { paths } = tempProject({});
    appendContractRun(paths, sampleContractRun({ where: ['src/a.ts'], calls: 0, costUsd: 0 }), T, 'b'); // MM3-0001
    const r = runReport('calls', { paths });
    expect(r.text).toBe('mm3 report calls · no calls in the last 30 days → "mm3 class <request>" starts one');
  });
});

describe('runReport: graph', () => {
  it('shows the neighborhood around one kind:label target as predicate lines, with gate/score/provenance/run [C-219] [C-224]', () => {
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
    ); // MM3-0001
    const r = runReport('graph', { paths }, 'category:injection');
    expect(r.exit).toBe(0);
    // run --checks--> category: the run checked this category (renamed from the old, backwards `asks`).
    expect(r.text).toContain('run:MM3-0001 --checks--> category:injection (extracted) [MM3-0001]');
    // category --judged <gate> (p <score>)--> place: the category's own verdict on that place (renamed from
    // the old, backwards `checks`), with its provenance and witnessing run shown on every edge.
    expect(r.text).toContain('category:injection --judged fail (p 0)--> place:src/a.ts (extracted) [MM3-0001]');
  });

  it('aggregates the same (s,p,o,score) edge witnessed by more than one run into one line with a ×N count [C-224]', () => {
    const { paths } = tempProject({});
    const ask = { categories: [{ name: 'injection', section: 'concerns' as const, pass: 'no' as const, need: 'all' as const, tags: [], questions: [{ n: 1, kind: 'yesno' as const, text: 'q?' }] }], layers: [] };
    for (let i = 0; i < 3; i++) {
      appendContractRun(paths, sampleContractRun({ where: ['src/a.ts'], ask, categories: { injection: 'fail' } }), T, 'b'); // MM3-0001..MM3-0003
    }
    const r = runReport('graph', { paths }, 'category:injection');
    expect(r.exit).toBe(0);
    expect(r.text).toContain('category:injection --judged fail (p 0, ×3)--> place:src/a.ts (extracted) [MM3-0001, MM3-0002, MM3-0003]');
  });
});

describe('runReport: fields', () => {
  it('classifies closed: <=8 distinct values across >=5 runs [C-223]', () => {
    const { paths } = tempProject({});
    const values = ['low', 'high', 'low', 'high', 'low'];
    for (const v of values) appendContractRun(paths, sampleContractRun({ where: ['src/a.ts'], mdl: { why: 'validate', extras: { severity: v } } }), T, 'b');
    const r = runReport('fields', { paths });
    expect(r.exit).toBe(0);
    expect(r.text).toContain('severity (5 runs)');
    expect(r.text).toContain('suggest: closed [low, high]');
  });

  it('classifies pattern: every value matches one fixed regex shape (numeric), too few runs for closed', () => {
    const { paths } = tempProject({});
    appendContractRun(paths, sampleContractRun({ where: ['src/a.ts'], mdl: { why: 'validate', extras: { statuscode: '200' } } }), T, 'b');
    appendContractRun(paths, sampleContractRun({ where: ['src/b.ts'], mdl: { why: 'validate', extras: { statuscode: '404' } } }), T, 'b');
    const r = runReport('fields', { paths });
    expect(r.text).toContain('statuscode (2 runs)');
    expect(r.text).toContain('suggest: pattern: ^\\d+$');
  });

  it('classifies reference: every value looks like a where/route path', () => {
    const { paths } = tempProject({});
    appendContractRun(paths, sampleContractRun({ where: ['src/a.ts'], mdl: { why: 'validate', extras: { handledin: 'src/handler.ts' } } }), T, 'b');
    appendContractRun(paths, sampleContractRun({ where: ['src/b.ts'], mdl: { why: 'validate', extras: { handledin: 'src/other.ts' } } }), T, 'b');
    const r = runReport('fields', { paths });
    expect(r.text).toContain('handledin (2 runs)');
    expect(r.text).toContain('suggest: reference (link: where)');
  });

  it('no suggestion yet when nothing fits', () => {
    const { paths } = tempProject({});
    appendContractRun(paths, sampleContractRun({ where: ['src/a.ts'], mdl: { why: 'validate', extras: { blurb: 'this has spaces' } } }), T, 'b');
    appendContractRun(paths, sampleContractRun({ where: ['src/b.ts'], mdl: { why: 'validate', extras: { blurb: 'another one here' } } }), T, 'b');
    const r = runReport('fields', { paths });
    expect(r.text).toContain('blurb (2 runs)');
    expect(r.text).toContain('suggest: no suggestion yet — not enough signal');
  });

  it('--accept writes the suggestion into .mm3/config.yaml, and stops cleanly for a field with no suggestion', () => {
    const { paths } = tempProject({});
    const values = ['low', 'high', 'low', 'high', 'low'];
    for (const v of values) appendContractRun(paths, sampleContractRun({ where: ['src/a.ts'], mdl: { why: 'validate', extras: { severity: v } } }), T, 'b');
    appendContractRun(paths, sampleContractRun({ where: ['src/a.ts'], mdl: { why: 'validate', extras: { blurb: 'this has spaces' } } }), T, 'b');

    const noSuggestion = runReport('fields', { paths }, undefined, 'blurb');
    expect(noSuggestion.exit).toBe(2);
    expect(noSuggestion.text).toContain('has no suggestion yet');

    const notUndeclared = runReport('fields', { paths }, undefined, 'why'); // a base field, never undeclared
    expect(notUndeclared.exit).toBe(2);
    expect(notUndeclared.text).toContain('is not an undeclared field');

    const accepted = runReport('fields', { paths }, undefined, 'severity');
    expect(accepted.exit).toBe(0);
    expect(accepted.text).toBe('mm3 report fields --accept severity · wrote mdl.severity (values: [low, high]) to .mm3/config.yaml');

    const written = readFileSync(paths.config, 'utf8');
    expect(written).toContain('severity');
    expect(written).toContain('low');
    expect(written).toContain('high');

    // A second `report fields` no longer lists `severity` as undeclared — it's configured now.
    const after = runReport('fields', { paths });
    expect(after.text).not.toContain('severity');
  });
});
