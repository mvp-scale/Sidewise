// Why this exists: @types/node tracks the newest Node, but we promise `engines.node` (22.13+). The floor check
// compiles src/ against the Node 22 types alone, so a Node-23+ API in shipped code fails here, not for a user.
// These tests keep that guard honest: it must pass on today's src, it must fail on a newer API, and its types
// must stay on the same major as the engines floor.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve('.');
const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { engines: { node: string }; devDependencies: Record<string, string> };
const tsc = path.join(root, 'node_modules', 'typescript', 'bin', 'tsc');
const floorCheck = (project: string) => spawnSync(process.execPath, [tsc, '-p', project], { cwd: root, encoding: 'utf8' });

describe('Node floor check (src compiles against the oldest supported Node types)', () => {
  it('the floor types are on the same major as engines.node', () => {
    const engineMajor = /(\d+)\./.exec(pkg.engines.node)?.[1];
    const floorMajor = /@(\d+)\./.exec(pkg.devDependencies['@types-floor/node'] ?? '')?.[1];
    expect(floorMajor).toBeDefined();
    expect(floorMajor).toBe(engineMajor);
  });

  it('passes on the current src', () => {
    const r = floorCheck('tsconfig.node-floor.json');
    expect(r.stdout + r.stderr).toBe('');
    expect(r.status).toBe(0);
  }, 120_000);

  it('fails on an API newer than the floor (util.convertProcessSignalToExitCode, Node 25+)', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'mm3-floor-'));
    try {
      writeFileSync(path.join(dir, 'probe.ts'), "import { convertProcessSignalToExitCode } from 'node:util';\nexport const probe = convertProcessSignalToExitCode;\n");
      writeFileSync(path.join(dir, 'tsconfig.json'), JSON.stringify({ extends: path.join(root, 'tsconfig.node-floor.json'), compilerOptions: { typeRoots: [path.join(root, 'node_modules/@types-floor')] }, include: [path.join(dir, 'probe.ts')] }));
      const r = floorCheck(path.join(dir, 'tsconfig.json'));
      expect(r.status).not.toBe(0);
      expect(r.stdout + r.stderr).toContain('convertProcessSignalToExitCode');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }, 120_000);
});
