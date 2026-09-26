// sidewise template <verb>: a copy-editable request, never a response; each one validates on its own.
import { describe, expect, it } from 'vitest';
import { readRequestText } from '../../src/contract/read.ts';
import { VERBS } from '../../src/contract/types.ts';
import { validateRequest } from '../../src/contract/validate.ts';
import { runTemplate } from '../../src/verbs/template.ts';

describe('runTemplate', () => {
  it.each(VERBS)('%s: prints a request that validates on its own', (verb) => {
    const r = runTemplate(verb);
    expect(r.exit).toBe(0);
    const parsed = readRequestText(r.text);
    expect(parsed.ok).toBe(true);
    const v = parsed.ok && validateRequest(parsed.value, verb);
    expect(v && v.ok).toBe(true);
  });

  it('an unknown verb: a clean stop', () => {
    expect(runTemplate('nope')).toEqual({ exit: 2, text: '✖ template: "nope" is not a verb → one of view, class, change, scan, drill, loop' });
  });

  it('--parent/--from only apply to drill', () => {
    expect(runTemplate('class', { parent: 'SW-0001' })).toEqual({ exit: 2, text: '✖ template: --parent/--from only apply to drill → sidewise template class' });
  });

  it('drill needs both flags together, or neither', () => {
    expect(runTemplate('drill', { parent: 'SW-0001' }).exit).toBe(2);
    expect(runTemplate('drill', { from: 'x' }).exit).toBe(2);
  });

  it('drill with both flags: overlays parent/from, keeps the rest, still validates', () => {
    const r = runTemplate('drill', { parent: 'SW-0099', from: 'access' });
    expect(r.exit).toBe(0);
    expect(r.text).toContain('parent: SW-0099');
    expect(r.text).toContain('from: access');
    expect(r.text).toContain('call: each'); // the sample over: is untouched
    const parsed = readRequestText(r.text);
    const v = parsed.ok && validateRequest(parsed.value, 'drill');
    expect(v && v.ok).toBe(true);
  });
});
