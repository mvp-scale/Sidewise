// Layers and items: both nesting forms, different child layers per item, ids joined by "/", blanks, the cap.
import { describe, expect, it } from 'vitest';
import { blanksIn, checkOver, expand, fillBlanks, mapLayers, parseItem, type Item } from '../../src/contract/layers.ts';

const LOOP = {
  part: [{ name: 'gateway', story: ['guest checkout', 'saved cards'] }, { name: 'payments', story: ['refunds', 'retries', 'partial capture'] }, 'ledger'],
};
const ids = (items: Item[]): string[] => items.map((i) => i.id);

describe('parseItem', () => {
  it('reads the three forms and says what is wrong with anything else', () => {
    expect(parseItem('ledger')).toEqual({ name: 'ledger', children: {} });
    expect(parseItem({ name: 'api', story: ['a'] })).toEqual({ name: 'api', children: { story: ['a'] } });
    expect(parseItem({ api: { story: ['a'] } })).toEqual({ name: 'api', children: { story: ['a'] } });
    expect(parseItem({ storage: null })).toEqual({ name: 'storage', children: {} });
    expect(parseItem({ api: ['a'] })).toEqual({ problem: '"api" has a value but no layer name → write "- name: api" and "<layer>: [...]"' });
    expect(parseItem({ a: 1, b: 2 })).toEqual({ problem: 'an item with several keys needs name: → write "- name: <item>" plus its child layers' });
    expect(parseItem(null)).toEqual({ problem: 'an item is empty or not text → write its name' });
  });
});

describe('mapLayers', () => {
  it('finds nested layers in order and who sits above whom', () => {
    const m = mapLayers({ part: [{ name: 'api', story: ['a'] }, { 'billing-engine': { feature: ['b'] } }, 'storage'] });
    expect(m.layers).toEqual(['part', 'story', 'feature']);
    expect([...m.ancestors.get('feature')!]).toEqual(['part']);
    expect(m.problems).toEqual([]);
  });

  it('a chain of top-level keys links each to the one before', () => {
    const m = mapLayers({ file: 'src/*.ts', function: 'each' });
    expect(m.chain).toEqual(['file', 'function']);
    expect([...m.ancestors.get('function')!]).toEqual(['file']);
  });

  it('too many layers, or a layer both nested and at the top', () => {
    expect(mapLayers({ a: [{ name: 'x', b: [{ name: 'y', c: [{ name: 'z', d: [{ name: 'w', e: ['v'] }] }] }] }] }).problems).toEqual(['✖ side.over: 5 layers → at most 4; split the request']);
    expect(mapLayers({ part: [{ name: 'x', story: ['a'] }], story: 'each' }).problems).toEqual(['✖ side.over.story: used at the top and inside "x" → pick one']);
  });
});

describe('checkOver', () => {
  it('accepts the contract loop, scan and drill shapes', () => {
    expect(checkOver(LOOP, 'none', 10)).toEqual([]);
    expect(checkOver({ file: 'src/handlers/*.ts', function: 'each' }, 'scan', 10)).toEqual([]);
    expect(checkOver({ call: 'each' }, 'each-only', 10)).toEqual([]);
    expect(checkOver({ step: ['validate request', 'compute amount'] }, 'each-only', 10)).toEqual([]);
  });

  it('item names can\'t hold / or #, and siblings are unique', () => {
    expect(checkOver({ part: ['a/b', 'c#1', 'c', 'c'] }, 'none', 10)).toEqual([
      '✖ side.over.part: item "a/b" → names are 1–80 characters, without "/" or "#"',
      '✖ side.over.part: item "c#1" → names are 1–80 characters, without "/" or "#"',
      '✖ side.over.part: "c" twice under the top → give each item its own name',
    ]);
  });

  it('string layers: loop has none; scan starts with a pattern, then each; drill uses each', () => {
    expect(checkOver({ part: 'src/*.ts' }, 'none', 10)).toEqual(['✖ side.over.part: loop sweeps ideas you list → write the items as a list; use scan for files']);
    expect(checkOver({ function: 'each' }, 'scan', 10)).toEqual(['✖ side.over.function: scan needs a file pattern first → e.g. function: src/**/*.ts']);
    expect(checkOver({ file: 'src/*.ts', function: 'all' }, 'scan', 10)).toEqual(['✖ side.over.function: "all" → use each (we split the layer above)']);
    expect(checkOver({ file: '../other/*.ts', function: 'each' }, 'scan', 10)).toEqual(['✖ side.over.file: "../other/*.ts" is outside the project → use a pattern inside it']);
    expect(checkOver({ part: ['a'], story: ['b'] }, 'none', 10)).toEqual(['✖ side.over.story: a list at the top applies to nothing → nest it under its parent items (- name: x, story: [...]), or use each']);
  });

  it('more listed items in a layer than the depth allows', () => {
    expect(checkOver({ part: Array.from({ length: 11 }, (_, i) => `p${i}`) }, 'none', 10)).toEqual([
      '✖ side.over.part: 11 items → at most 10 per layer at this depth; raise depth or split the request',
    ]);
    expect(checkOver({ part: [{ name: 'a', story: ['1', '2', '3'] }, { name: 'b', story: ['4', '5', '6'] }] }, 'none', 5)).toEqual([
      '✖ side.over.story: 6 items → at most 5 per layer at this depth; raise depth or split the request',
    ]);
  });
});

describe('expand', () => {
  it('the contract loop: 3 parts + 5 stories = 8 items, parents first, ids joined by / [C-086]', () => {
    const { layers, items } = expand(LOOP);
    expect(layers).toEqual(['part', 'story']);
    expect(ids(items)).toEqual(['gateway', 'gateway/guest checkout', 'gateway/saved cards', 'payments', 'payments/refunds', 'payments/retries', 'payments/partial capture', 'ledger']);
    expect(items[6]).toEqual({ id: 'payments/partial capture', layer: 'story', name: 'partial capture', parent: 'payments', fill: { part: 'payments', story: 'partial capture' }, text: 'partial capture' });
  });

  it('a chain resolves each code layer under every item of the layer before', () => {
    const calls: string[] = [];
    const { items } = expand(
      { file: 'src/*.ts', function: 'each' },
      {
        resolve: (layer, spec, parent) => {
          calls.push(`${layer}:${spec}:${parent?.id ?? '-'}`);
          return layer === 'file' ? [{ name: 'src/a.ts', text: 'A' }, { name: 'src/b.ts', text: 'B' }] : [{ name: 'f', text: 'fn' }];
        },
      },
    );
    expect(ids(items)).toEqual(['src/a.ts', 'src/a.ts/f', 'src/b.ts', 'src/b.ts/f']);
    expect(calls).toEqual(['file:src/*.ts:-', 'function:each:src/a.ts', 'function:each:src/b.ts']);
  });

  it('drill: new layers hang under the parent run\'s item and inherit its fill', () => {
    const root: Item = { id: 'billing-engine/refunds', layer: 'story', name: 'refunds', parent: 'billing-engine', fill: { part: 'billing-engine', story: 'refunds' }, text: 'refunds' };
    const { items } = expand({ step: ['validate request', 'post ledger entry'] }, { root });
    expect(items.map((i) => [i.id, i.parent, i.fill])).toEqual([
      ['billing-engine/refunds/validate request', 'billing-engine/refunds', { part: 'billing-engine', story: 'refunds', step: 'validate request' }],
      ['billing-engine/refunds/post ledger entry', 'billing-engine/refunds', { part: 'billing-engine', story: 'refunds', step: 'post ledger entry' }],
    ]);
  });
});

describe('blanks', () => {
  it('finds and fills {layer} blanks; an unknown blank stays as written', () => {
    expect(blanksIn('Is "{story}" testable against {part}?')).toEqual(['story', 'part']);
    expect(fillBlanks('Is "{story}" testable against {part}?', { part: 'payments', story: 'refunds' })).toBe('Is "refunds" testable against payments?');
    expect(fillBlanks('Does {step} work?', {})).toBe('Does {step} work?');
  });
});
