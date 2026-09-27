/** A fixture module with a header comment; check-hygiene.test.ts exercises findMissingHeaders/findUnusedExports against it. */
import { helperUsed } from './unused-export.ts';

export function theUsedOne(): string {
  return helperUsed();
}
