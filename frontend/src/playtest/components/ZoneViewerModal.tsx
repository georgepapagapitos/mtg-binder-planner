import { useMemo, useState } from 'react';
import { useLockBodyScroll } from '@/lib/use-lock-body-scroll';
import { useEscapeKey } from '@/lib/use-escape-key';
import { useSheetExit } from '@/lib/use-sheet-exit';
import { normalizeForSearch } from '@/lib/normalize-search';
import { SearchPill } from '@/components/SearchPill';
import { CardPreview } from '@/components/CardPreview';
import { scryfallToEnrichedCard } from '@/lib/scryfall-to-enriched';
import type { ScryfallCard } from '@/deck-builder/types';
import type { PlaytestCard, Zone } from '@/lib/playtest';
import { MOVE_DESTINATIONS, destinationKey } from '../lib/zones';

interface Props {
  zone: Zone;
  cards: PlaytestCard[];
  onClose(): void;
  onMove(cardId: string, to: Zone | 'battlefield', toIndex?: number): void;
  onShuffleAfter?(): void;
  /** Lookup for the full ScryfallCard behind each PlaytestCard — powers the
   *  tap-to-preview wiring (B6-07), same lookup `PlaytestBoard` already
   *  builds for `OpeningHandSheet`. */
  cardLookup?: Map<string, ScryfallCard>;
}

interface ViewerDestination {
  key: Zone | 'battlefield';
  label: string;
  toIndex?: number;
}

// ZoneViewerModal's destination list extends the shared MOVE_DESTINATIONS with
// 'battlefield' (between 'hand' and 'graveyard'), since cards in a zone can be
// played directly onto the battlefield.
const DESTINATIONS: ViewerDestination[] = [
  MOVE_DESTINATIONS[0], // hand
  { key: 'battlefield', label: 'Battlefield' },
  ...MOVE_DESTINATIONS.slice(1), // graveyard, exile, library (top/bottom), command
];

export function ZoneViewerModal({
  zone,
  cards,
  onClose,
  onMove,
  onShuffleAfter,
  cardLookup,
}: Props) {
  const { isClosing, beginClose, onAnimationEnd } = useSheetExit(onClose, 'binder-sheet-slide-out');
  useLockBodyScroll();
  useEscapeKey(beginClose);
  const [filter, setFilter] = useState('');
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);

  const visible = useMemo(() => {
    const nq = normalizeForSearch(filter);
    if (!nq) return cards;
    return cards.filter((c) => normalizeForSearch(c.name).includes(nq));
  }, [cards, filter]);

  // B6-07: same projection OpeningHandSheet builds for CardPreview — only
  // cards with a resolvable ScryfallCard can be previewed, so `previewIndex`
  // indexes into this filtered array, not `visible` directly.
  const previewable = useMemo(() => {
    if (!cardLookup) return [];
    const out: { cardId: string; enriched: ReturnType<typeof scryfallToEnrichedCard> }[] = [];
    for (const c of visible) {
      const scry = cardLookup.get(c.id);
      if (scry) out.push({ cardId: c.id, enriched: scryfallToEnrichedCard(scry) });
    }
    return out;
  }, [visible, cardLookup]);
  const previewCards = useMemo(() => previewable.map((p) => p.enriched), [previewable]);
  const previewLabels = useMemo(() => previewable.map(() => zone), [previewable, zone]);
  const previewPages = useMemo(() => previewable.map(() => 1), [previewable]);

  function openPreview(cardId: string) {
    const idx = previewable.findIndex((p) => p.cardId === cardId);
    if (idx >= 0) setPreviewIndex(idx);
  }

  return (
    <div className="card-picker-root">
      {/* The backdrop fully covers the root (both `inset: 0`), so it — not
          root — is what a "click outside the sheet" actually lands on. */}
      <div className="card-picker-backdrop" role="presentation" onClick={() => beginClose()} />
      <div
        className={`card-picker-sheet playtest-zone-sheet${isClosing ? ' is-closing' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={`${zone} viewer`}
        onAnimationEnd={onAnimationEnd}
      >
        <div className="card-picker-handle" aria-hidden />
        <div className="card-picker-header">
          <h2 className="card-picker-title playtest-zone-title">{zone}</h2>
          <SearchPill
            value={filter}
            onChange={setFilter}
            placeholder={`Search ${zone}…`}
            ariaLabel={`Search ${zone}`}
            autoFocus
          />
        </div>
        {visible.length === 0 ? (
          <p className="playtest-zone-empty">No cards.</p>
        ) : (
          <ul className="playtest-zone-grid">
            {visible.map((c) => (
              <ZoneCard
                key={c.id}
                card={c}
                destinations={DESTINATIONS.filter((d) => d.key !== zone)}
                onMove={onMove}
                onPreview={cardLookup?.has(c.id) ? openPreview : undefined}
              />
            ))}
          </ul>
        )}
        {onShuffleAfter && (
          <div className="card-picker-footer">
            <button type="button" className="btn btn-primary" onClick={onShuffleAfter}>
              Shuffle {zone} and close
            </button>
          </div>
        )}
      </div>

      {previewIndex !== null && previewCards[previewIndex] && (
        <CardPreview
          source="playtest"
          cards={previewCards}
          index={previewIndex}
          binderName={zone}
          sectionLabels={previewLabels}
          pageNumbers={previewPages}
          totalPages={1}
          onIndexChange={setPreviewIndex}
          onClose={() => setPreviewIndex(null)}
        />
      )}
    </div>
  );
}

interface ZoneCardProps {
  card: PlaytestCard;
  destinations: ViewerDestination[];
  onMove(cardId: string, to: Zone | 'battlefield', toIndex?: number): void;
  /** B6-07: tap the card face to open `CardPreview`. Omitted (no button,
   *  plain image) when this card has no resolvable ScryfallCard. */
  onPreview?(cardId: string): void;
}

/**
 * One grid tile. Split out (rather than inlined in the `.map`) so each
 * card's broken-image fallback is local state on its own instance — and so
 * `content-visibility: auto` (set in CSS on `.playtest-zone-card`) can skip
 * layout/paint for the ~90-card case entirely off-screen without a
 * virtualization library.
 */
function ZoneCard({ card: c, destinations, onMove, onPreview }: ZoneCardProps) {
  const [imgError, setImgError] = useState(false);
  const face =
    c.imageUrl && !imgError ? (
      <img
        src={c.imageUrl}
        alt={c.name}
        draggable={false}
        loading="lazy"
        decoding="async"
        onError={() => setImgError(true)}
      />
    ) : (
      <div className="playtest-zone-card__placeholder">{c.name}</div>
    );
  return (
    <li className="playtest-zone-card">
      {onPreview ? (
        <button
          type="button"
          className="playtest-zone-card__preview"
          onClick={() => onPreview(c.id)}
          aria-label={`${c.name}: preview`}
        >
          {face}
        </button>
      ) : (
        face
      )}
      <div className="playtest-zone-card__name">{c.name}</div>
      <div className="playtest-zone-card__actions">
        {destinations.map((d) => (
          <button
            key={destinationKey(d)}
            type="button"
            onClick={() => onMove(c.id, d.key, d.toIndex)}
            className="playtest-zone-card__action"
          >
            → {d.label}
          </button>
        ))}
      </div>
    </li>
  );
}
