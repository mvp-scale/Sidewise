/** Redacts secret-shaped strings before anything reaches the classifier or the ledger (append-only: a leak can't be undone). */
const PATTERNS: RegExp[] = [
  /gh[pousr]_[A-Za-z0-9]{20,}/g,
  /sk-[A-Za-z0-9_-]{20,}/g,
  /npm_[A-Za-z0-9]{30,}/g,
  /AKIA[0-9A-Z]{16}/g,
  /xox[abprs]-[A-Za-z0-9-]{10,}/g,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
];
const KEY_VALUE = /\b(api[_-]?key|token|secret|password|passwd)\b(\s*[:=]\s*)(['"]?)[^\s'"]{8,}\3/gi;

export function redact(text: string): string {
  let out = text.replace(KEY_VALUE, (_m, key: string, sep: string) => `${key}${sep}[redacted]`);
  for (const p of PATTERNS) out = out.replace(p, '[redacted]');
  return out;
}

export function redactDeep<T>(value: T): T {
  if (typeof value === 'string') return redact(value) as unknown as T;
  if (Array.isArray(value)) return value.map((v: unknown) => redactDeep(v)) as unknown as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, redactDeep(v)])) as T;
  }
  return value;
}
