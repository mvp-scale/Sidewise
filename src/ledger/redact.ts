/** Redacts secret-shaped strings before anything reaches the classifier or the ledger (append-only: a leak can't be undone). */
const PATTERNS: RegExp[] = [
  /gh[pousr]_[A-Za-z0-9]{20,}/g,
  /sk-[A-Za-z0-9_-]{20,}/g,
  /npm_[A-Za-z0-9]{30,}/g,
  /AKIA[0-9A-Z]{16}/g,
  /xox[abprs]-[A-Za-z0-9-]{10,}/g,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
];
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
// A value after any identifier that contains a secret-ish word (TYPESAFE_API_KEY=, "apiKey": , DB_PASSWORD: ).
// Tradeoff: a long expression assigned to such a name (const tokenCount = countTokens(x)) is redacted too.
const KEY_VALUE = /(?<![A-Za-z0-9])([A-Za-z0-9_]*(?:api[_-]?key|token|secret|password|passwd)[A-Za-z0-9_]*)(['"]?)(\s*[:=]\s*)(['"]?)[^\s'"]{8,}\4/gi;
const BEARER = /\b(Bearer)\s+[A-Za-z0-9._~+/=-]{8,}/gi;

/** Secret-shaped redaction only; emails are kept. For identities (actor, by), which must stay comparable. */
export function redactSecrets(text: string): string {
  let out = text.replace(KEY_VALUE, (_m, key: string, quote: string, sep: string) => `${key}${quote}${sep}[redacted]`);
  out = out.replace(BEARER, (_m, word: string) => `${word} [redacted]`);
  for (const p of PATTERNS) out = out.replace(p, '[redacted]');
  return out;
}

export function redact(text: string): string {
  return redactSecrets(text).replace(EMAIL, '[redacted]');
}

export function redactDeep<T>(value: T): T {
  if (typeof value === 'string') return redact(value) as unknown as T;
  if (Array.isArray(value)) return value.map((v: unknown) => redactDeep(v)) as unknown as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, redactDeep(v)])) as T;
  }
  return value;
}
