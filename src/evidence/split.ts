/**
 * A small, dependency-free splitter for TypeScript and JavaScript: a file into its functions (scan's
 * `function: each`), and a function into its calls (drill's `call: each`). It is a lexer, not a parser:
 * strings, comments, template text and regex literals are blanked out first, so braces and keywords inside
 * them can't fool the brace matching. Found: function declarations, const/let/var arrow and function
 * expressions, class methods (Class.method) and export default functions — at ANY nesting depth (a named
 * route handler registered from inside a setup function, or a helper closed over by an IIFE, is its own unit
 * next to its container, same as a class method always was). Known limits: an object type as a
 * return annotation (`(): { a: 1 } {`) is taken as the body; an anonymous function/arrow passed inline as a
 * call argument with no name of its own (`app.get('/x', (req, res) => {...})`) is never its own unit — only
 * a NAMED one (`app.get('/x', function handler(req, res) {...})`) is.
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

/** From a function's parameter list, the end of its body: a { } block, or an arrow's expression. Scans past a
 *  return-type annotation looking for the first depth-0 `{`, `;` or `=>` — depth-0 so a nested call right
 *  after the parameter list (`(x || []).map(fn => ...)`) never has ITS OWN `=>` mistaken for this one's: a
 *  `(` or `[` bumps depth, its closer drops it, and only a depth-0 hit counts. */
function bodyEnd(masked: string, paramsOpen: number): number {
  const paramsClose = matching(masked, paramsOpen);
  if (paramsClose < 0) return -1;
  let k = paramsClose + 1;
  let depth = 0;
  while (k < masked.length && !(depth === 0 && (masked[k] === '{' || masked[k] === ';' || masked.startsWith('=>', k)))) {
    if (masked[k] === '(' || masked[k] === '[') depth += 1;
    else if (masked[k] === ')' || masked[k] === ']') depth -= 1;
    k += 1;
  }
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

/** When a const/let/var's initializer is itself a named `function name(...)` expression, DECLARATIONS[0]
 *  below finds that same "function name(" a second time as though it were its own top-level declaration — it's
 *  the right-hand side of this assignment, not a second unit (`const cb = function inner(){}` was producing
 *  two units, cb and inner, for one function, graded — and in scan, paid — twice). Anchored on `=\s*(?:async
 *  \s+)?function\b` within each const/let/var match's own text, so a variable name that merely contains the
 *  substring "function" (`myFunction`) can never be mistaken for this. */
function namedFunctionExprStarts(masked: string): Set<number> {
  const starts = new Set<number>();
  for (const hit of masked.matchAll(DECLARATIONS[1]!)) {
    const m = /=\s*(?:async\s+)?function\b/u.exec(hit[0]);
    if (m) starts.add(hit.index + m.index + m[0].lastIndexOf('function'));
  }
  return starts;
}

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
  const skipStarts = namedFunctionExprStarts(masked); // const/let/var's own named-function-expression RHS
  const found: Array<{ name: string; at: number; end: number }> = [];
  // A nested declaration (a route handler defined inside a setup function, a helper closed over by another
  // function, ...) is a real unit too, same as a class method already is — only an exact re-match at the
  // same start is a duplicate.
  const add = (name: string, at: number, end: number): void => {
    if (end > at && !found.some((f) => f.at === at)) found.push({ name, at, end });
  };
  for (const re of DECLARATIONS) {
    for (const hit of masked.matchAll(re)) {
      const at = hit.index;
      if (re === DECLARATIONS[0] && skipStarts.has(at)) continue; // already covered by its const/let/var
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

const NOT_CALLS = new Set(['if', 'for', 'while', 'switch', 'catch', 'function', 'return', 'typeof', 'super', 'import', 'await', 'new', 'yield', 'void', 'delete', 'in', 'of', 'with']);

const isIdentStart = (c: string | undefined): boolean => c !== undefined && /[A-Za-z_$]/u.test(c);
const isIdentPart = (c: string | undefined): boolean => c !== undefined && /[\w$]/u.test(c);
const isSpace = (c: string | undefined): boolean => c !== undefined && /\s/u.test(c);

/** End index (exclusive) of the identifier starting at `at` (masked[at] must be an identifier-start char). */
function identEnd(masked: string, at: number): number {
  let k = at + 1;
  while (isIdentPart(masked[k])) k += 1;
  return k;
}

/** First index at or after `at` that isn't whitespace. */
function skipSpace(masked: string, at: number): number {
  let k = at;
  while (isSpace(masked[k])) k += 1;
  return k;
}

/** If a clean `<...>` generic-argument list (no nested <, >, ( or )) starts at `at`, the index right after
 * its closing `>`; else -1. Mirrors the old CALL regex's `(?:<[^<>()]*>)?`. */
function genericsEnd(masked: string, at: number): number {
  if (masked[at] !== '<') return -1;
  let k = at + 1;
  while (k < masked.length && !'<>()'.includes(masked[k]!)) k += 1;
  return masked[k] === '>' ? k + 1 : -1;
}

/**
 * From a chain start, the longest `IDENT(.IDENT)*` prefix immediately followed (past optional whitespace
 * and an optional `<...>` generic list) by `(`, or null if no prefix qualifies. A single forward pass
 * builds the segment boundaries once, then the (much shorter) backtrack over those boundaries checks for
 * a trailing call — replacing a regex whose equivalent backtracking was over characters, not segments,
 * and went quadratic on a long call-less dotted chain.
 */
function chainCall(masked: string, start: number): { nameEnd: number; openParen: number } | null {
  const ends: number[] = [identEnd(masked, start)];
  let k = ends[0]!;
  for (;;) {
    const j = skipSpace(masked, k);
    let dot = -1;
    if (masked[j] === '?' && masked[j + 1] === '.') dot = j + 2;
    else if (masked[j] === '.') dot = j + 1;
    if (dot < 0) break;
    const afterDot = skipSpace(masked, dot);
    if (!isIdentStart(masked[afterDot])) break;
    k = identEnd(masked, afterDot);
    ends.push(k);
  }
  for (let idx = ends.length - 1; idx >= 0; idx--) {
    const end = ends[idx]!;
    let j = skipSpace(masked, end);
    const afterGenerics = genericsEnd(masked, j);
    if (afterGenerics >= 0) j = skipSpace(masked, afterGenerics);
    if (masked[j] === '(') return { nameEnd: end, openParen: j };
  }
  return null;
}

/** The calls inside one function's source, in order; each unit is the line(s) the call sits on. */
export function splitCalls(fnSrc: string): Unit[] {
  const masked = maskCode(fnSrc);
  const bodyOpen = masked.indexOf('{');
  const units: Unit[] = [];
  const n = masked.length;
  let i = 0;
  while (i < n) {
    if (!isIdentStart(masked[i])) {
      i += 1;
      continue;
    }
    const prev = i > 0 ? masked[i - 1] : undefined;
    if (prev !== undefined && /[\w$.]/u.test(prev)) {
      // Not a legal chain start (mid-identifier, or right after a dot): skip just this identifier. Every
      // interior identifier of a chain is reached this way, in one pass, instead of being re-tried as its
      // own chain start.
      i = identEnd(masked, i);
      continue;
    }
    const hit = chainCall(masked, i);
    if (!hit) {
      i = identEnd(masked, i);
      continue;
    }
    if (i > bodyOpen) {
      const name = masked.slice(i, hit.nameEnd).replace(/\s+/gu, '');
      if (!NOT_CALLS.has(name.split(/\??\./u)[0]!)) {
        const close = matching(masked, hit.openParen);
        const end = close < 0 ? hit.openParen : close;
        const lineStart = fnSrc.lastIndexOf('\n', i) + 1;
        const lineEnd = fnSrc.indexOf('\n', end);
        units.push({ name, start: lineAt(fnSrc, i), end: lineAt(fnSrc, end), text: fnSrc.slice(lineStart, lineEnd < 0 ? fnSrc.length : lineEnd) });
      }
    }
    i = hit.openParen + 1;
  }
  return dedupe(units);
}
