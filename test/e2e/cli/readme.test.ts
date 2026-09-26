// Every command in README.md's Quickstart section is executed here, unmodified, against a real project.
// "sidewise" isn't on PATH in this harness, so a tiny wrapper script stands in for the installed binary.
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { tempProject } from '../../helpers/project.ts';

function quickstartCommands(): string[] {
  const readme = readFileSync('README.md', 'utf8');
  const fence = /```bash\n# sidewise-quickstart\n([\s\S]*?)```/.exec(readme);
  if (!fence) throw new Error('README.md has no "# sidewise-quickstart" fenced block');
  return fence[1]!.trim().split('\n').filter((l) => l.trim());
}

/** A `sidewise` shim on PATH that execs the built binary, so README's literal commands run unmodified. */
function shimBin(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'sidewise-bin-'));
  const cli = path.resolve('dist/cli.js');
  writeFileSync(path.join(dir, 'sidewise'), `#!/bin/sh\nexec "${process.execPath}" "${cli}" "$@"\n`);
  chmodSync(path.join(dir, 'sidewise'), 0o755);
  return dir;
}

describe('README Quickstart, run for real', () => {
  it('every line exits 0, in order', () => {
    const { root } = tempProject();
    const bin = shimBin();
    const env = { ...process.env, PATH: `${bin}:${process.env.PATH}`, SIDEWISE_HOME: root, SIDEWISE_PROVIDER: 'fake', SIDEWISE_ACTOR: 'readme', TYPESAFE_API_KEY: '', AI_GATEWAY_API_KEY: '' };
    let combined = '';
    for (const line of quickstartCommands()) {
      const r = spawnSync('sh', ['-c', line], { cwd: root, env, encoding: 'utf8' });
      expect(r.status, `"${line}" failed:\n${r.stderr}`).toBe(0);
      combined += r.stdout;
    }
    // The README says this runs on the fake provider with no key set; `view` labels fake/chaos runs
    // "rehearsal" (src/verbs/view.ts), so that label showing up here proves the claim, not just asserts it.
    expect(combined).toContain('rehearsal');
  });
});
