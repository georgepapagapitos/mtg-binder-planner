// @vitest-environment happy-dom
/**
 * B6-07: the zone browser had no path from a card to its full text — tapping
 * a card face now opens the shared `CardPreview`, same wiring OpeningHandSheet
 * already has. CardPreview itself is stubbed (own test file, large dependency
 * tree) — these tests only exercise ZoneViewerModal's hand-off: which card,
 * at which index, and that a card with no lookup entry stays a plain image.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ScryfallCard } from '@/deck-builder/types';
import type { PlaytestCard } from '@/lib/playtest';
import { ZoneViewerModal } from './ZoneViewerModal';

vi.mock('@/components/CardPreview', () => ({
  CardPreview: (props: { cards: Array<{ name: string }>; index: number }) => (
    <div data-testid="card-preview">{props.cards[props.index]?.name}</div>
  ),
}));

afterEach(() => {
  vi.restoreAllMocks();
});

function scryCard(id: string, name: string): ScryfallCard {
  return {
    id,
    name,
    set: 'tst',
    set_name: 'Test Set',
    collector_number: '1',
    rarity: 'common',
    type_line: 'Creature — Test',
    cmc: 1,
  } as unknown as ScryfallCard;
}

function ptCard(id: string, name: string): PlaytestCard {
  return { id, name };
}

describe('ZoneViewerModal — tap-to-preview (B6-07)', () => {
  it('opens CardPreview at the tapped card, indexed only over previewable cards', () => {
    const cards = [ptCard('c1', 'Sol Ring'), ptCard('c2', 'Arcane Signet')];
    const cardLookup = new Map([['c2', scryCard('c2', 'Arcane Signet')]]);
    render(
      <ZoneViewerModal
        zone="library"
        cards={cards}
        onClose={() => {}}
        onMove={() => {}}
        cardLookup={cardLookup}
      />
    );

    expect(screen.queryByTestId('card-preview')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Arcane Signet: preview' }));
    expect(screen.getByTestId('card-preview').textContent).toBe('Arcane Signet');
  });

  it('renders a plain, non-interactive face for a card with no lookup entry', () => {
    const cards = [ptCard('c1', 'Sol Ring')];
    render(<ZoneViewerModal zone="library" cards={cards} onClose={() => {}} onMove={() => {}} />);
    expect(screen.queryByRole('button', { name: /preview/ })).toBeNull();
  });
});
