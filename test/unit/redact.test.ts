// Redaction must stay linear on hostile input: an agent can paste anything into a request, and code evidence
// can be a minified bundle. A cubic regex here once took minutes on 24 KB ('token_' repeated).
import { afterEach, describe, expect, it } from 'vitest';
import { clearRegisteredSecrets, redact, redactSecrets, registerSecret } from '../../src/ledger/redact.ts';

const timed = (text: string): { ms: number; out: string } => {
  const start = performance.now();
  const out = redact(text);
  return { ms: performance.now() - start, out };
};

// One minified-style line (no newlines) of about 1 MB, full of secret-ish words next to separators.
const minified = (): string => {
  const chunk = 'var a0=function(b){return b.token_id+c1.secretKey||"x"},d=[1,2,3],e={apiKey:f,g:"h@i"};';
  return chunk.repeat(Math.ceil(1_048_576 / chunk.length));
};

describe('redact stays linear on hostile input', () => {
  it("'token_' repeated 20 000 times: under 2 s", () => {
    const { ms, out } = timed('token_'.repeat(20_000));
    expect(out).toBe('token_'.repeat(20_000)); // nothing to redact: no separator, no value
    expect(ms).toBeLessThan(2000);
  });

  it('a 1 MB minified line: under 2 s', () => {
    expect(timed(minified()).ms).toBeLessThan(2000);
  });

  it('a 1 MB base64-style blob with no separators: under 2 s', () => {
    const blob = 'QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVo0123456789abcdef'.repeat(Math.ceil(1_048_576 / 50));
    expect(timed(blob).ms).toBeLessThan(2000);
    expect(timed(`a@${'b.'.repeat(500_000)}`).ms).toBeLessThan(2000);
  });

  it('many private-key headers with no end: under 2 s', () => {
    const header = '-----BEGIN RSA ' + 'PRIVATE KEY-----\n'; // built at runtime: the pre-commit leak check
    expect(timed(header.repeat(30_000)).ms).toBeLessThan(2000);
  });
});

describe('redact still catches what it did', () => {
  it('a secret-ish name longer than the bound is still caught at the keyword', () => {
    const v = 'Zq' + '9x'.repeat(8);
    const long = `${'X'.repeat(100)}_API_KEY=${v}`;
    expect(redact(long)).not.toContain(v);
  });

  it('an email with a long local part is still redacted', () => {
    expect(redact(`${'a'.repeat(80)}@example.com`)).toBe('[redacted]');
    expect(redact('x.dev+tag@mail.example.org, y')).toBe('[redacted], y');
  });

  it('a private key cut off before its END line is still redacted (fail closed)', () => {
    const body = 'MIIE' + 'q'.repeat(40);
    const key = ['-----BEGIN RSA ' + 'PRIVATE KEY-----', body, body].join('\n');
    expect(redactSecrets(`before\n${key}`)).toBe('before\n[redacted]');
    const whole = `${key}\n-----END RSA ${'PRIVATE KEY'}-----\nafter`;
    expect(redactSecrets(whole)).toBe('[redacted]\nafter');
  });
});

describe('registerSecret: a resolved key gets scrubbed even with no secret-shaped pattern [C-097]', () => {
  afterEach(() => clearRegisteredSecrets());

  it('a registered value disappears from any text it appears in', () => {
    registerSecret('a-plain-looking-resolved-key-value');
    expect(redactSecrets('goal: uses a-plain-looking-resolved-key-value here')).toBe('goal: uses [redacted] here');
  });

  it('never registers a short value: a one-letter test double can\'t nuke unrelated text', () => {
    registerSecret('k');
    expect(redactSecrets('breakfast')).toBe('breakfast'); // contains "k"; must survive untouched
  });

  it('clearRegisteredSecrets resets the registry between tests', () => {
    registerSecret('another-long-resolved-key-value');
    clearRegisteredSecrets();
    expect(redactSecrets('another-long-resolved-key-value')).toBe('another-long-resolved-key-value');
  });
});
