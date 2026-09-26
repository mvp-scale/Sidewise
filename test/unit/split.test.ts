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

  it('each unit is its source text, from its first line to its closing brace', () => {
    const fu = splitFunctions(SRC).find((u) => u.name === 'findUser')!;
    expect(fu.text.startsWith('export async function findUser(')).toBe(true);
    expect(fu.text.endsWith('return db.query(sql);\n}')).toBe(true);
  });

  it('a file with no functions is one unit named (module); duplicate names get ~2', () => {
    expect(splitFunctions('const a = 1;\nconsole.log(a);\n').map((u) => u.name)).toEqual(['(module)']);
    expect(splitFunctions('function a() {}\nfunction a() {}\n').map((u) => u.name)).toEqual(['a', 'a~2']);
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
});
