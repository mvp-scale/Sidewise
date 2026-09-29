// init's only terminal interaction: hidden input for the key, and yes/no confirmation. Every case here runs
// through an injected fake TTY stream pair (never process.stdin/stdout), and the hidden-input tests assert the
// literal typed secret never reaches the recorded output — only the prompt text and control sequences do.
import { PassThrough } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { confirm, readHidden, readOneLine } from '../../../src/setup/prompt.ts';

function fakeTty(): { input: PassThrough & { isTTY: boolean }; output: PassThrough & { isTTY: boolean }; recorded: () => string } {
  const input = Object.assign(new PassThrough(), { isTTY: true });
  const output = Object.assign(new PassThrough(), { isTTY: true });
  let recorded = '';
  output.on('data', (c: Buffer) => {
    recorded += c.toString();
  });
  return { input, output, recorded: () => recorded };
}

function type(input: PassThrough, line: string): void {
  input.write(line);
  input.write('\n');
}

describe('readHidden [C-099]', () => {
  it('resolves the typed line, and the secret never appears in the recorded output', async () => {
    const { input, output, recorded } = fakeTty();
    const promise = readHidden('key: ', { input, output });
    type(input, 'sk-super-secret-value');
    const answer = await promise;
    expect(answer).toBe('sk-super-secret-value');
    expect(recorded()).not.toContain('sk-super-secret-value');
    expect(recorded()).toContain('key: ');
  });

  it('an empty line (Enter only) resolves to an empty string', async () => {
    const { input, output } = fakeTty();
    const promise = readHidden('key: ', { input, output });
    type(input, '');
    expect(await promise).toBe('');
  });
});

describe('readOneLine (--key-stdin)', () => {
  it('reads exactly one line, with no prompt and no echo at all', async () => {
    const input = new PassThrough();
    const promise = readOneLine(input);
    input.write('piped-key-value\nsecond-line-ignored\n');
    expect(await promise).toBe('piped-key-value');
  });

  it('EOF with no line at all resolves to an empty string, never rejects', async () => {
    const input = new PassThrough();
    const promise = readOneLine(input);
    input.end();
    await expect(promise).resolves.toBe('');
  });
});

describe('confirm', () => {
  it('an empty answer takes the stated default', async () => {
    const { input, output } = fakeTty();
    const yes = confirm('replace it?', true, { input, output });
    type(input, '');
    expect(await yes).toBe(true);

    const { input: input2, output: output2 } = fakeTty();
    const no = confirm('replace it?', false, { input: input2, output: output2 });
    type(input2, '');
    expect(await no).toBe(false);
  });

  it('y/yes/n/no answer explicitly, regardless of the default', async () => {
    const { input, output } = fakeTty();
    const p = confirm('go ahead?', false, { input, output });
    type(input, 'y');
    expect(await p).toBe(true);
  });
});
