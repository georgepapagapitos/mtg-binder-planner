import { describe, expect, it } from 'vitest';
import {
  computeCoverage,
  compareCoverage,
  computeReasonLine,
  OWNED_POOL_THIN_RATIO,
} from './commander-coverage';

const page = (names: string[], type = 'Creature') =>
  names.map((name) => ({ name, primary_type: type }));

const owned = (names: string[]) => new Set(names.map((n) => n.toLowerCase()));

describe('computeCoverage', () => {
  it('counts owned, identity-fitting nonland page cards against 99 minus lands', () => {
    const cards = page(['Sol Ring', 'Swords to Plowshares', 'Counterspell', 'Rhystic Study']);
    const identity = new Map<string, string[]>([
      ['sol ring', []],
      ['swords to plowshares', ['W']],
      ['counterspell', ['U']],
      ['rhystic study', ['U']],
    ]);
    const c = computeCoverage(
      cards,
      owned(['Sol Ring', 'Swords to Plowshares', 'Counterspell']),
      identity,
      ['W']
    );
    // Counterspell is owned but off-identity for a mono-W deck.
    expect(c.owned).toBe(2);
    expect(c.slots).toBe(62);
    expect(c.comfortable).toBe(Math.ceil(62 * OWNED_POOL_THIN_RATIO));
    expect(c.available).toBe(true);
  });

  it('treats a name with no identity data as fitting, like the generator', () => {
    const c = computeCoverage(page(['Mystery Card']), owned(['Mystery Card']), new Map(), ['G']);
    expect(c.owned).toBe(1);
  });

  it('never counts a land entry, even if one leaks into the nonland list', () => {
    const cards = [
      { name: 'Command Tower', primary_type: 'Land' },
      { name: 'Valakut Awakening // Valakut Stoneforge', primary_type: 'Instant' },
    ];
    const c = computeCoverage(
      cards,
      owned(['Command Tower', 'Valakut Awakening // Valakut Stoneforge']),
      new Map(),
      ['R']
    );
    expect(c.owned).toBe(1);
  });

  it('is thin below 1.2x the spell slots and says so in the line (Sram 59)', () => {
    const cards = page(Array.from({ length: 200 }, (_, i) => `Card ${i}`));
    const c = computeCoverage(cards, owned(cards.slice(0, 59).map((x) => x.name)), new Map(), [
      'W',
    ]);
    expect(c.thin).toBe(true);
    expect(c.line).toBe(
      "59 owned cards for 62 slots, a few will come from outside this commander's data"
    );
  });

  it('has no gaps from the comfortable line up (Ezuri 93)', () => {
    const cards = page(Array.from({ length: 200 }, (_, i) => `Card ${i}`));
    const c = computeCoverage(cards, owned(cards.slice(0, 93).map((x) => x.name)), new Map(), [
      'G',
    ]);
    expect(c.thin).toBe(false);
    expect(c.line).toBe('93 owned cards for 62 slots, no gaps');
    const edge = computeCoverage(cards, owned(cards.slice(0, 75).map((x) => x.name)), new Map(), [
      'G',
    ]);
    expect(edge.thin).toBe(false);
    const below = computeCoverage(cards, owned(cards.slice(0, 74).map((x) => x.name)), new Map(), [
      'G',
    ]);
    expect(below.thin).toBe(true);
  });

  it('scales the slots with land count and deck size', () => {
    const c = computeCoverage(page(['A']), owned([]), new Map(), ['B'], 35, 99);
    expect(c.slots).toBe(64);
    const pdh = computeCoverage(page(['A']), owned([]), new Map(), ['B'], 30, 60);
    expect(pdh.slots).toBe(30);
  });

  it('is unavailable on an empty page and never reads as 0 owned of N', () => {
    const c = computeCoverage([], owned(['Sol Ring']), new Map(), ['W']);
    expect(c.available).toBe(false);
    expect(c.line).toBe('No EDHREC data for this commander right now.');
    expect(c.line).not.toMatch(/0 owned/);
  });
});

describe('compareCoverage', () => {
  it('sorts best coverage first, unavailable last, ties by name', () => {
    const cov = (n: number, available = true) => ({
      available,
      owned: n,
      slots: 62,
      comfortable: 75,
      thin: n < 75,
      line: '',
    });
    const rows = [
      { name: 'Sram', coverage: cov(59) },
      { name: 'Offline', coverage: cov(0, false) },
      { name: 'Ezuri', coverage: cov(93) },
      { name: 'Pending' },
      { name: 'Krenko', coverage: cov(86) },
      { name: 'Ayara', coverage: cov(86) },
    ];
    expect([...rows].sort(compareCoverage).map((r) => r.name)).toEqual([
      'Ezuri',
      'Ayara',
      'Krenko',
      'Sram',
      'Offline',
      'Pending',
    ]);
  });
});

describe('computeReasonLine', () => {
  it('counts owned names in the top 30 nonland cards of the tag page', () => {
    const cards = [
      { name: 'Command Tower', primary_type: 'Land' },
      ...page(Array.from({ length: 40 }, (_, i) => `Equip ${i}`)),
    ];
    const line = computeReasonLine(
      cards,
      owned(['Equip 0', 'Equip 1', 'Equip 35', 'Command Tower']),
      'Equipment'
    );
    expect(line).toBe("You own 2 of the Equipment page's top 30");
  });

  it('returns null for an empty tag page', () => {
    expect(computeReasonLine([], owned(['x']), 'Tokens')).toBeNull();
  });
});
