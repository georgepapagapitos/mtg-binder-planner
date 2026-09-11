// @vitest-environment happy-dom
import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EnrichedCard } from '@/types';
import type { EDHRECCommanderData } from '@/deck-builder/types';

vi.mock('../../lib/card-thumbs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/card-thumbs')>()),
  useCardThumb: () => undefined,
}));

const fetchCommanderData = vi.fn<(name: string) => Promise<EDHRECCommanderData>>();
const fetchTopCommanders = vi.fn();
const fetchTagPageData = vi.fn();
vi.mock('@/deck-builder/services/edhrec/client', () => ({
  fetchCommanderData: (name: string) => fetchCommanderData(name),
  fetchTopCommanders: (colors: string[]) => fetchTopCommanders(colors),
  fetchTagPageData: (slug: string, colors: string[]) => fetchTagPageData(slug, colors),
}));
const getCardByName = vi.fn();
vi.mock('@/deck-builder/services/scryfall/client', () => ({
  getCardByName: (name: string) => getCardByName(name),
  getCardPrice: (card: { prices?: { usd?: string } }) => card.prices?.usd ?? null,
}));

import { BinderRanking } from './BinderRanking';

function legend(name: string, ci: string[]): EnrichedCard {
  return {
    name,
    scryfallId: `id-${name}`,
    copyId: `copy-${name}`,
    colorIdentity: ci,
    typeLine: 'Legendary Creature',
  } as unknown as EnrichedCard;
}

/** A commander page with `owned` of its cards present in the collection. */
function pageWith(ownedCount: number, theme = 'Equipment'): EDHRECCommanderData {
  const cards = Array.from({ length: 120 }, (_, i) => ({
    name: i < ownedCount ? `Owned ${i}` : `Other ${i}`,
    sanitized: '',
    primary_type: 'Creature',
    inclusion: 50,
    num_decks: 100,
  }));
  return {
    themes: [{ name: theme, slug: theme.toLowerCase(), count: 10, url: '' }],
    stats: { numDecks: 12345 } as EDHRECCommanderData['stats'],
    cardlists: {
      creatures: [],
      instants: [],
      sorceries: [],
      artifacts: [],
      enchantments: [],
      planeswalkers: [],
      lands: [],
      allNonLand: cards,
    },
    similarCommanders: [],
  };
}

const ownedCardNames = new Set(Array.from({ length: 100 }, (_, i) => `owned ${i}`));
const collectionCards = Array.from({ length: 100 }, (_, i) => legend(`Owned ${i}`, []));
const legends = [legend('Sram, Senior Edificer', ['W']), legend('Ezuri, Renegade Leader', ['G'])];

function renderRanking(over: Partial<Parameters<typeof BinderRanking>[0]> = {}) {
  return render(
    <BinderRanking
      colorFilter={new Set(['W'])}
      colorLabel="White"
      ownedOnly={false}
      collectionLegends={[
        ...legends,
        legend('Giada, Font of Hope', ['W']),
        legend('Teshar, Ancestor’s Apostle', ['W']),
      ]}
      collectionCards={collectionCards}
      ownedCardNames={ownedCardNames}
      landCount={37}
      disabled={false}
      onSelectOwned={vi.fn()}
      onSelectByName={vi.fn()}
      {...over}
    />
  );
}

beforeEach(() => {
  fetchCommanderData.mockReset();
  fetchTopCommanders.mockReset();
  fetchTagPageData.mockReset();
  getCardByName.mockReset();
  fetchTopCommanders.mockResolvedValue([]);
  fetchTagPageData.mockResolvedValue(null);
});

describe('BinderRanking', () => {
  it('prompts for a color before ranking anything', () => {
    renderRanking({ colorFilter: new Set() });
    expect(screen.getByText(/Pick a color to rank/)).toBeTruthy();
    expect(fetchCommanderData).not.toHaveBeenCalled();
  });

  it('ranks the owned commanders in the chosen colors by coverage, best first', async () => {
    fetchCommanderData.mockImplementation(async (name) => {
      if (name.startsWith('Sram')) return pageWith(59);
      if (name.startsWith('Giada')) return pageWith(93);
      if (name.startsWith('Teshar')) return pageWith(80);
      throw new Error(`unexpected ${name}`);
    });
    renderRanking();
    // Only the exact-color legends: Ezuri (G) is never fetched under a W filter.
    await screen.findByText('3 commanders ranked, best coverage first');
    expect(fetchCommanderData).toHaveBeenCalledTimes(3);
    expect(fetchCommanderData).not.toHaveBeenCalledWith('Ezuri, Renegade Leader');

    const names = screen.getAllByRole('button').map((b) => b.textContent ?? '');
    const order = ['Giada', 'Teshar', 'Sram'].map((n) => names.findIndex((t) => t.includes(n)));
    expect(order).toEqual([...order].sort((a, b) => a - b));

    expect(screen.getByText('93 owned cards for 62 slots, no gaps')).toBeTruthy();
    expect(
      screen.getByText(
        "59 owned cards for 62 slots, a few will come from outside this commander's data"
      )
    ).toBeTruthy();
    // Top archetype + EDHREC deck count, and readiness stays as the secondary chip.
    expect(screen.getAllByText('Equipment').length).toBe(3);
    expect(screen.getAllByText('12,345 decks on EDHREC').length).toBe(3);
    expect(screen.getAllByText('93%').length).toBeGreaterThan(0);
  });

  it('shows the progress while loading and a per-row skeleton line', async () => {
    const release: Array<() => void> = [];
    fetchCommanderData.mockImplementation(
      () =>
        new Promise<EDHRECCommanderData>((resolve) => {
          release.push(() => resolve(pageWith(80)));
        })
    );
    renderRanking();
    expect(screen.getByText('Checking 3 commanders against your collection, 0 done')).toBeTruthy();
    expect(screen.getAllByText('Checking your collection…').length).toBe(3);
    await act(async () => {
      for (const r of release) r();
      await Promise.resolve();
    });
    await screen.findByText(/ranked, best coverage first/);
  });

  it('lists EDHREC top commanders you do not own under the owned ones, with a price tag', async () => {
    fetchCommanderData.mockResolvedValue(pageWith(80));
    fetchTopCommanders.mockResolvedValue([
      { rank: 1, name: 'Sram, Senior Edificer', sanitized: '', colorIdentity: ['W'], numDecks: 1 },
      { rank: 2, name: 'Heliod, Sun-Crowned', sanitized: '', colorIdentity: ['W'], numDecks: 1 },
      { rank: 3, name: 'A // B', sanitized: '', colorIdentity: ['W'], numDecks: 1 },
      { rank: 4, name: 'Odric, Lunarch Marshal', sanitized: '', colorIdentity: ['W'], numDecks: 1 },
    ]);
    getCardByName.mockImplementation(async (name: string) => ({
      name,
      prices: { usd: name.startsWith('Heliod') ? '12.40' : '0.30' },
    }));
    renderRanking();
    await screen.findByText('5 commanders ranked, best coverage first');
    expect(screen.getByRole('heading', { name: 'Not in your binder' })).toBeTruthy();
    expect(screen.getByText('Not in your binder · $12')).toBeTruthy();
    // Under $10 keeps its cents: a 30-cent commander never reads as "$0".
    expect(screen.getByText('Not in your binder · $0.30')).toBeTruthy();
    // The owned Sram is not duplicated into the not-owned section; the partner pair is dropped.
    expect(screen.getAllByText(/Sram/).length).toBe(1);
    expect(screen.queryByText('A // B')).toBeNull();
  });

  it('hides the not-owned section when "Commanders I own" is on', async () => {
    fetchCommanderData.mockResolvedValue(pageWith(80));
    renderRanking({ ownedOnly: true });
    await screen.findByText('3 commanders ranked, best coverage first');
    expect(fetchTopCommanders).not.toHaveBeenCalled();
    expect(screen.queryByRole('heading', { name: 'Not in your binder' })).toBeNull();
  });

  it('says when none of your commanders are in those colors and still ranks EDHREC picks', async () => {
    fetchCommanderData.mockResolvedValue(pageWith(80));
    fetchTopCommanders.mockResolvedValue([
      {
        rank: 1,
        name: 'Yuriko, the Tiger’s Shadow',
        sanitized: '',
        colorIdentity: ['U', 'B'],
        numDecks: 1,
      },
    ]);
    getCardByName.mockResolvedValue({ name: 'Yuriko', prices: {} });
    renderRanking({ colorFilter: new Set(['U', 'B']), colorLabel: 'Dimir' });
    expect(screen.getByText('None of your commanders are exactly Dimir.')).toBeTruthy();
    await screen.findByText('1 commander ranked, best coverage first');
    expect(screen.getByRole('heading', { name: 'Not in your binder' })).toBeTruthy();
    expect(screen.getByText(/Yuriko/)).toBeTruthy();
  });

  it('renders a muted unavailable line, never 0%, when EDHREC fails for a row', async () => {
    fetchCommanderData.mockImplementation(async (name) => {
      if (name.startsWith('Sram')) throw new Error('offline');
      return pageWith(80);
    });
    renderRanking();
    await screen.findByText('3 commanders ranked, best coverage first');
    expect(screen.getByText('No EDHREC data for this commander right now.')).toBeTruthy();
    expect(screen.queryByText('0%')).toBeNull();
    expect(screen.getByTitle('No EDHREC staple data for this commander.')).toBeTruthy();
  });

  it('loads the reason line from the top theme page for the visible rows', async () => {
    fetchCommanderData.mockResolvedValue(pageWith(80));
    fetchTagPageData.mockResolvedValue({
      commanders: [],
      cardlists: {
        allNonLand: Array.from({ length: 30 }, (_, i) => ({
          name: i < 18 ? `Owned ${i}` : `Other ${i}`,
          primary_type: 'Artifact',
        })),
      },
      potentialDecks: 0,
      highSynergyNames: [],
      colorSlug: 'w',
    });
    renderRanking();
    await screen.findByText('3 commanders ranked, best coverage first');
    await waitFor(() =>
      expect(screen.getAllByText("You own 18 of the Equipment page's top 30").length).toBe(3)
    );
    expect(fetchTagPageData).toHaveBeenCalledWith('equipment', ['W']);
  });

  it('selects the owned copy for owned rows and by name for EDHREC rows', async () => {
    fetchCommanderData.mockResolvedValue(pageWith(80));
    fetchTopCommanders.mockResolvedValue([
      { rank: 1, name: 'Heliod, Sun-Crowned', sanitized: '', colorIdentity: ['W'], numDecks: 1 },
    ]);
    getCardByName.mockResolvedValue({ name: 'Heliod, Sun-Crowned', prices: {} });
    const onSelectOwned = vi.fn();
    const onSelectByName = vi.fn();
    renderRanking({ onSelectOwned, onSelectByName });
    await screen.findByText('4 commanders ranked, best coverage first');
    screen.getByRole('button', { name: /Sram/ }).click();
    expect(onSelectOwned).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Sram, Senior Edificer' })
    );
    screen.getByRole('button', { name: /Heliod/ }).click();
    expect(onSelectByName).toHaveBeenCalledWith('Heliod, Sun-Crowned');
  });
});
