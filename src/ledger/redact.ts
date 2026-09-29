/** Redacts secret-shaped strings before anything reaches the classifier or the ledger (append-only: a leak can't be undone). */

// A resolved TypeSafe/gateway key (init's keychain/user-file storage means it may never touch env, so the
// pattern-based checks below can't know its shape). registerSecret adds its literal value here, so a key that
// somehow ends up in a goal or evidence string (a user pastes it by mistake) still never reaches the ledger.
// Anything shorter than MIN_SECRET_LEN is ignored: a short fake-provider test double ('k', 'g-test') would
// otherwise nuke every occurrence of that substring in unrelated text. Module-level and process-lifetime only —
// never written anywhere, never read back.
const MIN_SECRET_LEN = 8;
let registeredSecrets: readonly string[] = [];

export function registerSecret(value: string | undefined): void {
  const v = value?.trim();
  if (v && v.length >= MIN_SECRET_LEN && !registeredSecrets.includes(v)) registeredSecrets = [...registeredSecrets, v];
}

/** Test-only: clears the registry so one test's dummy key can't leak into another's expectations. */
export function clearRegisteredSecrets(): void {
  registeredSecrets = [];
}

const PATTERNS: RegExp[] = [
  /gh[pousr]_[A-Za-z0-9]{20,}/g,
  /sk-[A-Za-z0-9_-]{20,}/g,
  /npm_[A-Za-z0-9]{30,}/g,
  /AKIA[0-9A-Z]{16}/g,
  /xox[abprs]-[A-Za-z0-9-]{10,}/g,
  // A key with no END line (cut off by a line range, or pasted in part) is redacted to the end: fail closed.
  /-----BEGIN [A-Z ]{0,40}PRIVATE KEY-----(?:[\s\S]*?-----END [A-Z ]{0,40}PRIVATE KEY-----|[\s\S]*)/g,
];
// Every pattern must stay linear: requests and code evidence can be megabytes of hostile or minified text.
// The lookbehind starts a match only at the start of a run of address characters, so a long run is scanned once.
const EMAIL = /(?<![A-Za-z0-9._%+-])[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
// A value after any identifier that contains a secret-ish word (TYPESAFE_API_KEY=, "apiKey": , DB_PASSWORD: ).
// Tradeoff: a long expression assigned to such a name (const tokenCount = countTokens(x)) is redacted too.
// The identifier around the keyword is bounded ({0,64}): unbounded, the two runs backtrack cubically. A longer
// name is still caught, from the keyword (or the last "_" before it) onwards.
//
// C-200: this also matches MM3's OWN structured response/ledger keys — a sweep item or category name an
// agent chose itself (issue-token, verify-token, set-new-password), never a real secret. Without the `(?![{[])`
// guard below, the "value" half (`[^\s'"]{8,}`, which stops only at whitespace or a quote) happily swallows the
// immediately-following YAML mapping or list as if it were the secret: `issue-token: {depends: unsure, ...}`
// became `issue-token: [redacted] unsure, ...}`, destroying the category name `depends` — data loss, not a
// leak. A real secret value is never itself a literal `{...}` mapping or `[...]` list, so refusing to start the
// match there is a narrow, correct fix: it leaves every genuine `key: <secret-shaped-value>` pair caught
// exactly as before (verified in redact.test.ts alongside the regression case), and only stops the match from
// starting where the "value" is actually a nested structure, not a secret.
const KEY_VALUE = /(?<![A-Za-z0-9])([A-Za-z0-9_]{0,64}(?:api[_-]?key|token|secret|password|passwd)[A-Za-z0-9_]{0,64})(['"]?)(\s*[:=]\s*)(['"]?)(?![{[])[^\s'"]{8,}\4/gi;
const BEARER = /\b(Bearer)\s+[A-Za-z0-9._~+/=-]{8,}/gi;

/** Secret-shaped redaction only; emails are kept. For identities (actor, by), which must stay comparable. */
export function redactSecrets(text: string): string {
  let out = text.replace(KEY_VALUE, (_m, key: string, quote: string, sep: string) => `${key}${quote}${sep}[redacted]`);
  out = out.replace(BEARER, (_m, word: string) => `${word} [redacted]`);
  for (const p of PATTERNS) out = out.replace(p, '[redacted]');
  for (const s of registeredSecrets) if (out.includes(s)) out = out.split(s).join('[redacted]');
  return out;
}

export function redact(text: string): string {
  return redactSecrets(text).replace(EMAIL, '[redacted]');
}

/** Whether `value` itself, standalone (no surrounding "key: " prefix needed), looks like a real secret — the
 *  same provider-shaped PATTERNS above, or a registered resolved key. config/validate.ts (plan 2c B, security
 *  item) uses this to catch a real key pasted into a config VALUE (e.g. baseURL) regardless of what the key
 *  around it is named — checkSecretLike (defaults.ts's SECRET_LIKE_KEYS) already covers the key-NAME-shaped
 *  case; this is the value-shaped one. `lastIndex` is reset before each test: PATTERNS carry the `g` flag for
 *  redactSecrets' own replace() scans, and a stateful regex's `.test()` would otherwise silently skip matches on
 *  later calls. */
export function looksLikeSecret(value: string): boolean {
  if (registeredSecrets.some((s) => value.includes(s))) return true;
  return PATTERNS.some((p) => {
    p.lastIndex = 0;
    return p.test(value);
  });
}

export function redactDeep<T>(value: T): T {
  if (typeof value === 'string') return redact(value) as unknown as T;
  if (Array.isArray(value)) return value.map((v: unknown) => redactDeep(v)) as unknown as T;
  if (value && typeof value === 'object') {
    // Keys too: item ids (keys of answers, keys, items) come from agent-written names.
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [redact(k), redactDeep(v)])) as T;
  }
  return value;
}
