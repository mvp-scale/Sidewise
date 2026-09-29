/** A fixture module with two exports: one used by good.ts, one — neverImported — used nowhere. */
export function helperUsed(): string {
  return 'used';
}

export function neverImported(): string {
  return 'dead';
}
