import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { detectCsvFormat, detectDelimiter, parseCsvAuto } from './csv';

/**
 * Round-trip guard for the frontend's ManaBox-compatible collection CSV
 * exporter (`frontend/src/lib/collection-export.ts`). This fixture is that
 * exporter's own output for a small fixed collection (see
 * `collection-export.test.ts`'s "backend round-trip fixture" case) — proving
 * a downloaded export parses straight back into the same cards.
 */
describe('collection CSV export round-trip', () => {
  it('parses the exported fixture back into the source cards', () => {
    const text = readFileSync(join(__dirname, 'fixtures/collection-export-sample.csv'), 'utf-8');
    const [headerLine] = text.split(/\r?\n/, 1);
    const headers = headerLine.split(detectDelimiter(headerLine));
    expect(detectCsvFormat(headers)).toBe('manabox');

    const { rows } = parseCsvAuto(text, 'manabox');
    expect(rows).toHaveLength(3);

    expect(rows[0]).toMatchObject({
      name: 'Sol Ring',
      setCode: 'CMR',
      collectorNumber: '1',
      finish: 'nonfoil',
      quantity: 2,
      condition: 'nm',
      language: 'en',
      sourceCategory: 'Commander',
    });
    expect(rows[1]).toMatchObject({
      name: 'Lightning Bolt',
      setCode: 'LEA',
      collectorNumber: '161',
      finish: 'foil',
      quantity: 1,
      condition: 'lp',
      language: 'en',
      sourceCategory: 'Modern',
    });
    expect(rows[2]).toMatchObject({
      name: 'Atraxa, Grand Unifier',
      setCode: 'ONE',
      collectorNumber: '240',
      finish: 'etched',
      quantity: 1,
      condition: undefined,
      language: 'ja',
    });
  });
});
