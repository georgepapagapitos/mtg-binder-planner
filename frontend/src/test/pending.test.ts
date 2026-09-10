import { describe, expect, it } from 'vitest';
import { pending } from './pending';

let seen: unknown = 'unset';

describe('pending()', () => {
  it('stays pending for the whole test', async () => {
    const p = pending('later');
    void p.then((v) => (seen = v));
    await new Promise((r) => setImmediate(r));
    expect(seen).toBe('unset');
  });

  it('settled with its value once the previous test tore down', () => {
    expect(seen).toBe('later');
  });
});
