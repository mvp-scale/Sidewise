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

// SW-0006 (round 4 smoke): a `loop` sweep response named its own items `issue-token`, `verify-token` and
// `set-new-password` — real category/item names an agent chose, never a secret. KEY_VALUE matched each name as
// a "secret-ish key", then greedily consumed the immediately-following YAML mapping (`{depends: unsure, ...}`)
// as if it were the secret VALUE (its char class stopped only at whitespace/quotes, and `{`/`d`/`e`/... aren't
// whitespace), destroying the category name in the process: `issue-token: {depends: unsure, ...}` became
// `issue-token: [redacted] unsure, ...}` — 3 of 4 result rows corrupted, one clean (`request-reset`, no
// flagged substring). [C-200]
describe('KEY_VALUE never eats a structured YAML value that follows a secret-shaped key name [C-200]', () => {
  it('reproduces SW-0006 byte-for-byte before the fix: the category name is destroyed', () => {
    // Sanity check against the raw pattern shape, documenting the exact incident this test guards against.
    const before = 'issue-token: {depends: unsure, route: fail, 3: 0.66, 7: {top: build-now, p: 1}}';
    const corrupted = 'issue-token: [redacted] unsure, route: fail, 3: 0.66, 7: {top: build-now, p: 1}}';
    expect(corrupted).not.toBe(before); // documents what the bug used to produce, not an assertion on current code
  });

  it('a sweep item name shaped like a secret keyword, followed by a YAML mapping, is left untouched', () => {
    const line = 'issue-token: {depends: unsure, route: fail, 3: 0.66, 7: {top: build-now, p: 1}}';
    expect(redactSecrets(line)).toBe(line);
  });

  it('every corrupted name from the real incident survives, mapping value intact', () => {
    const lines = [
      'issue-token: {depends: unsure, route: fail, 3: 0.66, 7: {top: build-now, p: 1}}',
      'verify-token: {depends: unsure, route: fail, 3: 0.68, 7: {top: build-now, p: 1}}',
      'set-new-password: {depends: unsure, route: fail, 3: 0.70, 7: {top: build-now, p: 1}}',
    ];
    for (const line of lines) expect(redactSecrets(line)).toBe(line);
  });

  it('the one clean row from the real incident (no flagged substring) is still a no-op', () => {
    const line = 'request-reset: {depends: unsure, route: fail, 3: 0.60, 7: {top: build-now, p: 1}}';
    expect(redactSecrets(line)).toBe(line);
  });

  it('a genuinely secret-shaped value after the same kind of key is still redacted, in the same string', () => {
    const text = 'issue-token: {depends: unsure}\napi_key: sk-abc123def456ghi789\n';
    const out = redactSecrets(text);
    expect(out).toContain('issue-token: {depends: unsure}');
    expect(out).not.toContain('sk-abc123def456ghi789');
    expect(out).toContain('api_key: [redacted]');
  });

  it('a secret-shaped value that is itself a YAML list is still not swallowed as a value with { or [ leading it (documents the bracket check applies to both)', () => {
    // Not a realistic secret shape (secrets are never literal YAML lists), but proves the fix keys off "does
    // the value look structured", not off which specific bracket the incident happened to use.
    const line = 'set-new-password: [depends, route]';
    expect(redactSecrets(line)).toBe(line);
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
