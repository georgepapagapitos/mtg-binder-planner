import type { EnrichedCard } from '../types';
import { safeName } from './backup';

/**
 * ManaBox-compatible collection CSV export — headers this app's own parser
 * already recognizes (`backend/src/parsers/csv.ts`'s HEADER_ALIASES +
 * `detectCsvFormat`'s "Scryfall ID" + "Binder Name" manabox signature), so a
 * downloaded file round-trips straight back through Add cards → Upload with
 * no format guessing. "Purchase price" round-trips to `acquiredPrice` (cost
 * basis), not the live market `purchasePrice` — see merge-card.ts.
 */
const CSV_HEADERS = [
  'Name',
  'Set code',
  'Set name',
  'Collector number',
  'Foil',
  'Rarity',
  'Quantity',
  'Scryfall ID',
  'Purchase price',
  'Condition',
  'Language',
  'Binder name',
];

function csvField(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function csvRow(values: string[]): string {
  return values.map(csvField).join(',');
}

/**
 * One row per copy group — same printing (set + collector number) + finish +
 * condition + language + binder collapse into a single row with a Quantity,
 * matching what the parser expects when it reads a row back.
 */
export function collectionToCsv(cards: EnrichedCard[]): string {
  const groups = new Map<string, { card: EnrichedCard; qty: number }>();
  for (const card of cards) {
    const key = [
      card.name,
      card.setCode,
      card.collectorNumber,
      card.finish,
      card.condition ?? '',
      card.language ?? '',
      card.sourceCategory ?? '',
    ].join('|');
    const existing = groups.get(key);
    if (existing) existing.qty += 1;
    else groups.set(key, { card, qty: 1 });
  }

  const lines = [csvRow(CSV_HEADERS)];
  for (const { card, qty } of groups.values()) {
    lines.push(
      csvRow([
        card.name,
        card.setCode,
        card.setName,
        card.collectorNumber,
        card.finish === 'nonfoil' ? 'normal' : card.finish,
        card.rarity,
        String(qty),
        card.scryfallId,
        card.acquiredPrice != null ? card.acquiredPrice.toFixed(2) : '',
        card.condition ?? '',
        card.language ?? '',
        card.sourceCategory ?? '',
      ])
    );
  }
  return lines.join('\n');
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export function collectionCsvFileName(now: Date = new Date()): string {
  return `spellcontrol-collection-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.csv`;
}

export function binderCsvFileName(binderName: string, now: Date = new Date()): string {
  return `spellcontrol-binder-${safeName(binderName)}-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.csv`;
}

export function downloadCsv(csv: string, fileName: string): void {
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
