// A real `npm pack` tarball, installed into a throwaway project exactly the way a consumer would
// (`npm install <tarball>`), then every command in README's Quickstart run against the installed bin.
// --prefer-offline is what makes this pass from the npm cache alone in the clean-room container
// (docker/test.sh runs with --network none); on a normal dev machine it just prefers the cache too.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { USER_TS } from '../../helpers/project.ts';

function quickstartCommands(): string[] {
  const readme = readFileSync('README.md', 'utf8');
  const fence = /```bash\n# sidewise-quickstart\n([\s\S]*?)```/.exec(readme);
  if (!fence) throw new Error('README.md has no "# sidewise-quickstart" fenced block');
  return fence[1]!.trim().split('\n').filter((l) => l.trim());
}

describe('a real npm pack tarball, installed like a consumer would', () => {
  it('npm install <tarball>, then every README quickstart line exits 0 against the installed bin', () => {
    const packDir = mkdtempSync(path.join(os.tmpdir(), 'sidewise-pack-'));
    const raw = execFileSync('npm', ['pack', '--json', '--pack-destination', packDir], { encoding: 'utf8' });
    const [{ filename }] = JSON.parse(raw) as [{ filename: string }];
    const tarball = path.join(packDir, filename);

    const projectDir = mkdtempSync(path.join(os.tmpdir(), 'sidewise-consumer-'));
    // Plan 2b's class template now names src/handlers/user.ts as its own worked example where: (a
    // NodeGoat-neutral path), not src/user.ts — give the project both so `template class | class` (the
    // quickstart's own first two lines) has real code to read.
    mkdirSync(path.join(projectDir, 'src', 'handlers'), { recursive: true });
    writeFileSync(path.join(projectDir, 'src', 'user.ts'), USER_TS);
    writeFileSync(path.join(projectDir, 'src', 'handlers', 'user.ts'), USER_TS);
    writeFileSync(path.join(projectDir, 'package.json'), JSON.stringify({ name: 'sidewise-consumer', version: '0.0.0', private: true }));

    const install = spawnSync('npm', ['install', tarball, '--no-audit', '--no-fund', '--prefer-offline'], { cwd: projectDir, encoding: 'utf8' });
    expect(install.status, install.stderr).toBe(0);

    const bin = path.join(projectDir, 'node_modules', '.bin', 'sidewise');
    // SIDEWISE_HOME names the project explicitly (paths.ts's resolvePaths) — projectDir has neither .sidewise
    // nor .git yet, same as readme.test.ts's equivalent run against dist/cli.js directly.
    const env = { ...process.env, SIDEWISE_HOME: projectDir, SIDEWISE_PROVIDER: 'fake', SIDEWISE_ACTOR: 'install-e2e', TYPESAFE_API_KEY: '', AI_GATEWAY_API_KEY: '' };
    for (const line of quickstartCommands()) {
      const r = spawnSync('sh', ['-c', line.replace(/^sidewise\b/u, bin)], { cwd: projectDir, env, encoding: 'utf8' });
      expect(r.status, `"${line}" failed:\n${r.stderr}`).toBe(0);
    }
  });
});
