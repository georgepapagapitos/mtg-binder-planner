// @vitest-environment node
import { describe, expect, it } from 'vitest';

/**
 * Guard for the unread-Response cleanup in `setup.ts` (E272): a fetch stub's
 * Response whose body the code under test never reads must be cancelled once
 * its test is over, or its body stream leaks a promise past the test.
 */
let unread: Response | undefined;

describe('unread Response cleanup', () => {
  it('leaves a stub response untouched during its own test', () => {
    unread = new Response('never read', { status: 404 });
    expect(unread.bodyUsed).toBe(false);
  });

  it("has cancelled the previous test's unread body by the next test", () => {
    expect(unread?.bodyUsed).toBe(true);
  });
});
