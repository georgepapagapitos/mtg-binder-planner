// @vitest-environment happy-dom
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';

const mockUseCardThumb = vi.hoisted(() => vi.fn(() => undefined as string | undefined));
vi.mock('../../lib/card-thumbs', () => ({ useCardThumb: mockUseCardThumb }));

import { TrendingRail, type TopCopiedDeck } from './TrendingRail';

interface RisingCommanderFixture {
  commanderKey: string;
  commanderName: string;
  partnerName: string | null;
  deckCount: number;
  newLast7d: number;
}

const risingFixture: RisingCommanderFixture[] = [
  {
    commanderKey: 'cmd-atraxa',
    commanderName: "Atraxa, Praetors' Voice",
    partnerName: null,
    deckCount: 120,
    newLast7d: 5,
  },
  {
    commanderKey: 'cmd-rising',
    commanderName: 'Rising Commander',
    partnerName: null,
    deckCount: 10,
    newLast7d: 8,
  },
];

// Verbatim from the w4-trending spec's "Fixture for the most-copied
// sub-section's independent testability" block.
const topCopiedDecksFixture: TopCopiedDeck[] = [
  {
    deckId: 'd-1',
    slug: 'meren-of-clan-nel-toth-a1b2c3d4',
    deckName: "Meren's Graveyard Value",
    commanderName: 'Meren of Clan Nel Toth',
    partnerName: null,
    score: 41.2,
  },
  {
    deckId: 'd-2',
    slug: 'thrasios-tymna-e5f6a7b8',
    deckName: 'Thrasios/Tymna Stax',
    commanderName: 'Thrasios, Triton Hero',
    partnerName: 'Tymna the Weaver',
    score: 33.7,
  },
  {
    deckId: 'd-3',
    slug: 'krenko-mob-boss-c9d0e1f2',
    deckName: 'Krenko Go Wide',
    commanderName: 'Krenko, Mob Boss',
    partnerName: null,
    score: 12.4,
  },
];

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

function stubFetchResolved(body: unknown, status = 200) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(body, status)));
}

/** The skeleton renders the section headings too, so "Rising commanders"
 *  being on screen says nothing about the fetch — wait for the loading
 *  status to leave instead (E272: a wait on skeleton text let the tile
 *  assertions run before the stubbed fetch settled, under suite load). */
const loaded = () => waitFor(() => expect(screen.queryByText('Loading trending decks')).toBeNull());

function renderRail(enabled = true) {
  return render(
    <MemoryRouter>
      <TrendingRail enabled={enabled} />
    </MemoryRouter>
  );
}

describe('TrendingRail', () => {
  // The remembered rail shape is written from an effect that can land after a
  // test's last await, so it is cleared at the START of each test, not the end.
  beforeEach(() => localStorage.removeItem('sc-trending-shape'));
  afterEach(() => {
    vi.unstubAllGlobals();
    mockUseCardThumb.mockClear();
  });

  it('enabled=false never fires the initial fetch', () => {
    stubFetchResolved({ risingCommanders: [] });
    renderRail(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('fires the fetch once enabled flips true', async () => {
    stubFetchResolved({ risingCommanders: risingFixture });
    const { rerender } = render(
      <MemoryRouter>
        <TrendingRail enabled={false} />
      </MemoryRouter>
    );
    expect(fetch).not.toHaveBeenCalled();

    rerender(
      <MemoryRouter>
        <TrendingRail enabled={true} />
      </MemoryRouter>
    );
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  });

  it('shows a skeleton while pending, never a spinner', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => {}))
    );
    renderRail();
    expect(screen.getByText('Loading trending decks')).toBeTruthy();
    expect(screen.queryByRole('status')).toBeTruthy();
    // A first visit reserves a full section (the common production shape),
    // so the browse grid beneath does not shift when data lands.
    expect(document.querySelectorAll('.trending-tile-skeleton')).toHaveLength(10);
  });

  it('reserves the shape the rail had last time: its tile count, or nothing when it was empty', async () => {
    stubFetchResolved({ risingCommanders: risingFixture });
    const { unmount } = renderRail();
    await loaded();
    expect(screen.getByText('Rising commanders')).toBeTruthy();
    await waitFor(() =>
      expect(localStorage.getItem('sc-trending-shape')).toBe(String(risingFixture.length))
    );
    unmount();

    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => {}))
    );
    renderRail();
    expect(document.querySelectorAll('.trending-tile-skeleton')).toHaveLength(risingFixture.length);

    localStorage.setItem('sc-trending-shape', '0');
    const { container } = renderRail();
    expect(container.querySelector('.trending-rail')).toBeNull();
  });

  it('shows the exact empty-both copy when neither sub-section has data', async () => {
    stubFetchResolved({ risingCommanders: [] });
    renderRail();
    await waitFor(() => expect(screen.getByText('Nothing trending yet.')).toBeTruthy());
    expect(screen.getByText('Publish a deck to be the first commander on the board.')).toBeTruthy();
  });

  it('collapses to a single muted line when compactWhenEmpty and both sub-sections are empty', async () => {
    stubFetchResolved({ risingCommanders: [] });
    render(
      <MemoryRouter>
        <TrendingRail enabled={true} compactWhenEmpty={true} />
      </MemoryRouter>
    );
    await waitFor(() => expect(screen.getByText('Nothing trending yet.')).toBeTruthy());
    expect(screen.queryByText('Publish a deck to be the first commander on the board.')).toBeNull();
    expect(screen.queryByText('Trending')).toBeNull();
  });

  it('renders only the rising sub-section when topCopiedDecks is absent', async () => {
    stubFetchResolved({ risingCommanders: risingFixture });
    renderRail();
    await loaded();
    expect(screen.getByText('Rising commanders')).toBeTruthy();
    expect(screen.queryByText('Most copied decks')).toBeNull();
    expect(screen.getByText(`Build with ${risingFixture[0].commanderName}`)).toBeTruthy();
  });

  it('renders both sub-sections when both are present', async () => {
    stubFetchResolved({ risingCommanders: risingFixture, topCopiedDecks: topCopiedDecksFixture });
    renderRail();
    await loaded();
    expect(screen.getByText('Rising commanders')).toBeTruthy();
    expect(screen.getByText('Most copied decks')).toBeTruthy();
  });

  it('shows an error state with Retry, and Retry re-fetches into content', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(jsonResponse({ error: 'down' }, 500)));
    renderRail();
    await waitFor(() =>
      expect(screen.getByText("Couldn't load trending decks right now.")).toBeTruthy()
    );
    expect(screen.getByText('Check your connection and try again.')).toBeTruthy();

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(jsonResponse({ risingCommanders: risingFixture }))
    );
    fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    await loaded();
    expect(screen.getByText('Rising commanders')).toBeTruthy();
  });

  describe('most-copied sub-section (independently testable from rising commanders)', () => {
    it('renders three tiles in score order, links to /d/{slug}, combines partner names, resolves art by commander name, and never shows a raw score', async () => {
      // risingCommanders is deliberately empty here -- proves this sub-section
      // renders correctly on its own, decoupled from the rising section.
      stubFetchResolved({ risingCommanders: [], topCopiedDecks: topCopiedDecksFixture });
      renderRail();
      await waitFor(() => expect(screen.getByText('Most copied decks')).toBeTruthy());
      expect(screen.queryByText('Rising commanders')).toBeNull();

      const links = screen.getAllByRole('link');
      expect(links.map((l) => l.getAttribute('href'))).toEqual([
        '/d/meren-of-clan-nel-toth-a1b2c3d4',
        '/d/thrasios-tymna-e5f6a7b8',
        '/d/krenko-mob-boss-c9d0e1f2',
      ]);

      expect(screen.getByText('Meren of Clan Nel Toth')).toBeTruthy();
      expect(screen.getByText('Thrasios, Triton Hero + Tymna the Weaver')).toBeTruthy();
      expect(screen.getByText('Krenko, Mob Boss')).toBeTruthy();

      expect(screen.queryByText('41.2')).toBeNull();
      expect(screen.queryByText('33.7')).toBeNull();
      expect(screen.queryByText('12.4')).toBeNull();
      expect(document.body.textContent).not.toMatch(/41\.2|33\.7|12\.4/);

      // `small`, not `normal`: the tile art box is 2.6rem wide, and the
      // landing page renders this rail — `normal` was ~100 KB per tile there.
      expect(mockUseCardThumb).toHaveBeenCalledWith('Meren of Clan Nel Toth', 'small');
      expect(mockUseCardThumb).toHaveBeenCalledWith('Thrasios, Triton Hero', 'small');
      expect(mockUseCardThumb).toHaveBeenCalledWith('Krenko, Mob Boss', 'small');
    });
  });

  describe('TrendingCommanderTile', () => {
    it('renders as a real anchor, never a button, with honest non-prefill-claiming copy', async () => {
      stubFetchResolved({ risingCommanders: risingFixture });
      renderRail();
      await loaded();
      expect(screen.getByText('Rising commanders')).toBeTruthy();

      const link = screen.getByRole('link', {
        name: `Build a deck with ${risingFixture[0].commanderName}`,
      });
      expect(link.getAttribute('href')).toBe('/decks/new');
      expect(screen.queryByRole('button', { name: /praetors/i })).toBeNull();
      expect(link.getAttribute('title')).toBeNull();
      expect(mockUseCardThumb).toHaveBeenCalledWith("Atraxa, Praetors' Voice", 'small');
    });

    it('clicking navigates to /decks/new (router test wrapper, not a real navigation)', async () => {
      stubFetchResolved({ risingCommanders: risingFixture });
      render(
        <MemoryRouter initialEntries={['/discover']}>
          <Routes>
            <Route path="/discover" element={<TrendingRail enabled={true} />} />
            <Route path="/decks/new" element={<div>New deck sentinel</div>} />
          </Routes>
        </MemoryRouter>
      );
      await loaded();
      expect(screen.getByText('Rising commanders')).toBeTruthy();
      fireEvent.click(screen.getAllByRole('link', { name: /build a deck with/i })[0]);
      await waitFor(() => expect(screen.getByText('New deck sentinel')).toBeTruthy());
    });
  });
});
