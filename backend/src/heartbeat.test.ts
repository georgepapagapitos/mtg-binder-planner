import { afterEach, describe, expect, it, vi } from 'vitest';
import { probeAndPing } from './heartbeat';

vi.mock('./logger', () => ({ logger: { error: vi.fn(), info: vi.fn() } }));

const PING = 'https://hc-ping.com/abc';
const ORIGIN = 'https://example.test';

function stubFetch(health: () => Promise<Response>) {
  const calls: string[] = [];
  vi.stubGlobal('fetch', async (url: string) => {
    calls.push(url);
    if (url === `${ORIGIN}/health`) return health();
    return new Response('OK');
  });
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

describe('probeAndPing', () => {
  it('pings the success URL when the public /health answers ok:true', async () => {
    const calls = stubFetch(async () => Response.json({ ok: true }));
    await expect(probeAndPing(PING, ORIGIN)).resolves.toBe(true);
    expect(calls).toEqual([`${ORIGIN}/health`, PING]);
  });

  it('pings /fail on a non-2xx, a body without ok:true, or a network error', async () => {
    for (const health of [
      async () => new Response('down', { status: 503 }),
      async () => Response.json({ ok: false }),
      async () => {
        throw new Error('ENOTFOUND');
      },
    ]) {
      const calls = stubFetch(health);
      await expect(probeAndPing(PING, ORIGIN)).resolves.toBe(false);
      expect(calls).toEqual([`${ORIGIN}/health`, `${PING}/fail`]);
    }
  });

  it('survives the ping delivery itself failing', async () => {
    vi.stubGlobal('fetch', async (url: string) => {
      if (url === `${ORIGIN}/health`) return Response.json({ ok: true });
      throw new Error('hc-ping unreachable');
    });
    await expect(probeAndPing(PING, ORIGIN)).resolves.toBe(true);
  });
});
