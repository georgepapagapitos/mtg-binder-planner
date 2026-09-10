import { afterEach } from 'vitest';

const open: Array<() => void> = [];

/**
 * A promise that stays pending for the whole test — the "skeleton while the
 * read is in flight" case — and settles with `value` in afterEach.
 *
 * `new Promise(() => {})` never settles at all, so every `.then` chain hanging
 * off it stays alive past the test and `vitest --detectAsyncLeaks` reports each
 * link as a leak (E272 slice 3: 26 such literals were ~50 of the 110 leaks).
 * Settling after the test is safe by construction: RTL has already unmounted
 * the component, so the continuation's `if (!cancelled)` guard makes it a no-op.
 * Pass the value the real call would resolve with so that no-op is the quiet
 * path, not the `.catch`.
 *
 * The settle hook below is registered from setup.ts (which imports this module
 * before any test file runs) so it is the outermost afterEach and runs after
 * RTL's cleanup; a test importing this module later reuses the same instance.
 */
export function pending<T = void>(value?: T): Promise<T> {
  return new Promise<T>((resolve) => {
    open.push(() => resolve(value as T));
  });
}

afterEach(() => {
  for (const settle of open.splice(0)) settle();
});
