/** Request texts for tests. The default is the method's canonical L1 example (10 slots, 3 reversed, 2 primitives). */
export const RM_SLOTS = [
  ' 1  Is request text placed directly into the SQL query?',
  ' 2  Could a caller change what the query does?',
  ' 3 !Is the id checked to be a number before use?',
  " 4  Could one user read another user's record?",
  ' 5  Can any caller read any record without a permission check?',
  ' 6 !Is the caller compared to the record owner?',
  ' 7  Does the error sent back reveal the query?',
  ' 8  Does the code log an email address?',
  ' 9 !Does the query select only needed columns?',
  '10  Would a standard security scanner flag this code?',
];

export const RM_PRIMITIVES = ['~ How severe is the worst issue? none | low | medium | high | critical', '? Where should this go? ship | fix | block'];

/** n distinct slots; every third one is reverse-keyed. */
export function numberedSlots(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `${String(i + 1).padStart(2)} ${(i + 1) % 3 === 0 ? '!' : ' '}Question ${i + 1} holds for the handler?`);
}

export function classRequest(o: { header?: string; fields?: Record<string, string | null>; slots?: string[]; primitives?: string[] } = {}): string {
  const fields: Record<string, string | null> = {
    perspective: 'reviewer',
    where: 'src/user.ts:1-3 · area: api',
    problem: 'login lookup builds SQL from the request',
    tags: 'sql, auth',
    focus: 'This handler is safe to merge',
    ...o.fields,
  };
  const fieldLines = Object.entries(fields)
    .filter(([, v]) => v !== null)
    .map(([k, v]) => `${k}: ${v}`);
  return [o.header ?? 'mm3 class L1', ...fieldLines, '', ...(o.slots ?? RM_SLOTS), '', ...(o.primitives ?? RM_PRIMITIVES)].join('\n');
}
