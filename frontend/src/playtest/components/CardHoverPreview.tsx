import { useEffect, useState } from 'react';
import { useMediaQuery } from '@/lib/use-media-query';

/** Wait before showing so a pointer sweeping across the hand doesn't flicker
 *  a preview per card; focus (keyboard) shows immediately. */
const HOVER_DELAY_MS = 220;
const MARGIN = 12;

interface Props {
  /** Hidden while true — a drag in progress, or any sheet/menu open. */
  suspended: boolean;
}

interface Target {
  src: string;
  name: string;
  rect: DOMRect;
}

/**
 * Full-size card face beside the board for whatever card the pointer rests
 * on (or keyboard focus lands on). Event-delegated off `document` on the
 * `data-preview-src` attribute `PlaytestCardFace` sets, so every card
 * surface — battlefield, hand, drag overlay excluded by `suspended` — gets
 * it with no per-card wiring. Fine-pointer only: touch has no hover, and the
 * long-press → menu → Preview path already serves it.
 */
export function CardHoverPreview({ suspended }: Props) {
  const finePointer = useMediaQuery('(hover: hover) and (pointer: fine)');
  const [target, setTarget] = useState<Target | null>(null);

  useEffect(() => {
    if (!finePointer) return;
    let timer: number | null = null;
    const clear = () => {
      if (timer != null) window.clearTimeout(timer);
      timer = null;
    };
    const read = (el: Element): Target | null => {
      const src = el.getAttribute('data-preview-src');
      if (!src) return null;
      return { src, name: el.getAttribute('aria-label') ?? '', rect: el.getBoundingClientRect() };
    };
    const show = (el: Element, delay: number) => {
      clear();
      const next = read(el);
      if (!next) return;
      timer = window.setTimeout(() => setTarget(next), delay);
    };
    const hide = () => {
      clear();
      setTarget(null);
    };
    const onOver = (e: Event) => {
      const el = (e.target as Element | null)?.closest?.('[data-preview-src]');
      if (el) show(el, HOVER_DELAY_MS);
    };
    const onOut = (e: Event) => {
      const el = (e.target as Element | null)?.closest?.('[data-preview-src]');
      if (!el) return;
      const to = (e as MouseEvent).relatedTarget as Element | null;
      if (to && el.contains(to)) return;
      hide();
    };
    const onFocusIn = (e: Event) => {
      const el = (e.target as Element | null)?.closest?.('[data-preview-src]');
      if (el) show(el, 0);
      else hide();
    };
    document.addEventListener('pointerover', onOver);
    document.addEventListener('pointerout', onOut);
    document.addEventListener('pointerdown', hide);
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('scroll', hide, true);
    return () => {
      clear();
      document.removeEventListener('pointerover', onOver);
      document.removeEventListener('pointerout', onOut);
      document.removeEventListener('pointerdown', hide);
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('scroll', hide, true);
    };
  }, [finePointer]);

  if (!finePointer || suspended || !target) return null;

  // Beside the card, on whichever side has more room; vertically centred on
  // it and clamped inside the viewport.
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const width = Math.min(320, vw * 0.28);
  const height = width * 1.4;
  const roomRight = vw - target.rect.right;
  const left =
    roomRight >= width + MARGIN
      ? target.rect.right + MARGIN
      : Math.max(MARGIN, target.rect.left - MARGIN - width);
  const top = Math.max(
    MARGIN,
    Math.min(vh - height - MARGIN, target.rect.top + target.rect.height / 2 - height / 2)
  );

  return (
    <div className="playtest-hover-preview" style={{ left, top, width }} aria-hidden>
      <img src={target.src} alt="" draggable={false} decoding="async" />
    </div>
  );
}
