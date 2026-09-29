/**
 * The only place `mm3 init`/`uninstall` read from a terminal: yes/no confirmation, and the one hidden
 * field (the API key). No new dependency (no inquirer) — `node:readline` already ships with Node, and hiding
 * input is the standard trick of muting everything `_writeToOutput` would otherwise echo except the prompt
 * itself and the final newline. Streams are always passed in (never a bare `process.stdin`/`stdout` default),
 * so a test can inject a fake TTY stream and assert the typed characters never reached the recorded output.
 */
import readline from 'node:readline';

export interface PromptIO {
  input: NodeJS.ReadableStream & { isTTY?: boolean };
  output: NodeJS.WritableStream & { isTTY?: boolean };
}

interface HiddenInterface {
  _writeToOutput: (s: string) => void;
}

/** One line, with every character typed for it muted from `io.output` — only the prompt text and the closing
 *  newline are ever written there. Used for the API key; never logs, never echoes, never takes it from argv. */
export function readHidden(promptText: string, io: PromptIO): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: io.input, output: io.output, terminal: io.output.isTTY === true });
    (rl as unknown as HiddenInterface)._writeToOutput = (s: string) => {
      if (s === promptText) io.output.write(s);
    };
    rl.question(promptText, (answer) => {
      rl.close();
      io.output.write('\n');
      resolve(answer);
    });
  });
}

/** One line, read and echoed normally — for `--key-stdin`'s "read one line from stdin for automation", and for
 *  anywhere else a plain (non-secret) answer is wanted without the hidden-input treatment. */
export function readLine(promptText: string, io: PromptIO): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: io.input, output: io.output, terminal: io.output.isTTY === true });
    rl.question(promptText, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

/** Exactly one line from a stream with no prompt at all (`--key-stdin`, `--yes`'s non-interactive automation
 *  path): resolves '' at EOF with no line, never rejects on a clean close. */
export function readOneLine(input: NodeJS.ReadableStream): Promise<string> {
  return new Promise((resolve, reject) => {
    const rl = readline.createInterface({ input, terminal: false });
    let resolved = false;
    rl.once('line', (line) => {
      resolved = true;
      rl.close();
      resolve(line);
    });
    rl.once('close', () => {
      if (!resolved) resolve('');
    });
    rl.once('error', reject);
  });
}

/** y/n with a default shown in brackets; an empty answer (just Enter) takes the default. */
export async function confirm(promptText: string, defaultYes: boolean, io: PromptIO): Promise<boolean> {
  const suffix = defaultYes ? '[Y/n]' : '[y/N]';
  const answer = (await readLine(`${promptText} ${suffix} `, io)).trim().toLowerCase();
  if (!answer) return defaultYes;
  return answer === 'y' || answer === 'yes';
}
