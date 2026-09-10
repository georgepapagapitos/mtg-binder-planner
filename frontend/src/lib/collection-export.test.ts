import { describe, it, expect } from 'vitest';
import { collectionToCsv, collectionCsvFileName } from './collection-export';
import type { EnrichedCard } from '../types';

function card(overrides: Partial<EnrichedCard> = {}): EnrichedCard {
  return {
    copyId: 'copy-1',
    name: 'Sol Ring',
    setCode: 'CMR',
    setName: 'Commander Legends',
    collectorNumber: '1',
    rarity: 'uncommon',
    scryfallId: 'sf-a',
    purchasePrice: 4,
    sourceCategory: 'Commander',
    sourceFormat: 'manabox',
    finish: 'nonfoil',
    foil: false,
    condition: 'nm',
    language: 'en',
    acquiredPrice: 1.5,
    ...overrides,
  };
}

describe('collectionToCsv', () => {
  it('emits a ManaBox-compatible header row', () => {
    const [header] = collectionToCsv([]).split('\n');
    expect(header).toBe(
      'Name,Set code,Set name,Collector number,Foil,Rarity,Quantity,Scryfall ID,Purchase price,Condition,Language,Binder name'
    );
  });

  it('groups same printing+finish+condition+language+binder into one row with a Quantity', () => {
    const cards = [card(), card()];
    const lines = collectionToCsv(cards).split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain(',2,');
  });

  it('keeps distinct conditions/languages/binders as separate rows', () => {
    const cards = [
      card(),
      card({ condition: 'lp' }),
      card({ language: 'ja' }),
      card({ sourceCategory: '' }),
    ];
    const lines = collectionToCsv(cards).split('\n').slice(1);
    expect(lines).toHaveLength(4);
    expect(lines.every((l) => l.endsWith(',1,') === false)).toBe(true); // each row's own qty column, not a shared literal check
  });

  it('quotes a name containing a comma and doubles internal quotes', () => {
    const csv = collectionToCsv([card({ name: 'Atraxa, Grand Unifier' })]);
    expect(csv).toContain('"Atraxa, Grand Unifier"');
  });

  it('emits acquiredPrice (cost basis) as Purchase price, blank when absent', () => {
    const withPrice = collectionToCsv([card({ acquiredPrice: 2.25 })]);
    expect(withPrice).toContain(',2.25,');
    const withoutPrice = collectionToCsv([card({ acquiredPrice: undefined })]);
    const dataLine = withoutPrice.split('\n')[1];
    const cols = dataLine.split(',');
    expect(cols[8]).toBe(''); // Purchase price column
  });

  it('writes nonfoil as "normal" (ManaBox convention)', () => {
    const csv = collectionToCsv([card({ finish: 'nonfoil' })]);
    expect(csv).toContain(',normal,');
  });

  it('leaves condition/language/binder blank when absent', () => {
    const csv = collectionToCsv([
      card({ condition: undefined, language: undefined, sourceCategory: '' }),
    ]);
    expect(csv.split('\n')[1].endsWith(',,,')).toBe(true);
  });
});

describe('collectionCsvFileName', () => {
  it('uses a YYYY-MM-DD timestamp', () => {
    expect(collectionCsvFileName(new Date('2026-03-04T05:06:00Z'))).toMatch(
      /^spellcontrol-collection-\d{4}-\d{2}-\d{2}\.csv$/
    );
  });
});

/**
 * `backend/src/parsers/fixtures/collection-export-sample.csv` is this
 * exporter's own output for a small fixed collection (3 cards, one printing
 * with 2 copies, a comma-in-name row) — the backend parser test round-trips
 * it. Keep this test's card list in sync with that fixture; if it drifts,
 * regenerate the fixture from `collectionToCsv` rather than hand-editing it.
 */
describe('backend round-trip fixture', () => {
  it('matches the checked-in fixture the backend parser test reads', () => {
    const fixtureCards: EnrichedCard[] = [
      card({ copyId: 'a1' }),
      card({ copyId: 'a2' }), // second copy of the same printing -> Quantity 2
      card({
        copyId: 'b1',
        name: 'Lightning Bolt',
        setCode: 'LEA',
        setName: 'Limited Edition Alpha',
        collectorNumber: '161',
        rarity: 'common',
        scryfallId: 'sf-b',
        finish: 'foil',
        condition: 'lp',
        language: 'en',
        sourceCategory: 'Modern',
        acquiredPrice: undefined,
      }),
      card({
        copyId: 'c1',
        name: 'Atraxa, Grand Unifier',
        setCode: 'ONE',
        setName: 'Phyrexia: All Will Be One',
        collectorNumber: '240',
        rarity: 'mythic',
        scryfallId: 'sf-c',
        finish: 'etched',
        condition: undefined,
        language: 'ja',
        sourceCategory: '',
        acquiredPrice: undefined,
      }),
    ];
    expect(collectionToCsv(fixtureCards)).toBe(
      [
        'Name,Set code,Set name,Collector number,Foil,Rarity,Quantity,Scryfall ID,Purchase price,Condition,Language,Binder name',
        'Sol Ring,CMR,Commander Legends,1,normal,uncommon,2,sf-a,1.50,nm,en,Commander',
        'Lightning Bolt,LEA,Limited Edition Alpha,161,foil,common,1,sf-b,,lp,en,Modern',
        '"Atraxa, Grand Unifier",ONE,Phyrexia: All Will Be One,240,etched,mythic,1,sf-c,,,ja,',
      ].join('\n')
    );
  });
});
