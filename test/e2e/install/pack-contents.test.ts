// The real tarball, not a fixture: after a real build, npm pack --dry-run --json must carry every runtime
// entry point (derived from package.json's own bin/exports) and nothing from lab/, test/, docs/, scripts/,
// or .superpowers/.
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { checkPackContents, parsePackJson } from '../../../scripts/check-pack.ts';

describe('npm pack --dry-run contents', () => {
  it('has no problems against the real, built tarball', () => {
    const raw = execFileSync('npm', ['pack', '--dry-run', '--json'], { encoding: 'utf8' });
    expect(checkPackContents(parsePackJson(raw))).toEqual([]);
  });
});
