// @vitest-environment happy-dom
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { createRef, useRef } from 'react';
import { SnapCarousel, type SnapCarouselHandle } from './SnapCarousel';

beforeAll(() => {
  // happy-dom has no layout: stub the scroll/observe APIs the carousel uses.
  Element.prototype.scrollIntoView = vi.fn();
  globalThis.IntersectionObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
    root = null;
    rootMargin = '';
    thresholds = [];
  } as unknown as typeof IntersectionObserver;
});

function Harness({
  index,
  count = 5,
  handle,
}: {
  index: number;
  count?: number;
  handle?: React.Ref<SnapCarouselHandle>;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  return (
    <SnapCarousel
      ref={handle}
      trackRef={trackRef}
      count={count}
      index={index}
      onIndexChange={() => {}}
      windowRadius={1}
      className="track"
      slideClassName="slide"
      renderSlide={(i) => <span>slide {i}</span>}
    />
  );
}

describe('SnapCarousel', () => {
  it('renders every slide slot plus two edge spacers, but only windowed content', () => {
    const { container } = render(<Harness index={2} />);
    expect(container.querySelectorAll('.slide').length).toBe(5);
    expect(container.querySelectorAll('.snap-spacer').length).toBe(2);
    expect(container.querySelector('.slide.is-active')?.textContent).toBe('slide 2');
    // windowRadius 1 → slides 1..3 rendered, 0 and 4 are bare placeholders.
    expect(screen.queryByText('slide 0')).toBeNull();
    expect(screen.getByText('slide 3')).toBeTruthy();
  });

  it('disables prev at the first slide and next at the last', () => {
    const { rerender } = render(<Harness index={0} />);
    expect((screen.getByLabelText('Previous') as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByLabelText('Next') as HTMLButtonElement).disabled).toBe(false);
    rerender(<Harness index={4} />);
    expect((screen.getByLabelText('Next') as HTMLButtonElement).disabled).toBe(true);
  });

  it('marks the track is-scrolling while it moves and clears it once quiet', () => {
    vi.useFakeTimers();
    try {
      const { container } = render(<Harness index={0} />);
      const track = container.querySelector('.track') as HTMLDivElement;
      fireEvent.scroll(track);
      expect(track.classList.contains('is-scrolling')).toBe(true);
      vi.advanceTimersByTime(100);
      fireEvent.scroll(track); // still moving — the quiet window restarts
      vi.advanceTimersByTime(100);
      expect(track.classList.contains('is-scrolling')).toBe(true);
      vi.advanceTimersByTime(100);
      expect(track.classList.contains('is-scrolling')).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('arrow keys and the ref handle scroll the target slide into view', () => {
    const handle = createRef<SnapCarouselHandle>();
    render(<Harness index={1} handle={handle} />);
    const spy = vi.spyOn(Element.prototype, 'scrollIntoView').mockClear();
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(spy).toHaveBeenCalledTimes(1);
    handle.current?.scrollTo(3, 'instant');
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy.mock.calls[1][0]).toMatchObject({ inline: 'center', behavior: 'instant' });
    spy.mockRestore();
  });
});
