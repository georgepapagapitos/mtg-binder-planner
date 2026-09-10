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

// Flipped in afterEach: a stream whose test has ended errors on its next pull,
// so an import that outlived its test (a timeout under load) stops writing
// into the store the next test is using instead of cascading into it (E279).
let streamsLive = true;

/**
 * An NDJSON body delivered in arbitrary byte chunks — lines split anywhere.
 * Pull-based: chunks are produced only as the importer reads them.
 */
function ndjsonResponse(rows: OfflineCombo[], chunkSize: number, status = 200): Response {
  const bytes = new TextEncoder().encode(rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
  let offset = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (!streamsLive) return controller.error(new Error('test ended'));
      if (offset >= bytes.length) return controller.close();
      controller.enqueue(bytes.slice(offset, offset + chunkSize));
      offset += chunkSize;
    },
  });
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8' },
  });
}

afterEach(async () => {
  streamsLive = false;
  vi.restoreAllMocks();
  await clearOfflineData();
  streamsLive = true;
});

describe('importCombos', () => {
  it('reassembles lines split across chunk boundaries', async () => {
    const rows = [combo('a', 1), combo('b', 2), combo('c', 3)];
    // 7-byte chunks: every line straddles many reads, and most reads carry no
    // newline at all. A few rows is enough — the parser sees every boundary
    // shape; row volume only ever made this test slow (E279).
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(ndjsonResponse(rows, 7));

    const { count } = await importCombos();

    expect(count).toBe(3);
    const stored = await getAllCombos();
    expect(stored.map((c) => c.id).sort()).toEqual(['a', 'b', 'c']);
    expect(stored.find((c) => c.id === 'c')?.popularity).toBe(3);
  });

  it('writes in batches and stores every row once', async () => {
    // Past one BATCH (1000) so the mid-stream flush, the final partial flush
    // and the dedupe all run; 4 KiB chunks still land mid-line every time.
    const rows = Array.from({ length: 1_050 }, (_, i) => combo(`c${i}`, i));
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(ndjsonResponse(rows, 4096));
    const seen: number[] = [];

    const { count } = await importCombos((n) => seen.push(n));

    expect(count).toBe(rows.length);
    const stored = await getAllCombos();
    expect(stored.length).toBe(rows.length);
    expect(new Set(stored.map((c) => c.id)).size).toBe(rows.length);
    expect(stored.find((c) => c.id === 'c1049')?.popularity).toBe(1049);
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
