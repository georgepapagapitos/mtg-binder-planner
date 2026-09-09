import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { importCombos } from './combos-import';
import { clearOfflineData, getAllCombos, replaceCombos } from './db';
import type { OfflineCombo } from './types';

function combo(id: string, popularity = 0): OfflineCombo {
  return {
    id,
    identity: 'W',
    produces: ['Infinite mana'],
    prerequisites: null,
    description: null,
    manaNeeded: null,
    popularity,
    legalities: { commander: 'legal' },
    cardCount: 1,
    bracket: null,
    cards: [{ oracleId: `o-${id}`, cardName: `Card ${id}`, quantity: 1, position: 0 }],
  };
}

/** An NDJSON body delivered in arbitrary byte chunks — lines split anywhere. */
function ndjsonResponse(rows: OfflineCombo[], chunkSize: number, status = 200): Response {
  const bytes = new TextEncoder().encode(rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (let i = 0; i < bytes.length; i += chunkSize) {
        controller.enqueue(bytes.slice(i, i + chunkSize));
      }
      controller.close();
    },
  });
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8' },
  });
}

afterEach(async () => {
  vi.restoreAllMocks();
  await clearOfflineData();
});

describe('importCombos', () => {
  it('streams NDJSON split across chunk boundaries and stores every row once', async () => {
    const rows = Array.from({ length: 2_345 }, (_, i) => combo(`c${i}`, i));
    // 7-byte chunks guarantee lines (and multi-byte-free JSON) straddle reads.
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(ndjsonResponse(rows, 7));
    const seen: number[] = [];

    const { count } = await importCombos((n) => seen.push(n));

    expect(count).toBe(rows.length);
    const stored = await getAllCombos();
    expect(stored.length).toBe(rows.length);
    expect(new Set(stored.map((c) => c.id)).size).toBe(rows.length);
    expect(stored.find((c) => c.id === 'c2344')?.popularity).toBe(2344);
    expect(seen.at(-1)).toBeGreaterThan(0); // progress reported in bytes
  });

  it('asks for NDJSON but accepts the legacy JSON array from an older server', async () => {
    const rows = [combo('a'), combo('b')];
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(rows), {
        status: 200,
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
      })
    );

    const { count } = await importCombos();

    expect(count).toBe(2);
    expect((await getAllCombos()).map((c) => c.id).sort()).toEqual(['a', 'b']);
    const accept = (fetchSpy.mock.calls[0][1]?.headers as Record<string, string>).Accept;
    expect(accept).toMatch(/application\/x-ndjson/);
  });

  it('upserts in place and prunes rows the new dataset dropped, only at the end', async () => {
    await replaceCombos([combo('old-1'), combo('keep', 1)]);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      ndjsonResponse([combo('keep', 99), combo('new-1')], 64)
    );

    await importCombos();

    const ids = (await getAllCombos()).map((c) => c.id).sort();
    expect(ids).toEqual(['keep', 'new-1']);
    expect((await getAllCombos()).find((c) => c.id === 'keep')?.popularity).toBe(99);
  });

  it('leaves the previous dataset in place when the stream dies mid-way', async () => {
    await replaceCombos([combo('old-1'), combo('old-2')]);
    const good = JSON.stringify(combo('new-1')) + '\n';
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(good));
        controller.error(new TypeError('network down'));
      },
    });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(body, { status: 200, headers: { 'Content-Type': 'application/x-ndjson' } })
    );

    await expect(importCombos()).rejects.toThrow();

    // Nothing pruned (that only happens after a complete stream); old rows
    // still serve, so the caller can keep its stale-cache promise.
    const ids = (await getAllCombos()).map((c) => c.id).sort();
    expect(ids).toEqual(expect.arrayContaining(['old-1', 'old-2']));
  });

  it('throws an authored error on a non-OK response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: 'preparing' }), { status: 503 })
    );
    await expect(importCombos()).rejects.toThrow(/couldn't download the combo data/i);
  });
});
