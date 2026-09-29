/**
 * The real stdin/stdout loop for `sidewise mcp`: newline-delimited JSON-RPC 2.0 over stdio (one message per
 * line, no embedded newlines, per the MCP transport spec). stdout carries ONLY the JSON-RPC channel — nothing
 * else is ever written there. A line that fails to parse gets a JSON-RPC parse-error response with `id: null`,
 * same as any other malformed request; a notification (no response from handleMessage) writes nothing back.
 */
import readline from 'node:readline';
import { handleMessage, type JsonRpcRequest, type RunOne } from './protocol.ts';

export interface McpIo {
  input: NodeJS.ReadableStream;
  output: NodeJS.WritableStream;
}

/** Resolves once `io.input` closes (the client disconnecting, or real stdin's EOF) — `sidewise mcp` awaits this
 *  and then exits 0, per the stdio transport's own shutdown rule. */
export function runMcpServer(io: McpIo, runOne: RunOne, serverVersion: string): Promise<void> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: io.input, terminal: false });
    rl.on('line', (line) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      let msg: JsonRpcRequest;
      try {
        msg = JSON.parse(trimmed) as JsonRpcRequest;
      } catch {
        io.output.write(`${JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } })}\n`);
        return;
      }
      handleMessage(msg, { runOne, serverVersion })
        .then((response) => {
          if (response) io.output.write(`${JSON.stringify(response)}\n`);
        })
        .catch(() => {
          // Defensive only: handleMessage's own try/catch around tools/call already covers realistic failures.
          const id = (msg as { id?: string | number | null }).id ?? null;
          io.output.write(`${JSON.stringify({ jsonrpc: '2.0', id, error: { code: -32603, message: 'Internal error' } })}\n`);
        });
    });
    rl.on('close', () => resolve());
  });
}
