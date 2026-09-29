// Compat: the retired `SW-####` run-id prefix is still read (parent refs, validation, mixed ledgers), never minted.
// This file is the one place old-id fixtures live on purpose.
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { validateRequest } from '../../src/contract/validate.ts';
import { formatRunId, RUN_ID } from '../../src/ledger/ids.ts';
import { appendContractRun, findRun, readLedger } from '../../src/ledger/log.ts';
import { readFileSync, writeFileSync } from 'node:fs';
import { runView } from '../../src/verbs/view.ts';
import { tempProject } from '../helpers/project.ts';
import { sampleContractRun } from '../helpers/runs.ts';

const NOW = Date.parse('2026-09-20T12:00:00Z');

describe('compat: old SW-#### run ids', () => {
  it('RUN_ID accepts both prefixes; new ids are minted as MM3-', () => {
    expect(RUN_ID.test('SW-0001')).toBe(true);
    expect(RUN_ID.test('MM3-0001')).toBe(true);
    expect(RUN_ID.test('XX-0001')).toBe(false);
    expect(formatRunId(7)).toBe('MM3-0007');
  });

  it('a request whose mak.parent is an old SW- id validates', () => {
    const text = readFileSync('test/fixtures/requests/valid/class.yaml', 'utf8');
    const doc = parse(text) as { mak: Record<string, unknown> };
    doc.mak.parent = 'SW-0001';
    const v = validateRequest(doc, 'class');
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.request.mak.parent).toBe('SW-0001');
    doc.mak.parent = 'nope-1';
    expect(validateRequest(doc, 'class').ok).toBe(false);
  });

  it('a ledger holding SW-0001 keeps counting: the next run is MM3-0002, and both are viewable', () => {
    const { paths } = tempProject({});
    appendContractRun(paths, sampleContractRun(), NOW, 'b');
    writeFileSync(paths.log, readFileSync(paths.log, 'utf8').replace(/MM3-0001/g, 'SW-0001'));
    const second = appendContractRun(paths, sampleContractRun(), NOW + 1000, 'b');
    expect(second.id).toBe('MM3-0002');
    expect(readLedger(paths).map((r) => r.id)).toEqual(['SW-0001', 'MM3-0002']);
    expect(findRun(paths, 'SW-0001')?.id).toBe('SW-0001');
    expect(findRun(paths, 'MM3-0001')).toBeUndefined(); // no aliasing: the stored id is matched exactly
    for (const id of ['SW-0001', 'MM3-0002']) expect(runView(id, 1, { paths, env: {} }).text).toContain(id);
  });
});
