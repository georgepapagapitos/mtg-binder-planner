import {
  getComboWriteGeneration,
  getOfflineDataStats,
  iterateComboPages,
  readComboIndexRow,
  readManifest,
  readStandaloneCombosVersion,
  writeComboIndexRow,
} from './db';

/**
 * The compact match index over the device-local combo dataset.
 *
 * Matching a deck or a collection against combos only needs, per combo: its
 * id, which cards it uses, its popularity, and which formats it is legal in.
 * The full rows carry names, descriptions, prerequisites and results — ~1.5 KB
 * each, 163 MB for 107k rows — and the matchers used to structured-clone all
 * of it out of IndexedDB on EVERY deck-editor load (measured 2026-09-09 on the
 * dev account: 22 `getAll` pages per view, 200–500 MB heap, 3–36 s of long
 * tasks depending on the CPU). This index is those four facts as typed
 * arrays with card oracle ids interned to integers: ~5 MB for the whole
 * dataset, read as ONE meta row, kept in memory for the session, scanned in
 * milliseconds. The matcher then hydrates only the rows it will show.
 *
 * Built once per dataset version — at the end of an import (in the import
 * worker, off the main thread) or lazily on first use if a client upgraded
 * with rows already cached — and validated against the dataset version, the
 * store's row count and this process's write generation, so a stale copy is
 * never served.
 */
export const COMBO_FORMATS = [
  'commander',
  'brawl',
  'standard',
  'pauper',
  'modern',
  'pioneer',
  'legacy',
  'vintage',
  'oathbreaker',
  'predh',
  'premodern',
  'alchemy',
  'standardBrawl',
  'competitiveBrawl',
  'pauperCommander',
  'pauperCommanderMain',
] as const;

export interface ComboIndex {
  /** Dataset version the index was built from ('' when the store is unstamped). */
  version: string;
  /** Combos in the index; equals the store's row count at build time. */
  count: number;
  /** Combo id per slot, in store key order (the order the matchers always scanned). */
  ids: string[];
  /** Interned card oracle ids; `cards` holds indexes into this. */
  cardIds: string[];
  /** Slot i's cards are `cards[offsets[i] .. offsets[i + 1])`. */
  offsets: Uint32Array;
  cards: Uint32Array;
  popularity: Float64Array;
  /** Bit f set ⇔ legal in COMBO_FORMATS[f]. */
  legal: Uint16Array;
}

export interface LoadedComboIndex {
  index: ComboIndex;
  /** oracle id → interned card number. */
  lookup: Map<string, number>;
}

export function formatBit(format: string): number {
  const f = (COMBO_FORMATS as readonly string[]).indexOf(format);
  return f < 0 ? 0 : 1 << f;
}

/** One pass over the store. Used by the importer (post-import) and lazily here. */
export async function buildComboIndex(version: string): Promise<ComboIndex> {
  const ids: string[] = [];
  const cardIds: string[] = [];
  const intern = new Map<string, number>();
  const offsets: number[] = [0];
  const cards: number[] = [];
  const popularity: number[] = [];
  const legal: number[] = [];
  for await (const page of iterateComboPages()) {
    for (const combo of page) {
      ids.push(combo.id);
      for (const card of combo.cards) {
        let n = intern.get(card.oracleId);
        if (n === undefined) {
          n = cardIds.length;
          cardIds.push(card.oracleId);
          intern.set(card.oracleId, n);
        }
        cards.push(n);
      }
      offsets.push(cards.length);
      popularity.push(combo.popularity);
      let bits = 0;
      for (let f = 0; f < COMBO_FORMATS.length; f++) {
        if (combo.legalities[COMBO_FORMATS[f]] === 'legal') bits |= 1 << f;
      }
      legal.push(bits);
    }
  }
  return {
    version,
    count: ids.length,
    ids,
    cardIds,
    offsets: Uint32Array.from(offsets),
    cards: Uint32Array.from(cards),
    popularity: Float64Array.from(popularity),
    legal: Uint16Array.from(legal),
  };
}

/** Build from the current store and persist — the importer's last step. */
export async function rebuildComboIndex(version: string): Promise<ComboIndex> {
  const index = await buildComboIndex(version);
  await writeComboIndexRow(index);
  return index;
}

let memo: { loaded: LoadedComboIndex; generation: number } | null = null;

/** Test hook — drop the per-session copy. */
export function resetComboIndexForTests(): void {
  memo = null;
}

async function currentVersion(): Promise<string> {
  return (await readStandaloneCombosVersion()) ?? (await readManifest())?.combosVersion ?? '';
}

/**
 * The index for the dataset currently in the store: the session copy when it
 * is still valid, else the persisted row, else a fresh build (persisted for
 * next time). Validity = same dataset version, same row count, no combo write
 * in this process since it was loaded.
 */
export async function getComboIndex(): Promise<LoadedComboIndex> {
  const generation = getComboWriteGeneration();
  const [version, { comboCount }] = await Promise.all([currentVersion(), getOfflineDataStats()]);
  const fresh = (i: ComboIndex) => i.version === version && i.count === comboCount;
  if (memo && memo.generation === generation && fresh(memo.loaded.index)) return memo.loaded;
  let index = await readComboIndexRow<ComboIndex>();
  if (!index || !fresh(index)) index = await rebuildComboIndex(version);
  const lookup = new Map<string, number>();
  index.cardIds.forEach((id, n) => lookup.set(id, n));
  memo = { loaded: { index, lookup }, generation };
  return memo.loaded;
}
