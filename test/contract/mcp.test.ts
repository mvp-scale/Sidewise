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
    packageDir: '/nonexistent',
    pkg: { name: 'sidewise', version: '0.0.0-test' },
    homeDir: '/nonexistent-home',
    stdin: () => Buffer.from(''),
    io: { input: new PassThrough(), output: new PassThrough() },
  };
}

function runOneFor(ctx: CliCtx): RunOne {
  return (args, stdin) => runCli(args, { ...ctx, stdin: () => Buffer.from(stdin ?? '', 'utf8') });
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

  it('an unrecognized method with an id is "method not found"', async () => {
    const resp = await handleMessage({ jsonrpc: '2.0', id: 8, method: 'not/a/method' }, { runOne: runOneFor(fakeCtx()), serverVersion: '0.0.0-test' });
    expect(resp?.error?.code).toBe(-32601);
  });
});
