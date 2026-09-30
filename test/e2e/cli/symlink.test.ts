// The CLI run through a symlink, the way `npm install -g` and node_modules/.bin install it: `mm3` must print,
// never exit 0 silently because process.argv[1] is the link rather than dist/cli.js itself.
import { chmodSync, mkdtempSync, symlinkSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('mm3 through a symlink', () => {
  for (const [label, target] of [['dist/cli.js', 'dist/cli.js'], ['bin/mm3.mjs (the plugin bundle)', 'bin/mm3.mjs']] as const) {
    it(`${label}: help prints through a link, as a global npm install lays it out`, () => {
      const dir = mkdtempSync(path.join(os.tmpdir(), 'mm3-link-'));
      const link = path.join(dir, 'mm3');
      symlinkSync(path.resolve(target), link);
      chmodSync(path.resolve(target), 0o755);
      const r = spawnSync(process.execPath, [link, 'help'], { encoding: 'utf8' });
      expect(r.status, r.stderr).toBe(0);
      expect(r.stdout).toContain('MM3 turns a short numbered yes/no checklist');
    });
  }
});
