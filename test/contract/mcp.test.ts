// [C-103] the `sidewise` MCP tool: name/input shape, runs exactly what `sidewise <args...>` would run in-process
// against the same request YAML, and returns the same text output plus the exit code as `isError`.
import { PassThrough } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { runCli, type CliCtx } from '../../src/cli.ts';
import { handleMessage, TOOL_NAME, toolDefinition, type JsonRpcRequest, type JsonRpcResponse, type RunOne } from '../../src/mcp/protocol.ts';

function fakeCtx(env: Record<string, string | undefined> = {}): CliCtx {
  return {
    env: { SIDEWISE_PROVIDER: 'fake', ...env },
    cwd: process.cwd(),
    platform: process.platform,
    runner: () => ({ status: 1, stdout: '', stderr: 'not used' }),
    // The real repo root, not a placeholder: `template` reads skills/sidewise/templates/*.yaml from here (see
    // src/verbs/template.ts's packageDir parameter) — a fixture placeholder would 404 that read for real.
    packageDir: process.cwd(),
    pkg: { name: 'sidewise', version: '0.0.0-test' },
    homeDir: '/nonexistent-home',
    nodeVersion: process.version,
    stdin: () => Buffer.from(''),
    io: { input: new PassThrough(), output: new PassThrough() },
  };
}

function runOneFor(ctx: CliCtx): RunOne {
  return (args, stdin) => runCli(args, { ...ctx, stdin: () => Buffer.from(stdin ?? '', 'utf8') });
}

/** Drives the REAL `sidewise mcp` command (cli.ts's own `dispatch`, over real stdio streams — not a hand-rolled
 *  `runOne`): writes each message as one JSON-RPC line, closes stdin (so the server's own read loop resolves,
 *  same as a real client disconnecting), then parses whatever it wrote back, one response per line. */
async function runMcpOverStdio(ctx: CliCtx, messages: readonly JsonRpcRequest[]): Promise<JsonRpcResponse[]> {
  const input = new PassThrough();
  const output = new PassThrough();
  const chunks: Buffer[] = [];
  output.on('data', (c: Buffer) => chunks.push(c));
  const done = runCli(['mcp'], { ...ctx, io: { input, output } });
  for (const m of messages) input.write(`${JSON.stringify(m)}\n`);
  input.end();
  await done;
  return Buffer.concat(chunks)
    .toString('utf8')
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as JsonRpcResponse);
}

describe('mcp protocol: tools/list', () => {
  it('lists exactly one tool named "sidewise" with the {args, stdin} shape', async () => {
    const resp = await handleMessage({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, { runOne: runOneFor(fakeCtx()), serverVersion: '0.0.0-test' });
    expect(resp?.result).toEqual({ tools: [toolDefinition()] });
    expect(TOOL_NAME).toBe('sidewise');
  });
});

describe('mcp protocol: initialize', () => {
  it('echoes a supported requested protocolVersion back unchanged', async () => {
    const resp = await handleMessage(
      { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25' } },
      { runOne: runOneFor(fakeCtx()), serverVersion: '0.0.0-test' },
    );
    expect((resp?.result as { protocolVersion?: string })?.protocolVersion).toBe('2025-11-25');
  });

  it('falls back to 2025-06-18 for an unsupported/missing requested version', async () => {
    const resp = await handleMessage(
      { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '1.0.0' } },
      { runOne: runOneFor(fakeCtx()), serverVersion: '0.0.0-test' },
    );
    expect((resp?.result as { protocolVersion?: string })?.protocolVersion).toBe('2025-06-18');
  });

  it('a notification (no id) — e.g. notifications/initialized — gets no response at all', async () => {
    const msg = { jsonrpc: '2.0', method: 'notifications/initialized' } as JsonRpcRequest;
    const resp = await handleMessage(msg, { runOne: runOneFor(fakeCtx()), serverVersion: '0.0.0-test' });
    expect(resp).toBeUndefined();
  });

  it('ping resolves to an empty result', async () => {
    const resp = await handleMessage({ jsonrpc: '2.0', id: 7, method: 'ping' }, { runOne: runOneFor(fakeCtx()), serverVersion: '0.0.0-test' });
    expect(resp?.result).toEqual({});
  });
});

describe('mcp protocol: tools/call [C-103]', () => {
  it('doctor: the tool result text matches calling the CLI dispatch directly, isError false on exit 0', async () => {
    const ctx = fakeCtx();
    const direct = await runCli(['doctor'], ctx);
    const resp: JsonRpcResponse | undefined = await handleMessage(
      { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'sidewise', arguments: { args: ['doctor'] } } },
      { runOne: runOneFor(ctx), serverVersion: '0.0.0-test' },
    );
    expect(direct.exit).toBe(0);
    const result = resp?.result as { content: Array<{ type: string; text: string }>; isError: boolean };
    expect(result.content[0]?.text).toBe(direct.text);
    expect(result.isError).toBe(false);
  });

  it('template class: same text as calling the CLI dispatch directly, no project needed', async () => {
    const ctx = fakeCtx();
    const direct = await runCli(['template', 'class'], ctx);
    const resp = await handleMessage(
      { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'sidewise', arguments: { args: ['template', 'class'] } } },
      { runOne: runOneFor(ctx), serverVersion: '0.0.0-test' },
    );
    const result = resp?.result as { content: Array<{ type: string; text: string }>; isError: boolean };
    expect(result.content[0]?.text).toBe(direct.text);
    expect(result.isError).toBe(false);
  });

  it('an unknown command: isError true, matching the CLI dispatch\'s own nonzero exit', async () => {
    const ctx = fakeCtx();
    const direct = await runCli(['not-a-real-command'], ctx);
    expect(direct.exit).not.toBe(0);
    const resp = await handleMessage(
      { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'sidewise', arguments: { args: ['not-a-real-command'] } } },
      { runOne: runOneFor(ctx), serverVersion: '0.0.0-test' },
    );
    const result = resp?.result as { content: Array<{ type: string; text: string }>; isError: boolean };
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toBe(direct.text);
  });

  it('a request YAML on stdin (args: ["class", "-"]) with no project stops the same way the CLI would', async () => {
    const ctx = fakeCtx();
    const resp = await handleMessage(
      { jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'sidewise', arguments: { args: ['class', '-'], stdin: 'side:\n  goal: x\n' } } },
      { runOne: runOneFor(ctx), serverVersion: '0.0.0-test' },
    );
    const direct = await runCli(['class', '-'], { ...ctx, stdin: () => Buffer.from('side:\n  goal: x\n', 'utf8') });
    const result = resp?.result as { content: Array<{ type: string; text: string }>; isError: boolean };
    expect(result.content[0]?.text).toBe(direct.text);
    expect(result.isError).toBe(direct.exit !== 0);
  });

  it('an unknown tool name is a protocol-level error, not a tool result', async () => {
    const resp = await handleMessage(
      { jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'not-sidewise', arguments: { args: [] } } },
      { runOne: runOneFor(fakeCtx()), serverVersion: '0.0.0-test' },
    );
    expect(resp?.error?.code).toBe(-32602);
  });

  // Fix #9: the plugin's own cwd is wherever Claude launched, which may not be the project — an optional
  // `project` argument (meaning SIDEWISE_HOME for that one call) lets a caller point at a nested project
  // without relying on cwd. [C-142]
  it('an optional project argument is advertised in the tool schema and passed through to runOne', async () => {
    expect((toolDefinition().inputSchema as { properties: Record<string, unknown> }).properties.project).toBeDefined();
    const calls: Array<[string[], string | undefined, string | undefined]> = [];
    const spy: RunOne = async (args, stdin, project) => {
      calls.push([args, stdin, project]);
      return { exit: 0, text: '' };
    };
    await handleMessage(
      { jsonrpc: '2.0', id: 9, method: 'tools/call', params: { name: 'sidewise', arguments: { args: ['doctor'], project: '/some/nested/project' } } },
      { runOne: spy, serverVersion: '0.0.0-test' },
    );
    expect(calls).toEqual([[['doctor'], undefined, '/some/nested/project']]);
  });

  it('project is undefined, not the empty string, when the caller omits it', async () => {
    const calls: Array<string | undefined> = [];
    const spy: RunOne = async (_args, _stdin, project) => {
      calls.push(project);
      return { exit: 0, text: '' };
    };
    await handleMessage(
      { jsonrpc: '2.0', id: 10, method: 'tools/call', params: { name: 'sidewise', arguments: { args: ['doctor'] } } },
      { runOne: spy, serverVersion: '0.0.0-test' },
    );
    expect(calls).toEqual([undefined]);
  });

  it('an unrecognized method with an id is "method not found"', async () => {
    const resp = await handleMessage({ jsonrpc: '2.0', id: 8, method: 'not/a/method' }, { runOne: runOneFor(fakeCtx()), serverVersion: '0.0.0-test' });
    expect(resp?.error?.code).toBe(-32601);
  });
});

const NODE_STOP_LINE = '✖ node: v20.11.0 is too old → install Node 22.13 or newer (it powers the ledger index); https://nodejs.org';

describe('the Node ≥ 22.13 guard (owner ruling) [C-106]', () => {
  it('a normal command exits 2 with the exact ✖ line on too old a Node — template needs no project either', async () => {
    const ctx: CliCtx = { ...fakeCtx(), nodeVersion: 'v20.11.0' };
    const r = await runCli(['template', 'class'], ctx);
    expect(r.exit).toBe(2);
    expect(r.text).toBe(`${NODE_STOP_LINE}\n`);
  });

  it('a good Node runs the same command normally', async () => {
    const ctx: CliCtx = { ...fakeCtx(), nodeVersion: 'v22.13.0' };
    const r = await runCli(['template', 'class'], ctx);
    expect(r.exit).toBe(0);
    expect(r.text).not.toContain('✖ node:');
  });

  it('doctor still runs on too old a Node (never a bare stop) but exits 2', async () => {
    const ctx: CliCtx = { ...fakeCtx(), nodeVersion: 'v20.11.0' };
    const r = await runCli(['doctor'], ctx);
    expect(r.exit).toBe(2);
    expect(r.text).toContain('doctor:');
    expect(r.text).toContain('node: v20.11.0 ✖ too old → install Node 22.13+');
    expect(r.text).toContain('index: none (needs Node 22.13+)');
  });

  // These two run the REAL `sidewise mcp` command (cli.ts's own dispatch, not a hand-rolled runOne) over real
  // stdio streams — the version guard's mcp-specific wrapping lives inside that command's own branch, so
  // proving it needs the real loop, not protocol.ts's handleMessage in isolation.
  it('sidewise mcp still answers initialize and tools/list on too old a Node, over the real stdio loop', async () => {
    const ctx: CliCtx = { ...fakeCtx(), nodeVersion: 'v20.11.0' };
    const responses = await runMcpOverStdio(ctx, [
      { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
      { jsonrpc: '2.0', id: 2, method: 'tools/list' },
    ]);
    expect(responses[0]?.error).toBeUndefined();
    expect(responses[1]?.result).toEqual({ tools: [toolDefinition()] });
  });

  it('every tools/call is isError with the same ✖ line on too old a Node, whatever command was asked — doctor included, over the real stdio loop', async () => {
    const ctx: CliCtx = { ...fakeCtx(), nodeVersion: 'v20.11.0' };
    const responses = await runMcpOverStdio(ctx, [
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'sidewise', arguments: { args: ['doctor'] } } },
      { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'sidewise', arguments: { args: ['template', 'class'] } } },
      { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'sidewise', arguments: { args: ['not-a-real-command'] } } },
    ]);
    expect(responses).toHaveLength(3);
    for (const resp of responses) {
      const result = resp?.result as { content: Array<{ type: string; text: string }>; isError: boolean };
      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toBe(`${NODE_STOP_LINE}\n`);
    }
  });
});

describe('fix #8: no doubled ✖ prefix on the real mcp stdio path', () => {
  // A LedgerError (or any other error dispatch() can throw) used to reach protocol.ts's tools/call catch block
  // with its own "✖ field: ..." message already formed, which that catch then re-wrapped as "✖ sidewise: ...",
  // doubling the glyph. Only the real `sidewise mcp` stdio loop exercises this — cli.ts's mcp branch used to
  // call `dispatch` directly instead of `runCli`, which is the one thing that normalizes a thrown error into a
  // single-✖ `{exit, text}` (see runCli's own catch). [C-140]
  it('an outcome call on an unknown run id comes back with exactly one ✖, not two', async () => {
    const ctx = fakeCtx();
    const responses = await runMcpOverStdio(ctx, [
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'sidewise', arguments: { args: ['outcome', 'SW-9999', 'held', '--by', 'someone'] } } },
    ]);
    const result = responses[0]?.result as { content: Array<{ type: string; text: string }>; isError: boolean };
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toBe('✖ outcome: SW-9999 is not in the ledger → check the id with "sidewise view SW-9999"\n');
    expect(result.content[0]?.text.match(/✖/g)).toHaveLength(1);
  });
});
