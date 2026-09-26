/**
 * view: "what do we already know here?" Free and read-only (no classifier, no budget). A folder or tag shows the
 * newest 10/20/30 runs with outcome counts (fake-provider runs labelled and counted apart); a run id shows its
 * lineage (parents up, children down).
 * The hot cache (Plan 2) replaces this linear read without changing the output.
 */
import { RUN_ID } from '../ledger/ids.ts';
import { isRun, latestOutcome, readLedger, type LedgerRecord, type RunRecord } from '../ledger/log.ts';
import type { SidewisePaths } from '../ledger/paths.ts';
import type { Level } from '../lens/request.ts';
import type { VerbResult } from './types.ts';

const clip = (s: string, n: number): string => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

// A fake-provider run is a rehearsal, not evidence: labelled on its line and kept out of the outcome counts.
const isFake = (r: RunRecord): boolean => r.adapter === 'fake';

function runLine(r: RunRecord, records: readonly LedgerRecord[]): string {
  const outcome = latestOutcome(records, r.id) ?? 'open';
  const label = isFake(r) ? ' · fake' : '';
  return `${clip(`${r.id} ${r.ts.slice(0, 10)} ${r.verb} L${r.level} ${r.consensus} ${r.verdict} "${clip(r.focus, 48)}" · ${outcome}`, 120 - label.length)}${label}`;
}

function byPlace(target: string, runs: RunRecord[], records: readonly LedgerRecord[], limit: number): VerbResult {
  const place = target.replace(/^\.\//, '').replace(/\/+$/, '') || '.';
  const hits = runs.filter((r) => place === '.' || r.tags.includes(place) || r.where.some((w) => w.path === place || w.path.startsWith(`${place}/`)));
  if (!hits.length) return { exit: 0, text: `sidewise view ${place} · no runs yet → "sidewise class <request>" starts one` };
  const counts = { held: 0, overruled: 0, failed: 0, open: 0 };
  let fake = 0;
  for (const r of hits) {
    if (isFake(r)) fake += 1;
    else counts[latestOutcome(records, r.id) ?? 'open'] += 1;
  }
  const head = `sidewise view ${place} · ${hits.length} run${hits.length === 1 ? '' : 's'} · held ${counts.held} · overruled ${counts.overruled} · failed ${counts.failed} · open ${counts.open}${fake ? ` · fake ${fake}` : ''}`;
  const shown = hits.slice(-limit).reverse();
  const older = hits.length - shown.length;
  return { exit: 0, text: [head, ...shown.map((r) => runLine(r, records)), ...(older ? [`… ${older} older → raise the level to see more`] : [])].join('\n') };
}

function byId(id: string, runs: RunRecord[], records: readonly LedgerRecord[], limit: number): VerbResult {
  const index = new Map(runs.map((r) => [r.id, r]));
  const self = index.get(id);
  if (!self) return { exit: 2, text: `✖ view: ${id} is not in the ledger → "sidewise view <folder>" lists recent runs` };
  const up: RunRecord[] = [];
  let cursor = self.parent ? index.get(self.parent) : undefined;
  while (cursor && up.length < limit) {
    up.unshift(cursor);
    cursor = cursor.parent ? index.get(cursor.parent) : undefined;
  }
  const down: RunRecord[] = [];
  const queue = [id];
  while (queue.length && down.length < limit) {
    const parent = queue.shift()!;
    for (const r of runs) {
      if (r.parent === parent && down.length < limit) {
        down.push(r);
        queue.push(r.id);
      }
    }
  }
  return {
    exit: 0,
    text: [
      `sidewise view ${id} · lineage ${up.length} up · ${down.length} down`,
      ...up.map((r) => `↑ ${runLine(r, records)}`),
      `▶ ${runLine(self, records)}`,
      ...down.map((r) => `↓ ${runLine(r, records)}`),
    ].join('\n'),
  };
}

export function runView(target: string, level: Level, paths: SidewisePaths): VerbResult {
  const records = readLedger(paths);
  const runs = records.filter(isRun);
  const limit = level * 10;
  return RUN_ID.test(target) ? byId(target, runs, records, limit) : byPlace(target, runs, records, limit);
}
