import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import { useCenteredSlide } from '../lib/use-centered-slide';
import { useMaxBoundaryScroll } from '../lib/use-max-boundary-scroll';

export interface SnapCarouselHandle {
  /** Scroll slide `index` to the center of the track. */
  scrollTo: (index: number, behavior?: ScrollBehavior) => void;
}

interface Props {
  /** Parent-owned ref to the track element (swipe-dismiss + gutter measuring hook onto it). */
  trackRef: RefObject<HTMLDivElement | null>;
  count: number;
  /** Controlled: the centered slide. Reported back through `onIndexChange` as the user scrolls. */
  index: number;
  onIndexChange: (index: number) => void;
  /** Only slides within `windowRadius` of the focus are rendered; the rest are bare placeholder divs. */
  renderSlide: (index: number) => ReactNode;
  windowRadius: number;
  className: string;
  slideClassName: string | ((index: number) => string);
  /** Tapping a peeking neighbor always centers it; this fires on top for the active slide too. */
  onSlideClick?: (index: number, isActive: boolean) => void;
  /** Arrow keys page the carousel while true (parents turn it off under a stacked sheet). */
  keysEnabled?: boolean;
  prevLabel?: string;
  nextLabel?: string;
}

// Placeholder ↔ full slide swaps are DOM mutations inside a snap scroller,
// and Chrome re-snaps on those — mid-gesture that yanks a trackpad swipe. The
// render window therefore follows `index` only once the scroller has been
// quiet this long. The ±windowRadius buffer keeps the deferral invisible.
const WINDOW_SETTLE_MS = 150;

/**
 * The one centered scroll-snap carousel behind both card-inspect sheets
 * (`CardPreview`, `BinderPagePreview`): native swipe, arrow keys, prev/next
 * buttons, centered-slide tracking, render windowing, and edge spacers that
 * are measured from the real first/last slide so the first and last snap
 * points sit exactly at the scroll extremes — there is no slack to swipe
 * into past either end. Styling stays with the caller via `className` /
 * `slideClassName`; this owns behavior and structure only.
 */
export const SnapCarousel = forwardRef<SnapCarouselHandle, Props>(function SnapCarousel(
  {
    trackRef,
    count,
    index,
    onIndexChange,
    renderSlide,
    windowRadius,
    className,
    slideClassName,
    onSlideClick,
    keysEnabled = true,
    prevLabel = 'Previous',
    nextLabel = 'Next',
  },
  ref
) {
  const slideRefs = useRef<Array<HTMLDivElement | null>>([]);
  const beforeRef = useRef<HTMLDivElement>(null);
  const afterRef = useRef<HTMLDivElement>(null);
  const indexRef = useRef(index);
  indexRef.current = index;

  const scrollTo = (i: number, behavior: ScrollBehavior = 'smooth') => {
    slideRefs.current[i]?.scrollIntoView({ inline: 'center', block: 'nearest', behavior });
  };
  useImperativeHandle(ref, () => ({ scrollTo }));

  const [windowCenter, setWindowCenter] = useState(index);
  const settleTimer = useRef(0);
  const settle = () => {
    window.clearTimeout(settleTimer.current);
    settleTimer.current = window.setTimeout(
      () => setWindowCenter(indexRef.current),
      WINDOW_SETTLE_MS
    );
  };
  useEffect(settle, [index]);
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    track.addEventListener('scroll', settle, { passive: true });
    return () => {
      track.removeEventListener('scroll', settle);
      window.clearTimeout(settleTimer.current);
    };
  }, [trackRef]);

  // Edge spacers: (content width − edge slide width) / 2, minus the flex gap
  // that separates spacer from slide. Measured rather than CSS-derived because
  // the first/last slide can be narrower than the rest (a lone-page binder
  // spread) and the gap is per-carousel — the old cqw formulas left the first
  // snap point an offset (up to a full gap) inside the track.
  const measure = () => {
    const track = trackRef.current;
    const first = slideRefs.current[0];
    const last = slideRefs.current[count - 1];
    if (!track || !first || !last) return;
    const cs = getComputedStyle(track);
    const inner =
      track.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0);
    const gap = parseFloat(cs.columnGap) || 0;
    const px = (w: number) => `${Math.max(0, (inner - w) / 2 - gap)}px`;
    if (beforeRef.current) beforeRef.current.style.flexBasis = px(first.offsetWidth);
    if (afterRef.current) afterRef.current.style.flexBasis = px(last.offsetWidth);
  };
  useLayoutEffect(() => {
    measure();
    const track = trackRef.current;
    if (!track || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(track);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count]);

  // Initial position: jump to the requested slide without animation (after
  // the spacers above are sized, so the target lands dead center).
  useLayoutEffect(() => {
    scrollTo(index, 'instant' as ScrollBehavior);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useCenteredSlide(trackRef, slideRefs, onIndexChange, [count]);
  useMaxBoundaryScroll(trackRef);

  useEffect(() => {
    if (!keysEnabled) return;
    const onKey = (e: KeyboardEvent) => {
      const cur = indexRef.current;
      let next: number | null = null;
      if (e.key === 'ArrowLeft') next = Math.max(0, cur - 1);
      else if (e.key === 'ArrowRight') next = Math.min(count - 1, cur + 1);
      if (next === null || next === cur) return;
      scrollTo(next);
    };
    // Capture: the sheet is the topmost overlay, so a host page's own
    // document-level key handling never preempts it.
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [keysEnabled, count]);

  return (
    <>
      <div className={className} ref={trackRef}>
        <div className="snap-spacer" ref={beforeRef} aria-hidden="true" />
        {Array.from({ length: count }, (_, i) => {
          const active = i === index;
          const cls = typeof slideClassName === 'function' ? slideClassName(i) : slideClassName;
          return (
            <div
              key={i}
              ref={(el) => {
                slideRefs.current[i] = el;
              }}
              className={`${cls}${active ? ' is-active' : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                if (!active) scrollTo(i);
                onSlideClick?.(i, active);
              }}
            >
              {Math.abs(i - windowCenter) <= windowRadius ? renderSlide(i) : null}
            </div>
          );
        })}
        <div className="snap-spacer" ref={afterRef} aria-hidden="true" />
      </div>
      {count > 1 && (
        // Same grid cell as the track (see CSS), so the arrows center on the
        // slide area and ride with it as the panel below grows.
        <div className="carousel-nav-layer">
          <button
            type="button"
            className="carousel-nav carousel-nav-prev"
            onClick={(e) => {
              e.stopPropagation();
              scrollTo(index - 1);
            }}
            disabled={index <= 0}
            aria-label={prevLabel}
          >
            <ChevronLeft width={20} height={20} strokeWidth={2.4} aria-hidden />
          </button>
          <button
            type="button"
            className="carousel-nav carousel-nav-next"
            onClick={(e) => {
              e.stopPropagation();
              scrollTo(index + 1);
            }}
            disabled={index >= count - 1}
            aria-label={nextLabel}
          >
            <ChevronRight width={20} height={20} strokeWidth={2.4} aria-hidden />
          </button>
        </div>
      )}
    </>
  );
});
