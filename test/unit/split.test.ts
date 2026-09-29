// The TS/JS splitter: functions of a file, calls of a function; strings, comments, templates and regexes can't fool it.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { maskCode, splitCalls, splitFunctions, SPLITTABLE } from '../../src/evidence/split.ts';

const SRC = readFileSync('test/fixtures/code/handlers.ts', 'utf8');

describe('splitFunctions', () => {
  it('finds declarations, arrows, class methods and the default export, with 1-based line ranges', () => {
    expect(splitFunctions(SRC).map((u) => [u.name, u.start, u.end])).toEqual([
      ['findUser', 5, 9],
      ['getOrder', 11, 15],
      ['double', 17, 17],
      ['helper', 19, 21],
      ['OrderService.constructor', 25, 25],
      ['OrderService.listOrders', 26, 29],
      ['OrderService.create', 30, 30],
      ['default', 33, 35],
    ]);
  });

  // Fix #7: a named function nested inside another (a route handler registered from inside a setup
  // function, a helper closed over by an IIFE) is its own unit, exactly like a class method already was —
  // only its start position dedupes against a genuine re-match, never mere nesting. [C-141]
  it('finds named functions nested inside another function or an IIFE, not just top-level ones', () => {
    const src = [
      'function registerRoutes(app) {',
      "  app.get('/users', function getUsers(req, res) {",
      '    res.send(users);',
      '  });',
      '}',
      '',
      '(function () {',
      '  function bootstrap() { return 1; }',
      '  bootstrap();',
      '})();',
    ].join('\n');
    expect(splitFunctions(src).map((u) => u.name)).toEqual(['registerRoutes', 'getUsers', 'bootstrap']);
  });

  it('each unit is its source text, from its first line to its closing brace', () => {
    const fu = splitFunctions(SRC).find((u) => u.name === 'findUser')!;
    expect(fu.text.startsWith('export async function findUser(')).toBe(true);
    expect(fu.text.endsWith('return db.query(sql);\n}')).toBe(true);
  });

  it('a file with no functions is one unit named (module); duplicate names get ~2', () => {
    expect(splitFunctions('const a = 1;\nconsole.log(a);\n').map((u) => u.name)).toEqual(['(module)']);
    expect(splitFunctions('function a() {}\nfunction a() {}\n').map((u) => u.name)).toEqual(['a', 'a~2']);
  });

  // R5: a named function expression on a const's own RHS was matched twice — once as the const, once again
  // as its own "function name(" declaration — double-counting one function as two units (graded, and in
  // scan, paid, twice).
  it('a named function expression assigned to a const is one unit, not two', () => {
    expect(splitFunctions('const cb = function inner(){}\n').map((u) => u.name)).toEqual(['cb']);
  });

  // R5: a const initialized by a call/member-expression chain (not a function/arrow itself) was mistaken for
  // a function whenever that chain's arguments happened to contain an arrow (here, .map's callback) — the
  // scan hunting for the arrow that would make it "a function" didn't stop at the nested call's own parens.
  it('a const initialized by a call chain (not a function/arrow itself) is never its own function unit', () => {
    expect(splitFunctions('const items = (x || []).map(fn => fn.id);\n').map((u) => u.name)).toEqual(['(module)']);
  });

  it('only TS and JS files are split', () => {
    expect(['a.ts', 'a.tsx', 'a.js', 'a.mjs', 'a.cts', 'a.py', 'a.md'].map((f) => SPLITTABLE.test(f))).toEqual([true, true, true, true, true, false, false]);
  });
});

describe('maskCode', () => {
  it('blanks strings, comments, template text and regex bodies, keeping code, ${} and newlines', () => {
    const masked = maskCode(SRC).split('\n');
    expect(masked[2]!.trim()).toBe('');
    expect(masked[3]).toBe('const RE = /           /g;');
    expect(masked[6]).toContain('${id}');
    expect(masked[6]).not.toContain('SELECT');
    expect(maskCode(SRC).split('\n')).toHaveLength(SRC.split('\n').length);
  });
});

describe('splitCalls', () => {
  it('the calls inside a function, each with its line', () => {
    const fu = splitFunctions(SRC).find((u) => u.name === 'findUser')!;
    expect(splitCalls(fu.text).map((c) => [c.name, c.start, c.text.trim()])).toEqual([['db.query', 4, 'return db.query(sql);']]);
    const lo = splitFunctions(SRC).find((u) => u.name === 'OrderService.listOrders')!;
    expect(splitCalls(lo.text).map((c) => c.name)).toEqual(['this.db.all', 'log', 'this.cache.get']);
  });

  it('a long dotted chain with no calls does not blow up: one real call still found, quickly', () => {
    const chain = Array.from({ length: 10_000 }, (_, i) => `p${String(i).padStart(5, '0')}`).join('.');
    expect(chain.length).toBeGreaterThan(60_000);
    const src = `function f() {\n  ${chain};\n  real();\n}\n`;
    const started = performance.now();
    const calls = splitCalls(src);
    const elapsed = performance.now() - started;
    expect(calls.map((c) => c.name)).toEqual(['real']);
    expect(elapsed).toBeLessThan(1000);
  });
});
