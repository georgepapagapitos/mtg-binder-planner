// @vitest-environment happy-dom
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../../store/collection', () => ({ useCollectionStore: vi.fn() }));
vi.mock('../../store/decks', () => ({ useDecksStore: vi.fn() }));
vi.mock('../../lib/use-load-samples', () => ({
  useLoadSamples: () => ({ load: vi.fn(), loading: false, error: null }),
}));
vi.mock('../../lib/analytics', () => ({ track: vi.fn() }));

import { GetStartedCard } from './GetStartedCard';
import { useCollectionStore } from '../../store/collection';
import { useDecksStore } from '../../store/decks';

const mockUseCollectionStore = useCollectionStore as unknown as ReturnType<typeof vi.fn>;
const mockUseDecksStore = useDecksStore as unknown as ReturnType<typeof vi.fn>;

function setCollection(overrides: { cards?: number; binders?: number; hydrating?: boolean }) {
  const state = {
    cards: Array.from({ length: overrides.cards ?? 0 }),
    binders: Array.from({ length: overrides.binders ?? 0 }),
    hydrating: overrides.hydrating ?? false,
  };
  mockUseCollectionStore.mockImplementation((sel: (s: typeof state) => unknown) => sel(state));
}

function setDecks(overrides: { decks?: number; hydrated?: boolean }) {
  const state = {
    decks: Array.from({ length: overrides.decks ?? 0 }),
    hydrated: overrides.hydrated ?? true,
  };
  mockUseDecksStore.mockImplementation((sel: (s: typeof state) => unknown) => sel(state));
}

function renderCard() {
  return render(
    <MemoryRouter>
      <GetStartedCard />
    </MemoryRouter>
  );
}

describe('GetStartedCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows all three steps undone for a fresh account, plus the sample affordance and guides link', () => {
    setCollection({ cards: 0, binders: 0 });
    setDecks({ decks: 0 });
    renderCard();

    expect(screen.getByRole('heading', { name: 'Get started' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Import your collection' }).getAttribute('href')).toBe(
      '/collection?add=list'
    );
    expect(screen.getByRole('link', { name: 'Build your first binder' }).getAttribute('href')).toBe(
      '/collection/binders'
    );
    expect(screen.getByRole('link', { name: 'Make a deck' }).getAttribute('href')).toBe(
      '/decks/new'
    );
    expect(screen.getByRole('button', { name: /try the sample collection/i })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Read the guides' }).getAttribute('href')).toBe(
      '/guides/'
    );
  });

  it('checks off completed steps, keeps the rest as links, and hides the sample affordance once the collection has cards', () => {
    setCollection({ cards: 3, binders: 1 });
    setDecks({ decks: 0 });
    renderCard();

    expect(screen.getByText('Import your collection').closest('li')?.className).toContain(
      'is-done'
    );
    expect(screen.getByText('Build your first binder').closest('li')?.className).toContain(
      'is-done'
    );
    expect(screen.getByRole('link', { name: 'Make a deck' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /try the sample collection/i })).toBeNull();
  });

  it('renders nothing once every step is done', () => {
    setCollection({ cards: 3, binders: 1 });
    setDecks({ decks: 1 });
    const { container } = renderCard();
    expect(container.innerHTML).toBe('');
  });

  it('renders nothing while either store is still hydrating, even for a fresh account', () => {
    setCollection({ cards: 0, binders: 0, hydrating: true });
    setDecks({ decks: 0, hydrated: false });
    const { container } = renderCard();
    expect(container.innerHTML).toBe('');
  });
});
