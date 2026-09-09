import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  COMBO_FORMATS,
  buildComboIndex,
  formatBit,
  getComboIndex,
  resetComboIndexForTests,
} from './combo-index';
import * as db from './db';
import { matchCombosLocal } from './match-combos';
import type { OfflineCombo } from './types';

function combo(
  id: string,
  cardIds: string[],
  opts: { popularity?: number; legalities?: Record<string, string> } = {}
): OfflineCombo {
  return {
    id,
    identity: 'WU',
    produces: ['mana'],
    prerequisites: null,
    description: 'd',
    manaNeeded: null,
    popularity: opts.popularity ?? 0,
    legalities: opts.legalities ?? { commander: 'legal' },
    cardCount: cardIds.length,
    bracket: null,
    cards: cardIds.map((oracleId, i) => ({
      oracleId,
      cardName: `Card-${oracleId}`,
      quantity: 1,
      position: i,
    })),
  };
}

describe('combo index', () => {
  beforeEach(async () => {
    await db.clearOfflineData();
    resetComboIndexForTests();
  });
  afterEach(async () => {
    await db.clearOfflineData();
    resetComboIndexForTests();
    vi.restoreAllMocks();
  });

  it('interns cards, keeps store order, and encodes legality as bits', async () => {
    await db.replaceCombos([
      combo('a', ['x', 'y'], {
        popularity: 5,
        legalities: { commander: 'legal', modern: 'legal' },
      }),
      combo('b', ['y', 'z'], {
        popularity: 9,
        legalities: { pauper: 'legal', commander: 'banned' },
      }),
    ]);
    const idx = await buildComboIndex('v1');
    expect(idx.version).toBe('v1');
    expect(idx.count).toBe(2);
    expect(idx.ids).toEqual(['a', 'b']);
    expect(idx.cardIds).toEqual(['x', 'y', 'z']);
    expect(Array.from(idx.offsets)).toEqual([0, 2, 4]);
    expect(Array.from(idx.cards)).toEqual([0, 1, 1, 2]);
    expect(Array.from(idx.popularity)).toEqual([5, 9]);
    expect(idx.legal[0] & formatBit('commander')).toBeTruthy();
    expect(idx.legal[0] & formatBit('modern')).toBeTruthy();
    expect(idx.legal[0] & formatBit('pauper')).toBe(0);
    expect(idx.legal[1] & formatBit('commander')).toBe(0);
    expect(idx.legal[1] & formatBit('pauper')).toBeTruthy();
    expect(COMBO_FORMATS.length).toBeLessThanOrEqual(16);
  });

  it('persists on first use, serves the session copy after, and rebuilds when the store changes', async () => {
    await db.replaceCombos([combo('a', ['x', 'y'])]);
    const build = vi.spyOn(db, 'iterateComboPages');
    const first = await getComboIndex();
    expect(first.index.count).toBe(1);
    expect(build).toHaveBeenCalledTimes(1);
    expect(await db.readComboIndexRow()).not.toBeNull();

    const again = await getComboIndex();
    expect(again).toBe(first);
    expect(build).toHaveBeenCalledTimes(1);

    await db.appendCombos([combo('b', ['z'])]);
    const rebuilt = await getComboIndex();
    expect(rebuilt.index.count).toBe(2);
    expect(rebuilt.index.ids).toEqual(['a', 'b']);
    expect(build).toHaveBeenCalledTimes(2);
  });

  it('the matcher hydrates only the rows it returns, and answers an unknown format with nothing', async () => {
    await db.replaceCombos([
      combo('in', ['x', 'y'], { popularity: 1 }),
      combo('near', ['x', 'q'], { popularity: 2 }),
      combo('far', ['p', 'q']),
    ]);
    const get = vi.spyOn(db, 'getCombosByIds');
    const res = await matchCombosLocal({ ownedOracleIds: [], deckOracleIds: ['x', 'y'] });
    expect(res.inDeck.map((m) => m.combo.id)).toEqual(['in']);
    expect(res.oneAway.map((m) => m.combo.id)).toEqual(['near']);
    expect(res.oneAway[0].missingOracleIds).toEqual(['q']);
    expect(res.inDeck[0].combo.description).toBe('d');
    expect(get).toHaveBeenCalledWith(['in', 'near']);

    const none = await matchCombosLocal({ ownedOracleIds: ['x', 'y'], format: 'not-a-format' });
    expect(none).toEqual({
      inDeck: [],
      oneAway: [],
      almostInCollection: [],
      almostInCollectionTotal: 0,
    });
  });
});
