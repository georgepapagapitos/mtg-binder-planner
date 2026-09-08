import { describe, it, expect } from 'vitest';
import { packSections } from './deck-display-rows';

const sec = (title: string, n: number) => ({ title, rows: Array.from({ length: n }, (_, i) => i) });
const names = (cols: Array<Array<{ title: string }>>) => cols.map((c) => c.map((s) => s.title));

describe('packSections', () => {
  // The real shape that motivated this: a Dimir deck at four columns.
  const deck = [
    sec('Creature', 31),
    sec('Artifact', 10),
    sec('Enchantment', 3),
    sec('Instant', 11),
    sec('Sorcery', 9),
    sec('Land', 35),
  ];

  it('gives each giant its own column and shares the small sections', () => {
    expect(names(packSections(deck, 4))).toEqual([
      ['Creature'],
      ['Artifact', 'Sorcery'],
      ['Enchantment', 'Instant'],
      ['Land'],
    ]);
  });

  it('keeps type order inside a column and orders columns by their first type', () => {
    const cols = packSections(deck, 3);
    for (const col of cols) {
      const idx = col.map((s) => deck.indexOf(s));
      expect(idx).toEqual([...idx].sort((a, b) => a - b));
    }
    const firsts = cols.map((c) => deck.indexOf(c[0]));
    expect(firsts).toEqual([...firsts].sort((a, b) => a - b));
    expect(cols.flat()).toHaveLength(deck.length);
  });

  it('balances heights instead of flowing in document order', () => {
    const heights = packSections(deck, 4).map((c) => c.reduce((h, s) => h + s.rows.length, 0));
    // Document-order flow left a column holding only Enchantment (3 rows).
    expect(Math.min(...heights)).toBeGreaterThanOrEqual(14);
    expect(Math.max(...heights)).toBeLessThanOrEqual(37);
  });

  it('one column is the plain type order', () => {
    expect(names(packSections(deck, 1))).toEqual([deck.map((s) => s.title)]);
  });

  it('never emits an empty column and handles no sections', () => {
    expect(packSections([], 4)).toEqual([]);
    expect(names(packSections([sec('Creature', 5)], 4))).toEqual([['Creature']]);
  });
});
