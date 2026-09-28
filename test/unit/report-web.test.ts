// sidewise report web: the place x concern consensus (STRONG/CONFLICT/SINGLE, same-checklist, fail<->pass
// arcs) ported from lab/research/consensus-proto/proto.py, the self-contained viewer.html it writes, and the
// escaping that keeps untrusted ledger text from breaking out of its embedded <script type="application/json">.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { appendContractRun, appendOutcome, readLedger } from '../../src/ledger/log.ts';
import { buildViewerData, escapeForInlineJson, formatUsd, renderViewerHtml, runReportWeb, type PairStatus, type ViewerData, type WindowData } from '../../src/verbs/report-web.ts';
import type { RunResult, Runner } from '../../src/setup/runner.ts';
import { writeSyntheticLedger } from '../gen/synthetic-ledger.ts';
import { tempProject } from '../helpers/project.ts';
import { sampleContractRun } from '../helpers/runs.ts';

function cell(win: WindowData, place: string, concern: string) {
  const found = win.heatmap.cells.find((c) => c.place === place && c.concern === concern);
  if (!found) throw new Error(`no cell for ${place}/${concern}`);
  return found;
}

function card(win: WindowData, place: string) {
  for (const layer of win.layers) {
    const found = layer.cards.find((c) => c.place === place);
    if (found) return found;
  }
  throw new Error(`no card for ${place}`);
}

/** A one-category, one-question one-subject category shape, so fixtures below only ever vary place/gate/text. */
const oneQuestion = (name: string, text: string) => ({ name, pass: 'yes' as const, need: 'all' as const, tags: [], questions: [{ n: 1, kind: 'yesno' as const, text }] });

describe('report-web: buildViewerData (the ported place x concern consensus)', () => {
  it('[C-204] STRONG when independent runs agree, SINGLE for one run alone, CONFLICT when gates differ — with the same-checklist flag on a CONFLICT', () => {
    const { paths } = tempProject({});
    // P1: two runs agree (fail) -> STRONG.
    appendContractRun(paths, sampleContractRun({ where: ['app/routes/a.ts'], ask: { categories: [oneQuestion('guards', 'Is it guarded?')], layers: [] }, categories: { guards: 'fail' } }), Date.now(), 'b');
    appendContractRun(paths, sampleContractRun({ where: ['app/routes/a.ts'], ask: { categories: [oneQuestion('guards', 'Is it guarded?')], layers: [] }, categories: { guards: 'fail' } }), Date.now(), 'b');
    // P2: one run alone -> SINGLE.
    appendContractRun(paths, sampleContractRun({ where: ['app/data/b.ts'], ask: { categories: [oneQuestion('guards', 'Is it guarded?')], layers: [] }, categories: { guards: 'pass' } }), Date.now(), 'b');
    // P3: same question text, gates differ -> CONFLICT, same checklist reused.
    appendContractRun(paths, sampleContractRun({ where: ['app/routes/c.ts'], ask: { categories: [oneQuestion('guards', 'Is it guarded?')], layers: [] }, categories: { guards: 'fail' } }), Date.now(), 'b');
    appendContractRun(paths, sampleContractRun({ where: ['app/routes/c.ts'], ask: { categories: [oneQuestion('guards', 'Is it guarded?')], layers: [] }, categories: { guards: 'pass' } }), Date.now(), 'b');
    // P4: same category name, DIFFERENT question text, gates differ -> CONFLICT, not the same checklist.
    appendContractRun(paths, sampleContractRun({ where: ['config/settings.ts'], ask: { categories: [oneQuestion('access', 'Can anyone read it?')], layers: [] }, categories: { access: 'fail' } }), Date.now(), 'b');
    appendContractRun(paths, sampleContractRun({ where: ['config/settings.ts'], ask: { categories: [oneQuestion('access', 'Is it locked down?')], layers: [] }, categories: { access: 'pass' } }), Date.now(), 'b');

    const records = readLedger(paths);
    const data = buildViewerData(records);
    const all = data.windows.all;

    const p1 = cell(all, 'app/routes/a.ts', 'guards');
    expect(p1.status).toBe('STRONG' satisfies PairStatus);
    expect(p1.verdict).toBe('fail');
    expect(p1.runs).toBe(2);

    const p2 = cell(all, 'app/data/b.ts', 'guards');
    expect(p2.status).toBe('SINGLE' satisfies PairStatus);
    expect(p2.verdict).toBe('pass');
    expect(p2.runs).toBe(1);

    const p3 = cell(all, 'app/routes/c.ts', 'guards');
    expect(p3.status).toBe('CONFLICT' satisfies PairStatus);
    expect(p3.verdict).toBe('conflict');
    expect(p3.sameChecklist).toBe(true);

    const p4 = cell(all, 'config/settings.ts', 'access');
    expect(p4.status).toBe('CONFLICT' satisfies PairStatus);
    expect(p4.sameChecklist).toBe(false);

    // layers = dirname of the place ("top-level folders from the where: paths").
    const layerNames = all.layers.map((l) => l.name).sort();
    expect(layerNames).toEqual(['app/data', 'app/routes', 'config']);
    expect(all.layers.find((l) => l.name === 'app/routes')!.cards.map((c) => c.place).sort()).toEqual(['app/routes/a.ts', 'app/routes/c.ts']);

    // a cell with no runs at all is 'none'/'NONE' (P2's place was never asked about "access").
    const missing = cell(all, 'app/data/b.ts', 'access');
    expect(missing.verdict).toBe('none');
    expect(missing.status).toBe('NONE' satisfies PairStatus);
  });

  it('a card rolls its concerns up to one verdict: conflict beats any gate, else the worst gate wins', () => {
    const { paths } = tempProject({});
    appendContractRun(
      paths,
      sampleContractRun({
        where: ['app/routes/d.ts'],
        ask: { categories: [oneQuestion('cata', 'cata ok?'), oneQuestion('catb', 'catb ok?')], layers: [] },
        answers: { goal: { kind: 'yesno', p: 0.5 }, 1: { kind: 'yesno', p: 0.9 } },
        categories: { cata: 'pass', catb: 'fail' },
      }),
      Date.now(),
      'b',
    );
    const afterOne = buildViewerData(readLedger(paths)).windows.all;
    expect(card(afterOne, 'app/routes/d.ts').verdict).toBe('fail'); // worst of pass/fail

    // A second run disagrees with the first on catA (pass vs unsure) -> catA becomes CONFLICT, which now beats
    // catB's plain 'fail'.
    appendContractRun(
      paths,
      sampleContractRun({
        where: ['app/routes/d.ts'],
        ask: { categories: [oneQuestion('cata', 'cata ok?')], layers: [] },
        categories: { cata: 'unsure' },
      }),
      Date.now(),
      'b',
    );
    const afterTwo = buildViewerData(readLedger(paths)).windows.all;
    expect(cell(afterTwo, 'app/routes/d.ts', 'cata').status).toBe('CONFLICT' satisfies PairStatus);
    expect(card(afterTwo, 'app/routes/d.ts').verdict).toBe('conflict');
  });

  it('a sweep run (items, no top-level where) votes the same way a one-subject run does', () => {
    const { paths } = tempProject({});
    appendContractRun(
      paths,
      sampleContractRun({
        verb: 'scan',
        where: [],
        ask: { categories: [], layers: [{ name: 'file', categories: [oneQuestion('injection', 'trusts input?')] }] },
        over: { file: 'src/*.ts' },
        items: { 'src/a.ts': { layer: 'file', fill: {}, unit: { path: 'src/a.ts', kind: 'file', name: 'a.ts', lines: '1-1' }, status: 'asked', gate: 'fail', categories: { injection: 'fail' } } },
        answers: { goal: { kind: 'yesno', p: 0.2 }, 'src/a.ts#1': { kind: 'yesno', p: 0.9 } },
        categories: {},
        gate: 'fail',
      }),
      Date.now(),
      'b',
    );
    const all = buildViewerData(readLedger(paths)).windows.all;
    expect(cell(all, 'src/a.ts', 'injection').verdict).toBe('fail');
    expect(card(all, 'src/a.ts').runCount).toBe(1);
  });

  it('the left rail lists category concerns and wise-field tags with run counts', () => {
    const { paths } = tempProject({});
    appendContractRun(paths, sampleContractRun({ where: ['a.ts'], wise: { why: 'validate', area: 'api' } }), Date.now(), 'b');
    appendContractRun(paths, sampleContractRun({ where: ['b.ts'], wise: { why: 'validate', area: 'data' } }), Date.now(), 'b');
    const all = buildViewerData(readLedger(paths)).windows.all;
    const byKey = new Map(all.concerns.map((c) => [c.key, c]));
    expect(byKey.get('injection')).toMatchObject({ kind: 'category', count: 2 });
    expect(byKey.get('why:validate')).toMatchObject({ kind: 'tag', count: 2 });
    expect(byKey.get('area:api')).toMatchObject({ kind: 'tag', count: 1 });
    expect(byKey.get('area:data')).toMatchObject({ kind: 'tag', count: 1 });
  });

  it('[C-204] arcs are ordered by run ts, never by SW id: fail (earlier ts) then pass (later ts) is a fix held; the reverse is a regression', () => {
    const { paths } = tempProject({});
    const cat = oneQuestion('guards', 'q1?');
    // P1: SW-0001 gets the LOWER id but a LATER ts (pass); SW-0002 gets the HIGHER id but an EARLIER ts (fail).
    // Ordering by id would read this as pass -> fail (a regression, wrong); ordering by ts (the truth, e.g. a
    // concatenated multi-session ledger where ids repeat and aren't chronological) reads it as the fix it is.
    appendContractRun(paths, sampleContractRun({ where: ['app/routes/contributions.js'], ask: { categories: [cat], layers: [] }, categories: { guards: 'pass' } }), 2_000_000, 'b'); // SW-0001, later ts
    appendContractRun(paths, sampleContractRun({ where: ['app/routes/contributions.js'], ask: { categories: [cat], layers: [] }, categories: { guards: 'fail' } }), 1_000_000, 'b'); // SW-0002, earlier ts
    // P2: the mirror image (a real regression), same id/ts scramble.
    appendContractRun(paths, sampleContractRun({ where: ['app/routes/other.js'], ask: { categories: [cat], layers: [] }, categories: { guards: 'fail' } }), 2_000_000, 'b'); // SW-0003, later ts
    appendContractRun(paths, sampleContractRun({ where: ['app/routes/other.js'], ask: { categories: [cat], layers: [] }, categories: { guards: 'pass' } }), 1_000_000, 'b'); // SW-0004, earlier ts

    const story = buildViewerData(readLedger(paths)).windows.all.story;
    expect(story.fixes).toEqual([{ place: 'app/routes/contributions.js', concern: 'guards', fromId: 'SW-0002', toId: 'SW-0001' }]);
    expect(story.regressions).toEqual([{ place: 'app/routes/other.js', concern: 'guards', fromId: 'SW-0004', toId: 'SW-0003' }]);
  });

  it('[C-204] a path asked about from two different roots is folded into the shorter one (a suffix match), and the story panel counts it', () => {
    const { paths } = tempProject({});
    appendContractRun(paths, sampleContractRun({ where: ['app/routes/contributions.js'], categories: { injection: 'fail' } }), Date.now(), 'b');
    appendContractRun(paths, sampleContractRun({ where: ['stage/NodeGoat/app/routes/contributions.js'], categories: { injection: 'pass' } }), Date.now(), 'b');
    const all = buildViewerData(readLedger(paths)).windows.all;
    // Both runs land on the SAME (shorter) card — no second, duplicate card for the aliased longer path.
    expect(card(all, 'app/routes/contributions.js').runCount).toBe(2);
    expect(all.layers.some((l) => l.cards.some((c) => c.place === 'stage/NodeGoat/app/routes/contributions.js'))).toBe(false);
    expect(cell(all, 'app/routes/contributions.js', 'injection').status).toBe('CONFLICT' satisfies PairStatus); // fail + pass, now one place
    expect(all.story.pathsMerged).toBe(1);
  });

  it('latest findings are the newest fails; outcomes tally held/overruled/failed, and an untriaged fail counts as open', () => {
    const { paths } = tempProject({});
    appendContractRun(paths, sampleContractRun({ where: ['src/old.ts'], goal: 'old finding', categories: { injection: 'fail' } }), Date.now() - 2000, 'b'); // SW-0001
    appendContractRun(paths, sampleContractRun({ where: ['src/new.ts'], goal: 'new finding', categories: { injection: 'fail' } }), Date.now() - 1000, 'b'); // SW-0002
    appendOutcome(paths, 'SW-0001', 'overruled', 'owner');
    const story = buildViewerData(readLedger(paths)).windows.all.story;
    expect(story.findings[0]).toMatchObject({ id: 'SW-0002', goal: 'new finding' }); // newest first
    expect(story.outcomes).toEqual({ held: 0, overruled: 1, failed: 0, open: 1 }); // SW-0002 never got an outcome
  });

  it('actors, paid calls and spend roll up over the window; last30 drops a record older than 30 days', () => {
    const { paths } = tempProject({});
    const old = Date.now() - 40 * 24 * 60 * 60 * 1000;
    const recent = Date.now();
    appendContractRun(paths, sampleContractRun({ where: ['old.ts'], actor: 'owner', costUsd: 1, calls: 1 }), old, 'b');
    appendContractRun(paths, sampleContractRun({ where: ['new.ts'], actor: 'reviewer', costUsd: 2, calls: 1 }), recent, 'b');
    const data = buildViewerData(readLedger(paths), recent);
    expect(data.windows.all.story.runs).toBe(2);
    expect(data.windows.all.story.actors).toEqual(['owner', 'reviewer']);
    expect(data.windows.all.story.spendUsd).toBeCloseTo(3);
    expect(data.windows.last30.story.runs).toBe(1);
    expect(data.windows.last30.story.actors).toEqual(['reviewer']);
    expect(data.windows.last30.layers.some((l) => l.cards.some((c) => c.place === 'old.ts'))).toBe(false);
  });
});

describe('report-web: escapeForInlineJson keeps a </script> payload from breaking out', () => {
  it('[C-204] escapes <, >, &, U+2028 and U+2029, and round-trips through JSON.parse', () => {
    const payload = JSON.stringify({ text: '</script><script>alert(1)</script> & tricky   ' });
    const escaped = escapeForInlineJson(payload);
    expect(escaped).not.toContain('<');
    expect(escaped).not.toContain('>');
    expect(escaped).not.toContain('&');
    expect(escaped).not.toContain(' ');
    expect(escaped).not.toContain(' ');
    expect(JSON.parse(escaped)).toEqual({ text: '</script><script>alert(1)</script> & tricky   ' });
  });
});

/** A recording stub Runner: never actually launches anything, just remembers the exact argv it was called with
 *  (the same test-double shape doctor.test.ts and friends already use for this injectable boundary). */
function recordingRunner(status: number): { runner: Runner; calls: { cmd: string; args: readonly string[] }[] } {
  const calls: { cmd: string; args: readonly string[] }[] = [];
  const runner: Runner = (cmd, args): RunResult => {
    calls.push({ cmd, args });
    return { status, stdout: '', stderr: '' };
  };
  return { runner, calls };
}

describe('report-web: runReportWeb', () => {
  it('[C-204] writes .sidewise/viewer.html, leaves the ledger byte-identical, and the embedded JSON holds the expected places/concerns/consensus', () => {
    const { paths } = tempProject({});
    appendContractRun(paths, sampleContractRun({ where: ['src/a.ts'], categories: { injection: 'fail' } }), Date.now(), 'b');
    appendContractRun(paths, sampleContractRun({ where: ['src/a.ts'], categories: { injection: 'fail' } }), Date.now(), 'b');
    const before = readFileSync(paths.log);
    const { runner, calls } = recordingRunner(0);

    const r = runReportWeb({ paths, env: { DISPLAY: ':0' }, runner, platform: 'linux' });

    expect(r.exit).toBe(0);
    const viewerPath = path.join(paths.dir, 'viewer.html');
    expect(r.text).toContain('.sidewise/viewer.html');
    expect(r.text).toContain('opened in your browser');
    expect(calls).toEqual([{ cmd: 'xdg-open', args: [viewerPath] }]);
    expect(readFileSync(paths.log)).toEqual(before); // read-only on the ledger itself

    const html = readFileSync(viewerPath, 'utf8');
    expect(html).toContain('<!doctype html');
    expect(html).toContain('Sidewise ledger viewer');
    expect(html).toContain('A System One needs a Knowledge One. · Sidewise');
    const match = /<script type="application\/json" id="viewer-data">([\s\S]*?)<\/script>/u.exec(html);
    expect(match).toBeTruthy();
    const data = JSON.parse(match![1]!) as ViewerData;
    expect(cell(data.windows.all, 'src/a.ts', 'injection').status).toBe('STRONG' satisfies PairStatus);
    expect(data.windows.all.layers.find((l) => l.name === 'src')!.cards[0]!.place).toBe('src/a.ts');
  });

  it('a question containing </script><script>alert(1)</script> cannot break out of the embedded JSON', () => {
    const { paths } = tempProject({});
    const payload = '</script><script>alert(1)</script>';
    appendContractRun(paths, sampleContractRun({ where: ['src/a.ts'], ask: { categories: [oneQuestion('injection', payload)], layers: [] }, categories: { injection: 'fail' } }), Date.now(), 'b');
    const { runner } = recordingRunner(0);
    const r = runReportWeb({ paths, env: {}, runner, platform: 'linux' });
    expect(r.exit).toBe(0);
    const html = readFileSync(path.join(paths.dir, 'viewer.html'), 'utf8');
    // The raw payload must never appear literally in the document — only its escaped form can.
    expect(html).not.toContain(payload);
    expect(html.split('<script').length).toBe(3); // exactly the two real <script> tags this template writes
    const match = /<script type="application\/json" id="viewer-data">([\s\S]*?)<\/script>/u.exec(html)!;
    const data = JSON.parse(match[1]!) as ViewerData;
    const q = data.windows.all; // the payload lives inside a category's question text, not surfaced structurally —
    void q; // proving the raw HTML never carries it, and the script block still parses cleanly, is the point.
  });

  it('the open-failure path (a failing command, or no display on Linux) still prints the path and exits 0', () => {
    const { paths } = tempProject({});
    appendContractRun(paths, sampleContractRun({}), Date.now(), 'b');

    const failing = recordingRunner(1);
    const r1 = runReportWeb({ paths, env: { DISPLAY: ':0' }, runner: failing.runner, platform: 'linux' });
    expect(r1.exit).toBe(0);
    expect(r1.text).toContain('.sidewise/viewer.html');
    expect(r1.text).toContain('open it yourself, no browser available');

    const noDisplay = recordingRunner(0);
    const r2 = runReportWeb({ paths, env: {}, runner: noDisplay.runner, platform: 'linux' });
    expect(r2.exit).toBe(0);
    expect(r2.text).toContain('open it yourself, no browser available');
    expect(noDisplay.calls).toEqual([]); // never even tried: no DISPLAY/WAYLAND_DISPLAY
  });

  it('picks the right open command per OS', () => {
    const { paths } = tempProject({});
    appendContractRun(paths, sampleContractRun({}), Date.now(), 'b');
    const viewerPath = path.join(paths.dir, 'viewer.html');

    const mac = recordingRunner(0);
    runReportWeb({ paths, env: {}, runner: mac.runner, platform: 'darwin' });
    expect(mac.calls).toEqual([{ cmd: 'open', args: [viewerPath] }]);

    const win = recordingRunner(0);
    runReportWeb({ paths, env: {}, runner: win.runner, platform: 'win32' });
    expect(win.calls).toEqual([{ cmd: 'cmd', args: ['/c', 'start', '', viewerPath] }]);
  });

  it('always creates .sidewise/ and writes a viewer even with no runs yet', () => {
    const { paths } = tempProject({});
    const r = runReportWeb({ paths, env: {}, runner: recordingRunner(0).runner, platform: 'linux' });
    expect(r.exit).toBe(0);
    const html = readFileSync(path.join(paths.dir, 'viewer.html'), 'utf8');
    expect(html).toContain('No runs recorded yet.');
  });

  it('a real, larger synthetic ledger (test/gen) still produces a parseable viewer and never touches the ledger bytes', () => {
    const { paths } = tempProject({});
    writeSyntheticLedger(paths, { seed: 'report-web-sample', runs: 60, sweepShare: 0.3, outcomeRate: 0.5, parentShare: 0 });
    const before = readFileSync(paths.log);
    const r = runReportWeb({ paths, env: {}, runner: recordingRunner(0).runner, platform: 'linux' });
    expect(r.exit).toBe(0);
    expect(readFileSync(paths.log)).toEqual(before);
    const html = readFileSync(path.join(paths.dir, 'viewer.html'), 'utf8');
    const match = /<script type="application\/json" id="viewer-data">([\s\S]*?)<\/script>/u.exec(html)!;
    const data = JSON.parse(match[1]!) as ViewerData;
    expect(data.windows.all.layers.length).toBeGreaterThan(0);
    expect(data.windows.all.concerns.length).toBeGreaterThan(0);
  });
});

describe('report-web: renderViewerHtml', () => {
  it('never writes ledger text with innerHTML — only textContent/className/title appear in the client script', () => {
    const html = renderViewerHtml(buildViewerData([]));
    expect(html).not.toContain('innerHTML');
  });

  it('[C-204] embeds the exact same formatUsd implementation the client renders spend with — no second, hand-copied copy', () => {
    const html = renderViewerHtml(buildViewerData([]));
    expect(html).toContain(formatUsd.toString());
  });
});

describe('report-web: formatUsd (real precision under a cent, the same rule everywhere a dollar amount shows)', () => {
  it('[C-204] shows 2 significant digits below a cent instead of rounding away to $0.00', () => {
    expect(formatUsd(0)).toBe('$0.00');
    expect(formatUsd(0.0022900080000000005)).toBe('$0.0023');
    expect(formatUsd(0.005)).toBe('$0.0050');
    expect(formatUsd(1.234)).toBe('$1.23');
    expect(formatUsd(46)).toBe('$46.00');
  });
});
