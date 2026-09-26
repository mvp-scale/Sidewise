/**
 * A small, dependency-free splitter for TypeScript and JavaScript: a file into its functions (scan's
 * `function: each`), and a function into its calls (drill's `call: each`). It is a lexer, not a parser:
 * strings, comments, template text and regex literals are blanked out first, so braces and keywords inside
 * them can't fool the brace matching. Found: function declarations, const/let/var arrow and function
 * expressions, class methods (Class.method) and export default functions. Known limit: an object type as a
 * return annotation (`(): { a: 1 } {`) is taken as the body.
 */
export const SPLITTABLE = /\.(?:[cm]?[jt]s|[jt]sx)$/u;

export interface Unit {
  name: string;
  /** 1-based, inclusive. */
  start: number;
  end: number;
  text: string;
}

const KEYWORDS_BEFORE_REGEX = /(?:^|[^\w$])(?:return|typeof|instanceof|case|do|else|in|of|new|delete|void|throw|yield|await)$/u;

/** The source with every string, comment, template text and regex body replaced by spaces (newlines kept). */
export function maskCode(src: string): string {
  const out = src.split('');
  const n = src.length;
  const blank = (a: number, b: number): void => {
    for (let k = a; k < b && k < n; k++) if (out[k] !== '\n') out[k] = ' ';
  };
  const templates: number[] = []; // brace depth at each open ${
  let depth = 0;
  const regexAllowed = (i: number): boolean => {
    let j = i - 1;
    while (j >= 0 && /\s/u.test(out[j]!)) j--;
    if (j < 0) return true;
    const c = out[j]!;
    if (/[\w$]/u.test(c)) return KEYWORDS_BEFORE_REGEX.test(out.slice(Math.max(0, j - 12), j + 1).join(''));
    return !/[)\]]/u.test(c);
  };
  // Scans template text from `start`; returns the index where code resumes.
  const template = (start: number): number => {
    let j = start;
    while (j < n) {
      if (src[j] === '\\') {
        j += 2;
        continue;
      }
      if (src[j] === '`') {
        blank(start, j);
        return j + 1;
      }
      if (src[j] === '$' && src[j + 1] === '{') {
        blank(start, j);
        depth += 1;
        templates.push(depth);
        return j + 2;
      }
      j += 1;
    }
    blank(start, n);
    return n;
  };
  let i = 0;
  while (i < n) {
    const c = src[i]!;
    const d = src[i + 1];
    if (c === '/' && d === '/') {
      const e = src.indexOf('\n', i);
      const end = e < 0 ? n : e;
      blank(i, end);
      i = end;
    } else if (c === '/' && d === '*') {
      const e = src.indexOf('*/', i + 2);
      const end = e < 0 ? n : e + 2;
      blank(i, end);
      i = end;
    } else if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < n && src[j] !== c && src[j] !== '\n') j += src[j] === '\\' ? 2 : 1;
      blank(i + 1, j);
      i = j + 1;
    } else if (c === '`') {
      i = template(i + 1);
    } else if (c === '/' && regexAllowed(i)) {
      let j = i + 1;
      let inClass = false;
      while (j < n && src[j] !== '\n') {
        if (src[j] === '\\') {
          j += 2;
          continue;
        }
        if (src[j] === '[') inClass = true;
        else if (src[j] === ']') inClass = false;
        else if (src[j] === '/' && !inClass) break;
        j += 1;
      }
      blank(i + 1, j);
      i = j + 1;
    } else if (c === '{') {
      depth += 1;
      i += 1;
    } else if (c === '}') {
      if (templates.length && templates[templates.length - 1] === depth) {
        templates.pop();
        depth -= 1;
        i = template(i + 1);
      } else {
        depth -= 1;
        i += 1;
      }
    } else {
      i += 1;
    }
  }
  return out.join('');
}

/** Index of the bracket matching the one at `open` in masked code, or -1. */
function matching(masked: string, open: number): number {
  const pairs: Record<string, string> = { '{': '}', '(': ')', '[': ']' };
  const close = pairs[masked[open]!];
  let depth = 0;
  for (let k = open; k < masked.length; k++) {
    if (masked[k] === masked[open]) depth += 1;
    else if (masked[k] === close) {
      depth -= 1;
      if (depth === 0) return k;
    }
  }
  return -1;
}

/** Brace depth before each index of masked code. */
function depths(masked: string): Int32Array {
  const d = new Int32Array(masked.length + 1);
  let depth = 0;
  for (let k = 0; k < masked.length; k++) {
    d[k] = depth;
    if (masked[k] === '{') depth += 1;
    else if (masked[k] === '}') depth -= 1;
  }
  d[masked.length] = depth;
  return d;
}

const lineAt = (src: string, index: number): number => {
  let line = 1;
  for (let k = 0; k < index && k < src.length; k++) if (src[k] === '\n') line += 1;
  return line;
};

/** From a function's parameter list, the end of its body: a { } block, or an arrow's expression. */
function bodyEnd(masked: string, paramsOpen: number): number {
  const paramsClose = matching(masked, paramsOpen);
  if (paramsClose < 0) return -1;
  let k = paramsClose + 1;
  while (k < masked.length && masked[k] !== '{' && masked[k] !== ';' && !masked.startsWith('=>', k)) k += 1;
  if (masked.startsWith('=>', k)) {
    k += 2;
    while (k < masked.length && /\s/u.test(masked[k]!)) k += 1;
    if (masked[k] !== '{') return expressionEnd(masked, k);
  }
  if (masked[k] !== '{') return -1;
  return matching(masked, k);
}

/** An arrow's expression body ends at a ; or a line break outside any bracket, or at an unmatched closer. */
function expressionEnd(masked: string, from: number): number {
  let depth = 0;
  for (let k = from; k < masked.length; k++) {
    const c = masked[k]!;
    if ('([{'.includes(c)) depth += 1;
    else if (')]}'.includes(c)) {
      if (depth === 0) return k - 1;
      depth -= 1;
    } else if (depth === 0 && (c === ';' || c === ',' || c === '\n')) return k - 1;
  }
  return masked.length - 1;
}

const DECLARATIONS: RegExp[] = [
  // function name(  · export function · export default async function* name(
  /(?:export\s+(?:default\s+)?)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)\s*(?:<[^>]*>)?\s*\(/gu,
  // const name = async (…) =>  · const name = function(  · const name: T = x =>
  /(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=;]+)?=\s*(?:async\s+)?(?:function\b[^(]*\(|(?:<[^>]*>)?\s*\(|[A-Za-z_$][\w$]*\s*=>)/gu,
  // export default function (  (anonymous)
  /export\s+default\s+(?:async\s+)?function\s*\*?\s*()\(/gu,
];

const METHOD = /^[ \t]*(?:(?:public|private|protected|static|async|readonly|override|get|set)\s+)*\*?([A-Za-z_$][\w$]*)\s*(?:<[^>]*>)?\s*\(/gmu;
const NOT_METHODS = new Set(['if', 'for', 'while', 'switch', 'catch', 'function', 'return', 'with']);

function dedupe(units: Unit[]): Unit[] {
  const seen = new Map<string, number>();
  return units.map((u) => {
    const k = (seen.get(u.name) ?? 0) + 1;
    seen.set(u.name, k);
    return k === 1 ? u : { ...u, name: `${u.name}~${k}` };
  });
}

/** The functions of a TS/JS file, in source order. A file with none is one unit named (module). */
export function splitFunctions(src: string): Unit[] {
  const masked = maskCode(src);
  const depth = depths(masked);
  const found: Array<{ name: string; at: number; end: number }> = [];
  const add = (name: string, at: number, end: number): void => {
    if (end > at && !found.some((f) => at >= f.at && at <= f.end)) found.push({ name, at, end });
  };
  for (const re of DECLARATIONS) {
    for (const hit of masked.matchAll(re)) {
      const at = hit.index;
      if (depth[at] !== 0) continue;
      const params = hit[0].trimEnd().endsWith('(') ? at + hit[0].lastIndexOf('(') : at + hit[0].length;
      const end = hit[0].trimEnd().endsWith('=>') ? expressionOrBlock(masked, at + hit[0].length) : bodyEnd(masked, params);
      add(hit[1] || 'default', at, end);
    }
  }
  for (const cls of masked.matchAll(/(?:export\s+(?:default\s+)?)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)[^{]*\{/gu)) {
    if (depth[cls.index] !== 0) continue;
    const open = cls.index + cls[0].length - 1;
    const close = matching(masked, open);
    if (close < 0) continue;
    const body = masked.slice(open + 1, close);
    for (const meth of body.matchAll(METHOD)) {
      const at = open + 1 + meth.index;
      const name = meth[1]!;
      if (NOT_METHODS.has(name) || depth[at + meth[0].length - 1] !== depth[open]! + 1) continue;
      const end = bodyEnd(masked, at + meth[0].length - 1);
      if (end > 0) found.push({ name: `${cls[1]}.${name}`, at: at + (meth[0].length - meth[0].trimStart().length), end });
    }
  }
  found.sort((a, b) => a.at - b.at);
  if (!found.length) return [{ name: '(module)', start: 1, end: lineAt(src, src.length), text: src }];
  return dedupe(
    found.map((f) => {
      const lineStart = src.lastIndexOf('\n', f.at) + 1;
      return { name: f.name, start: lineAt(src, f.at), end: lineAt(src, f.end), text: src.slice(lineStart, f.end + 1) };
    }),
  );
}

/** After `=>`: a { } body, or an expression. */
function expressionOrBlock(masked: string, from: number): number {
  let k = from;
  while (k < masked.length && /\s/u.test(masked[k]!)) k += 1;
  return masked[k] === '{' ? matching(masked, k) : expressionEnd(masked, k);
}

const CALL = /([A-Za-z_$][\w$]*(?:\s*\??\.\s*[A-Za-z_$][\w$]*)*)\s*(?:<[^<>()]*>)?\s*\(/gu;
const NOT_CALLS = new Set(['if', 'for', 'while', 'switch', 'catch', 'function', 'return', 'typeof', 'super', 'import', 'await', 'new', 'yield', 'void', 'delete', 'in', 'of', 'with']);

/** The calls inside one function's source, in order; each unit is the line(s) the call sits on. */
export function splitCalls(fnSrc: string): Unit[] {
  const masked = maskCode(fnSrc);
  const bodyOpen = masked.indexOf('{');
  const units: Unit[] = [];
  for (const hit of masked.matchAll(CALL)) {
    if (hit.index <= bodyOpen) continue;
    const before = masked[hit.index - 1];
    if (before !== undefined && /[\w$.]/u.test(before)) continue;
    const name = hit[1]!.replace(/\s+/gu, '');
    if (NOT_CALLS.has(name.split(/\??\./u)[0]!)) continue;
    const open = hit.index + hit[0].length - 1;
    const close = matching(masked, open);
    const end = close < 0 ? open : close;
    const lineStart = fnSrc.lastIndexOf('\n', hit.index) + 1;
    const lineEnd = fnSrc.indexOf('\n', end);
    units.push({ name, start: lineAt(fnSrc, hit.index), end: lineAt(fnSrc, end), text: fnSrc.slice(lineStart, lineEnd < 0 ? fnSrc.length : lineEnd) });
  }
  return dedupe(units);
}
