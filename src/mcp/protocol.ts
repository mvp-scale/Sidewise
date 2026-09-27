/**
 * Pure JSON-RPC 2.0 message handling for the `sidewise` MCP tool — no real I/O here (see stdio.ts for the
 * actual stdin/stdout loop, and cli.ts's `mcp` command for the wiring). One tool, `sidewise`, runs exactly what
 * `sidewise <args...>` would run, in-process, with `stdin` standing in for the CLI's own stdin — there's no
 * second contract; the same YAML goes in and comes out.
 *
 * Handshake: this implements the classic initialize/initialized flow (initialize, notifications/initialized,
 * tools/list, tools/call, ping), not the newest published MCP revision (2026-07-28), which drops the handshake
 * for a per-request `_meta` protocol-version scheme. That revision is brand new, and every real stdio MCP
 * client this plugin will actually talk to — including Claude Code's own — is expected to still speak the
 * classic handshake, so this is the interoperable choice: a deliberate, documented deviation from "the current
 * spec" read literally.
 */

export interface JsonRpcRequest {
  jsonrpc?: unknown;
  id?: string | number | null;
  method?: unknown;
  params?: unknown;
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string };
}

/** Runs one `sidewise <args...>` call in-process; `stdin` stands in for fd 0 (e.g. a `-` positional). */
export type RunOne = (args: string[], stdin?: string) => Promise<{ exit: number; text: string }>;

const SUPPORTED_VERSIONS = ['2024-11-05', '2025-03-26', '2025-06-18', '2025-11-25'] as const;
const DEFAULT_VERSION = '2025-06-18';

export const TOOL_NAME = 'sidewise';

/** The one tool this server exposes: same args/stdin as the CLI, same text + exit code back. */
export function toolDefinition(): { name: string; description: string; inputSchema: Record<string, unknown> } {
  return {
    name: TOOL_NAME,
    description:
      'Run a sidewise CLI command in this project — the same arguments and stdin the sidewise CLI takes ' +
      '(e.g. args: ["class","-"], stdin: <request YAML>, or args: ["doctor"]). Returns the same text output ' +
      'sidewise would print, and marks the result an error when the exit code is not 0.',
    inputSchema: {
      type: 'object',
      properties: {
        args: { type: 'array', items: { type: 'string' }, description: 'sidewise CLI arguments, e.g. ["doctor"] or ["class","-"]' },
        stdin: { type: 'string', description: 'Text to feed as stdin, for a "-" argument (e.g. the request YAML).' },
      },
      required: ['args'],
    },
  };
}

const err = (id: string | number | null, code: number, message: string): JsonRpcResponse => ({ jsonrpc: '2.0', id, error: { code, message } });
const ok = (id: string | number | null, result: unknown): JsonRpcResponse => ({ jsonrpc: '2.0', id, result });

/** One JSON-RPC message in, a response out — or undefined for a notification (no `id`), which never gets one,
 *  regardless of method name (that's the JSON-RPC 2.0 rule: absence of `id` is what makes it a notification). */
export async function handleMessage(msg: JsonRpcRequest, deps: { runOne: RunOne; serverVersion: string }): Promise<JsonRpcResponse | undefined> {
  const hasId = Object.hasOwn(msg, 'id') && msg.id !== undefined;
  if (!hasId) return undefined;
  const id = msg.id as string | number | null;
  const method = typeof msg.method === 'string' ? msg.method : undefined;
  if (!method || msg.jsonrpc !== '2.0') return err(id, -32600, 'Invalid Request');

  if (method === 'initialize') {
    const params = (msg.params ?? {}) as { protocolVersion?: unknown };
    const requested = typeof params.protocolVersion === 'string' ? params.protocolVersion : undefined;
    const protocolVersion = requested && (SUPPORTED_VERSIONS as readonly string[]).includes(requested) ? requested : DEFAULT_VERSION;
    return ok(id, { protocolVersion, capabilities: { tools: {} }, serverInfo: { name: 'sidewise', version: deps.serverVersion } });
  }

  if (method === 'ping') return ok(id, {});

  if (method === 'tools/list') return ok(id, { tools: [toolDefinition()] });

  if (method === 'tools/call') {
    const params = (msg.params ?? {}) as { name?: unknown; arguments?: { args?: unknown; stdin?: unknown } };
    if (params.name !== TOOL_NAME) return err(id, -32602, `Unknown tool: ${String(params.name)}`);
    const rawArgs = params.arguments?.args;
    const args = Array.isArray(rawArgs) ? rawArgs.map(String) : [];
    const stdin = typeof params.arguments?.stdin === 'string' ? params.arguments.stdin : undefined;
    try {
      const { exit, text } = await deps.runOne(args, stdin);
      return ok(id, { content: [{ type: 'text', text }], isError: exit !== 0 });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return ok(id, { content: [{ type: 'text', text: `✖ sidewise: ${message}` }], isError: true });
    }
  }

  return err(id, -32601, `Method not found: ${method}`);
}
