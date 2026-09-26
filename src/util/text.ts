/** Small text guards for anything we echo back to a terminal: clip long input, and spot control characters. */
export const clip = (s: string, n: number): string => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

const CONTROL = /[\u0000-\u001f\u007f]/;
export const hasControlChars = (s: string): boolean => CONTROL.test(s);
