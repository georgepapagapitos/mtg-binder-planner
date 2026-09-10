// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import { CardHoverPreview } from './CardHoverPreview';

function stubMatchMedia(matches: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    onchange: null,
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

function cardEl(src?: string) {
  const el = document.createElement('div');
  if (src) el.setAttribute('data-preview-src', src);
  el.setAttribute('aria-label', 'Sol Ring');
  el.tabIndex = 0;
  document.body.appendChild(el);
  return el;
}

describe('CardHoverPreview', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('shows the full face after a short hover on a fine pointer, and hides on leave', () => {
    stubMatchMedia(true);
    render(<CardHoverPreview suspended={false} />);
    const el = cardEl('https://img/sol-ring.jpg');
    act(() => {
      el.dispatchEvent(new Event('pointerover', { bubbles: true }));
    });
    expect(document.querySelector('.playtest-hover-preview')).toBeNull(); // not yet
    act(() => {
      vi.advanceTimersByTime(250);
    });
    const img = document.querySelector<HTMLImageElement>('.playtest-hover-preview img');
    expect(img?.getAttribute('src')).toBe('https://img/sol-ring.jpg');
    act(() => {
      el.dispatchEvent(new Event('pointerout', { bubbles: true }));
    });
    expect(document.querySelector('.playtest-hover-preview')).toBeNull();
  });

  it('shows immediately on keyboard focus', () => {
    stubMatchMedia(true);
    render(<CardHoverPreview suspended={false} />);
    const el = cardEl('https://img/a.jpg');
    act(() => {
      el.dispatchEvent(new Event('focusin', { bubbles: true }));
      vi.advanceTimersByTime(0);
    });
    expect(document.querySelector('.playtest-hover-preview')).not.toBeNull();
  });

  it('never shows for a card without a preview source (face-down), nor while suspended, nor on touch', () => {
    stubMatchMedia(true);
    const { rerender } = render(<CardHoverPreview suspended={false} />);
    const faceDown = cardEl(undefined);
    act(() => {
      faceDown.dispatchEvent(new Event('pointerover', { bubbles: true }));
      vi.advanceTimersByTime(500);
    });
    expect(document.querySelector('.playtest-hover-preview')).toBeNull();

    const el = cardEl('https://img/b.jpg');
    rerender(<CardHoverPreview suspended />);
    act(() => {
      el.dispatchEvent(new Event('pointerover', { bubbles: true }));
      vi.advanceTimersByTime(500);
    });
    expect(document.querySelector('.playtest-hover-preview')).toBeNull();

    document.body.innerHTML = '';
    stubMatchMedia(false);
    render(<CardHoverPreview suspended={false} />);
    const touch = cardEl('https://img/c.jpg');
    act(() => {
      touch.dispatchEvent(new Event('pointerover', { bubbles: true }));
      vi.advanceTimersByTime(500);
    });
    expect(document.querySelector('.playtest-hover-preview')).toBeNull();
  });
});
