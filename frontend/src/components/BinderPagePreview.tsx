import { Boxes, Layers } from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { BinderPage, EnrichedCard, PocketSize } from '../types';
import { CardPreview, type CardPreviewAction } from './CardPreview';
import { useLockBodyScroll } from '../lib/use-lock-body-scroll';
import { SnapCarousel, type SnapCarouselHandle } from './SnapCarousel';
import { useSwipeDownDismiss } from '../lib/use-swipe-down-dismiss';
import { useSheetExit } from '../lib/use-sheet-exit';
import { useAllocations, type AllocationInfo } from '../lib/allocations';
import { classifyFoil } from '../lib/foil-style';
import { buildSpreads, spreadIndexForPage, layoutSectionTabs } from '../lib/binder-spreads';
import type { SectionTabInput, TabPlacement } from '../lib/binder-spreads';
import { ColorPip } from './shared/ManaSymbol';

export interface InnerCardScope {
  cards: EnrichedCard[];
  index: number;
  sectionLabels: string[];
  pageNumbers: number[];
  totalPages: number;
}

interface Props {
  pages: BinderPage[];
  /** Per-page sub-label (e.g. section name). Parallel array to `pages`. */
  pageLabels: string[];
  startPageIndex: number;
  pocketSize: PocketSize;
  binderName: string;
  /**
   * Whether the physical binder is double-sided (sheet backs are discrete
   * pages). Controls verso/recto pairing in spread mode.
   */
  doubleSided?: boolean;
  /**
   * Resolve a tapped card to the scope used by the inner CardPreview
   * (which list to walk for prev/next, where to start, etc). Return null
   * to no-op the tap.
   */
  resolveCard: (card: EnrichedCard) => InnerCardScope | null;
  onClose: () => void;
  /** Forwarded to the inner CardPreview's Edit button. */
  onEditCard?: (card: EnrichedCard) => void;
  /** Extra per-card actions (e.g. "Set cover") forwarded to the inner CardPreview's icon bar. */
  getCardActions?: (card: EnrichedCard | undefined) => CardPreviewAction[];
  /** Group-printings qty by copyId — forwarded to inner CardPreview's ×N tag. */
  qtyByCopyId?: Map<string, number>;
  /**
   * Section index tabs for spread mode (≥1024px). When provided and the
   * binder has more than 1 section, physical index-tab dividers appear in the
   * left/right gutters outside the spread slide. No-op in single-page mode.
   */
  sectionTabs?: SectionTabInput[];
}

// Pages within this many slides of the focus mount their full pocket grid;
// the rest render as bare placeholder slides that hold the scroll slot only.
// Mirrors CardPreview's windowing — keeps the carousel light on large binders
// without disturbing native scroll-snap (every page keeps a sized slide div).
const PAGE_WINDOW_RADIUS = 5;

// In spread mode each slide mounts two grids, so tighten the window to keep
// the DOM light for large binders.
const SPREAD_WINDOW_RADIUS = 3;

// Breakpoint at which the spread layout activates (≥1024px).
const SPREAD_BREAKPOINT = '(min-width: 1024px)';

/** Returns true when the viewport is at or above the spread breakpoint. */
function querySpreadMode(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia(SPREAD_BREAKPOINT).matches;
}

/**
 * Subscribes to the spread breakpoint and returns the current match state.
 * Safe in node/test environments (matchMedia absent → always false).
 */
function useSpreadMode(): boolean {
  const [active, setActive] = useState<boolean>(() => querySpreadMode());

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mql = window.matchMedia(SPREAD_BREAKPOINT);
    const handler = (e: MediaQueryListEvent) => setActive(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  return active;
}

export function BinderPagePreview({
  pages,
  pageLabels,
  startPageIndex,
  pocketSize,
  binderName,
  doubleSided = false,
  resolveCard,
  onClose,
  onEditCard,
  getCardActions,
  qtyByCopyId,
  sectionTabs,
}: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const carousel = useRef<SnapCarouselHandle>(null);

  // The available height for gutter tab columns equals the track's clientHeight
  // minus its vertical padding (1.25rem top + 1.25rem bottom ≈ 40px at 16px
  // base). We measure the track element via ResizeObserver and subtract the
  // padding so tabs never overflow the visible slide height.
  // Guard: ResizeObserver is absent in test environments (happy-dom) → we
  // start at 0 so no tabs render until the observer fires (or never in tests
  // unless mocked).
  const [gutterHeight, setGutterHeight] = useState(0);

  // Each page is one carousel slide. (Double-sided binders are modelled as
  // pocketSize-per-side already; the back of a sheet is its own page in the
  // pages[] list.)
  const cols = pocketSize === 4 ? 2 : pocketSize === 12 ? 4 : 3;
  const rows = pocketSize === 4 ? 2 : 3;
  // Page rectangle aspect = (cols × card-w) : (rows × card-h). Lets each
  // pocket land at the natural 5:7 card aspect regardless of pocket count
  // (4-pocket → 5:7, 9-pocket → 5:7, 12-pocket → 20:21 wide).
  const slideAspect = `${cols * 5} / ${rows * 7}`;
  // Same ratio expressed as width÷height — used by --slide-size to bound
  // the slide width by viewport height, so 12-pocket (wider) pages can
  // grow more on short viewports than tall 9-pocket pages.
  const pageAspectRatio = (cols * 5) / (rows * 7);

  const isSpread = useSpreadMode();
  const spreads = useMemo(
    () => (isSpread ? buildSpreads(pages.length, doubleSided) : []),
    [isSpread, pages.length, doubleSided]
  );

  // `selected` is a page index in single mode, a spread index in spread mode.
  const [selected, setSelected] = useState(() =>
    isSpread
      ? Math.max(0, spreadIndexForPage(buildSpreads(pages.length, doubleSided), startPageIndex))
      : startPageIndex
  );

  const [innerCard, setInnerCard] = useState<InnerCardScope | null>(null);

  // O(1) lookup from card → flat page index, so we can keep the flipbook in
  // sync as the user navigates cards in the inner CardPreview.
  const cardToPageIndex = useMemo(() => {
    const m = new Map<EnrichedCard, number>();
    pages.forEach((p, i) => {
      p.slots.forEach((slot) => {
        if (slot && !m.has(slot)) m.set(slot, i);
      });
    });
    return m;
  }, [pages]);

  // Follow-along: when the user navigates to a card on a DIFFERENT page in the
  // inner CardPreview, snap the background flipbook to that page. Instant
  // (not smooth) so the background change reads as "stays in sync with the
  // foreground" rather than as its own scrolling animation.
  useEffect(() => {
    if (!innerCard) return;
    const card = innerCard.cards[innerCard.index];
    if (!card) return;
    const targetPage = cardToPageIndex.get(card);
    if (targetPage === undefined) return;

    const target = isSpread ? spreadIndexForPage(spreads, targetPage) : targetPage;
    if (target === -1 || target === selected) return;
    carousel.current?.scrollTo(target, 'instant' as ScrollBehavior);
  }, [innerCard, cardToPageIndex, selected, isSpread, spreads]);

  // Re-center when crossing the spread/single breakpoint. Track the current
  // representative page (right side of spread if available, else left), then
  // remap it when the mode changes.
  const selectedPageRef = useRef(startPageIndex);
  const mountedRef = useRef(false);
  useLayoutEffect(() => {
    // The carousel positions itself on mount; this only handles later flips.
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    const target = isSpread
      ? Math.max(0, spreadIndexForPage(spreads, selectedPageRef.current))
      : selectedPageRef.current;
    setSelected(target);
    carousel.current?.scrollTo(target, 'instant' as ScrollBehavior);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSpread]);

  // Keep selectedPageRef in sync with `selected` so breakpoint re-entry uses
  // the most recent page.
  useEffect(() => {
    if (isSpread) {
      const s = spreads[selected];
      if (s) selectedPageRef.current = s.right ?? s.left ?? 0;
    } else {
      selectedPageRef.current = selected;
    }
  }, [selected, isSpread, spreads]);

  const slideCount = isSpread ? spreads.length : pages.length;

  useLockBodyScroll();

  // Symmetric exit: every flipbook dismiss path plays sheet-fall, then
  // unmounts — same treatment as the inner CardPreview.
  const { isClosing, beginClose, onAnimationEnd, exitStyle } = useSheetExit(onClose);

  // Escape closes; arrow keys live in the carousel (off while CardPreview owns them).
  useEffect(() => {
    if (innerCard) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') beginClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [beginClose, innerCard]);

  const { isDragging, touchHandlers } = useSwipeDownDismiss({
    onDismiss: beginClose,
    sheetRef,
    trackRef,
  });

  // The hook drives the drag offset imperatively on the sheet. Clear that
  // inline transform once the gesture ends (and we're not dismissing) so the
  // CSS snap-back transition animates the sheet home; a dismiss leaves it for
  // the sheet-fall keyframe. Mirrors CardPreview.
  useLayoutEffect(() => {
    if (isDragging || isClosing) return;
    const sheet = sheetRef.current;
    if (sheet) sheet.style.transform = '';
  }, [isDragging, isClosing]);

  const allocations = useAllocations();

  // Measure the track's clientHeight (minus its own vertical padding) so the
  // tab layout lib knows how much vertical space the gutter columns have.
  // Padding constants mirror the CSS values set on .binder-pages-track:
  //   ≥601px → paddingTop:1.25rem, paddingBottom:1.25rem   (≈ 40px each)
  //   ≤600px → paddingTop:0.75rem, paddingBottom:1.25rem   (≈ 12 + 20 = 32px)
  // We compute from `getComputedStyle` so the actual rendered padding drives
  // the number regardless of viewport size.
  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') return;
    const track = trackRef.current;
    if (!track) return;

    const update = () => {
      const style = getComputedStyle(track);
      const pt = parseFloat(style.paddingTop) || 0;
      const pb = parseFloat(style.paddingBottom) || 0;
      setGutterHeight(Math.max(0, track.clientHeight - pt - pb));
    };

    update();
    const ro = new ResizeObserver(update);
    ro.observe(track);
    return () => ro.disconnect();
  }, []);

  const handleCardTap = (card: EnrichedCard) => {
    const scope = resolveCard(card);
    if (scope) setInnerCard(scope);
  };

  if (pages.length === 0) return null;

  // Same model as CardPreview: the sheet is a transparent transform carrier
  // (only the opaque binder page + info panel rise); the dim sits on the
  // backdrop, which stays put, fades in/out (.is-closing), and carries the
  // sizing var (--page-w-ratio drives --slide-size).
  //
  // In spread mode the slide contains [left-page | spine | right-page].
  // We reserve exactly 1 ratio-unit for the spine in --page-w-ratio so
  // min() still clamps the slide to the track. --spread-page-frac and
  // --spread-spine-frac let the CSS assign exact fractional widths to each
  // child so that pages + spine sum to exactly --slide-size — eliminating
  // the few-px height-overflow that occurred when the CSS clamp-based spine
  // width didn't match the JS-reserved unit.
  const spreadAspectRatio = (2 * cols * 5 + 1) / (rows * 7);
  const spreadPageFrac = (cols * 5) / (2 * cols * 5 + 1);
  const spreadSpineFrac = 1 / (2 * cols * 5 + 1);
  const backdropStyle = {
    ['--page-w-ratio' as string]: isSpread ? spreadAspectRatio : pageAspectRatio,
    ...(isSpread && {
      ['--spread-page-frac' as string]: spreadPageFrac,
      ['--spread-spine-frac' as string]: spreadSpineFrac,
    }),
  } as React.CSSProperties;

  // Panel display helpers for spread mode.
  const panelInfo = (): { contextLine: string; counterLine: string } => {
    if (!isSpread) {
      const currentPage = pages[selected];
      const currentLabel = pageLabels[selected] ?? '';
      return {
        contextLine: `${currentLabel ? `${currentLabel} · ` : ''}page ${currentPage?.pageNum}`,
        counterLine: `Page ${selected + 1} of ${pages.length}`,
      };
    }
    const spread = spreads[selected];
    if (!spread) {
      return { contextLine: '', counterLine: '' };
    }
    const leftPage = spread.left !== null ? pages[spread.left] : null;
    const rightPage = spread.right !== null ? pages[spread.right] : null;
    const leftNum = leftPage?.pageNum;
    const rightNum = rightPage?.pageNum;
    const leftLabel = spread.left !== null ? (pageLabels[spread.left] ?? '') : '';
    const rightLabel = spread.right !== null ? (pageLabels[spread.right] ?? '') : '';

    // Section / label context line.
    let contextLine: string;
    if (leftLabel && rightLabel && leftLabel !== rightLabel) {
      if (leftNum !== undefined && rightNum !== undefined) {
        contextLine = `${leftLabel} → ${rightLabel} · pages ${leftNum}–${rightNum}`;
      } else if (leftNum !== undefined) {
        contextLine = `${leftLabel} → ${rightLabel} · page ${leftNum}`;
      } else if (rightNum !== undefined) {
        contextLine = `${leftLabel} → ${rightLabel} · page ${rightNum}`;
      } else {
        contextLine = `${leftLabel} → ${rightLabel}`;
      }
    } else {
      const label = leftLabel || rightLabel;
      if (leftNum !== undefined && rightNum !== undefined) {
        contextLine = `${label ? `${label} · ` : ''}pages ${leftNum}–${rightNum}`;
      } else if (leftNum !== undefined) {
        contextLine = `${label ? `${label} · ` : ''}page ${leftNum}`;
      } else if (rightNum !== undefined) {
        contextLine = `${label ? `${label} · ` : ''}page ${rightNum}`;
      } else {
        contextLine = label;
      }
    }
    return {
      contextLine,
      counterLine: `Spread ${selected + 1} of ${spreads.length}`,
    };
  };

  const { contextLine, counterLine } = panelInfo();

  const windowRadius = isSpread ? SPREAD_WINDOW_RADIUS : PAGE_WINDOW_RADIUS;
  // True when gutter columns are rendered — used to apply is-tabbed to the
  // backdrop so CSS can scope the gutter-reserving --slide-size override and
  // centering spacers only when tabs are actually present (Fix 3).
  const hasTabs = isSpread && (sectionTabs?.length ?? 0) > 1;

  return (
    <>
      <div
        className={`binder-pages-backdrop${isSpread ? ' is-spread' : ''}${hasTabs ? ' is-tabbed' : ''}${isClosing ? ' is-closing' : ''}`}
        onClick={() => beginClose()}
        role="dialog"
        aria-modal="true"
        style={backdropStyle}
      >
        <div
          ref={sheetRef}
          className={`binder-pages-sheet${isDragging ? ' is-dragging' : ''}${
            isClosing ? ' is-closing' : ''
          }`}
          style={exitStyle}
          onAnimationEnd={onAnimationEnd}
          {...touchHandlers}
        >
          <button
            type="button"
            className="card-preview-close"
            onClick={(e) => {
              e.stopPropagation();
              beginClose();
            }}
            aria-label="Close preview"
          >
            ×
          </button>
          <div className="card-preview-grabber" aria-hidden="true" />
          <SnapCarousel
            ref={carousel}
            trackRef={trackRef}
            count={slideCount}
            index={selected}
            onIndexChange={setSelected}
            windowRadius={windowRadius}
            keysEnabled={!innerCard}
            className="binder-pages-track"
            prevLabel={isSpread ? 'Previous spread' : 'Previous page'}
            nextLabel={isSpread ? 'Next spread' : 'Next page'}
            slideClassName={(i) => {
              if (!isSpread) return 'binder-pages-slide';
              // A spread with only one real page (first/last of a double-sided
              // binder, odd tail of a single-sided one) renders just that page,
              // centered — no blank silhouette, no spine — in a page-wide slide.
              // Placeholders carry the same classes so slide widths never change
              // as the window moves.
              const spread = spreads[i];
              const singlePage = !spread || spread.left === null || spread.right === null;
              return `binder-pages-slide binder-pages-slide--spread${singlePage ? ' binder-pages-slide--single' : ''}${hasTabs ? ' binder-pages-slide--tabbed' : ''}`;
            }}
            renderSlide={(i) => {
              if (!isSpread) {
                return (
                  <SlideGrid
                    slots={pages[i].slots}
                    cols={cols}
                    rows={rows}
                    aspect={slideAspect}
                    allocations={allocations}
                    onTapCard={handleCardTap}
                  />
                );
              }
              const spread = spreads[i];
              const singlePage = spread.left === null || spread.right === null;
              const tabPlacements = hasTabs
                ? layoutSectionTabs(sectionTabs!, i, spreads, gutterHeight)
                : [];
              const jump = (page: number) => {
                const target = spreadIndexForPage(spreads, page);
                if (target >= 0) carousel.current?.scrollTo(target);
              };
              return (
                <>
                  {hasTabs && (
                    <SpreadTabGutter
                      placements={tabPlacements.filter((p) => p.side === 'left')}
                      side="left"
                      pages={pages}
                      onJump={jump}
                    />
                  )}
                  {spread.left !== null && (
                    <SlideGrid
                      slots={pages[spread.left].slots}
                      cols={cols}
                      rows={rows}
                      aspect={slideAspect}
                      allocations={allocations}
                      onTapCard={handleCardTap}
                    />
                  )}
                  {!singlePage && <div className="binder-spread-spine" aria-hidden="true" />}
                  {spread.right !== null && (
                    <SlideGrid
                      slots={pages[spread.right].slots}
                      cols={cols}
                      rows={rows}
                      aspect={slideAspect}
                      allocations={allocations}
                      onTapCard={handleCardTap}
                    />
                  )}
                  {hasTabs && (
                    <SpreadTabGutter
                      placements={tabPlacements.filter((p) => p.side === 'right')}
                      side="right"
                      pages={pages}
                      onJump={jump}
                    />
                  )}
                </>
              );
            }}
          />

          <div className="binder-pages-panel" onClick={(e) => e.stopPropagation()}>
            <div className="binder-pages-name">{binderName}</div>
            <div className="binder-pages-context">{contextLine}</div>
            <div className="binder-pages-counter">{counterLine}</div>
          </div>
        </div>
      </div>

      {innerCard && (
        <CardPreview
          source="binder"
          cards={innerCard.cards}
          index={innerCard.index}
          binderName={binderName}
          sectionLabels={innerCard.sectionLabels}
          pageNumbers={innerCard.pageNumbers}
          totalPages={innerCard.totalPages}
          getStackAllocations={(i) => {
            const c = innerCard.cards[i];
            const a = c ? allocations.get(c.copyId) : null;
            return a ? [a] : [];
          }}
          getStackQty={(i) => {
            const c = innerCard.cards[i];
            return c ? (qtyByCopyId?.get(c.copyId) ?? 1) : 1;
          }}
          getActions={getCardActions ? (i) => getCardActions(innerCard.cards[i]) : undefined}
          onIndexChange={(i) => setInnerCard((prev) => (prev ? { ...prev, index: i } : prev))}
          onClose={() => setInnerCard(null)}
          onEdit={
            onEditCard
              ? (c) => {
                  setInnerCard(null);
                  onEditCard(c);
                }
              : undefined
          }
        />
      )}
    </>
  );
}

function SlideGrid({
  slots,
  cols,
  rows,
  aspect,
  allocations,
  onTapCard,
}: {
  slots: (EnrichedCard | null)[];
  cols: number;
  rows: number;
  aspect: string;
  allocations: Map<string, AllocationInfo>;
  onTapCard: (card: EnrichedCard) => void;
}) {
  return (
    <div
      className="binder-pages-page"
      style={{
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gridTemplateRows: `repeat(${rows}, 1fr)`,
        aspectRatio: aspect,
      }}
    >
      {slots.map((card, i) => (
        <Cell
          key={i}
          card={card}
          allocation={card ? (allocations.get(card.copyId) ?? null) : null}
          onTap={onTapCard}
        />
      ))}
    </div>
  );
}

function Cell({
  card,
  allocation,
  onTap,
}: {
  card: EnrichedCard | null;
  allocation: AllocationInfo | null;
  onTap: (card: EnrichedCard) => void;
}) {
  if (!card) return <div className="binder-pages-cell empty" />;
  const foilStyle = classifyFoil(card);
  return (
    <button
      type="button"
      className={`binder-pages-cell${card.foil ? ` is-foil foil-${foilStyle}` : ''}${
        allocation ? ' is-allocated' : ''
      }`}
      onClick={() => onTap(card)}
      aria-label={`Open ${card.name}${card.foil ? ' (foil)' : ''}${
        allocation
          ? ` (in ${allocation.ownerKind === 'cube' ? 'cube' : 'deck'}: ${allocation.ownerName})`
          : ''
      }`}
    >
      {card.imageNormal ? (
        <CellImage src={card.imageNormal} alt={card.name} />
      ) : (
        <span className="binder-pages-cell-fallback">{card.name}</span>
      )}
      {card.foil && (
        <>
          <div className="card-preview-foil-shine" aria-hidden="true" />
          <div className="card-preview-foil-glare" aria-hidden="true" />
        </>
      )}
      {allocation && (
        <Link
          to={
            allocation.ownerKind === 'cube'
              ? `/decks/cube/${allocation.ownerId}`
              : `/decks/${allocation.ownerId}`
          }
          className="slot-deck-badge"
          style={
            {
              '--deck-color':
                allocation.ownerKind === 'cube'
                  ? 'var(--cube-color)'
                  : allocation.ownerColor || 'var(--accent)',
            } as React.CSSProperties
          }
          title={`In ${allocation.ownerKind === 'cube' ? 'cube' : 'deck'}: ${allocation.ownerName}`}
          onClick={(e) => e.stopPropagation()}
          aria-label={`Open ${allocation.ownerKind === 'cube' ? 'cube' : 'deck'} ${allocation.ownerName}`}
        >
          {allocation.ownerKind === 'cube' ? (
            <Boxes width={9} height={9} strokeWidth={2.2} aria-hidden />
          ) : (
            <Layers width={9} height={9} strokeWidth={2.2} aria-hidden />
          )}
        </Link>
      )}
    </button>
  );
}

/**
 * Renders one gutter column of index tabs (left or right) for a spread slide.
 * aria-label uses the physical pageNum from pages[] rather than the flat index.
 */
function SpreadTabGutter({
  placements,
  side,
  pages,
  onJump,
}: {
  placements: TabPlacement[];
  side: 'left' | 'right';
  pages: BinderPage[];
  onJump: (firstPageIndex: number) => void;
}) {
  return (
    <div className={`binder-spread-tab-gutter binder-spread-tab-gutter--${side}`}>
      {placements.map((placement) => {
        const physicalPageNum =
          pages[placement.firstPageIndex]?.pageNum ?? placement.firstPageIndex + 1;
        return (
          <button
            key={placement.key}
            type="button"
            className={`binder-spread-tab binder-spread-tab--${side} binder-spread-tab--${placement.variant}${placement.isCurrent ? ' is-current' : ''}`}
            style={{ top: placement.top, height: placement.height }}
            title={placement.label}
            aria-label={`Jump to ${placement.label}, page ${physicalPageNum}`}
            onClick={(e) => {
              e.stopPropagation();
              onJump(placement.firstPageIndex);
            }}
          >
            {placement.variant === 'full' ? (
              <>
                {placement.pip && <ColorPip color={placement.key} pip={true} aria-hidden />}
                <span className="binder-spread-tab-label">{placement.label}</span>
              </>
            ) : placement.pip ? (
              <ColorPip color={placement.key} pip={true} aria-hidden />
            ) : (
              <span className="binder-spread-tab-char" aria-hidden="true">
                {placement.label.charAt(0)}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// Pocket thumbnail with a skeleton placeholder until the art loads — the
// grid analogue of CardPreview's hero skeleton (shared skeleton-shimmer
// keyframe). One image per cell and binder slots are immutable while the
// flipbook is open, so a local boolean is the per-cell equivalent of
// CardPreview's id-keyed imgLoaded map.
function CellImage({ src, alt }: { src: string; alt: string }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <>
      {!loaded && <div className="binder-pages-cell-skeleton" aria-hidden="true" />}
      <img
        src={src}
        alt={alt}
        loading="lazy"
        decoding="async"
        draggable={false}
        // Cached images can be complete before onLoad attaches — mark
        // loaded on mount so the skeleton doesn't linger forever.
        ref={(el) => {
          if (el?.complete && el.naturalWidth > 0) setLoaded(true);
        }}
        onLoad={() => setLoaded(true)}
      />
    </>
  );
}
