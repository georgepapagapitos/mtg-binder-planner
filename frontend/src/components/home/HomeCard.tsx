import './HomeCard.css';
import type { LucideIcon } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { readHomeShape, rememberHomeShape } from '../../lib/home-shape';

interface Props {
  title: string;
  icon?: LucideIcon;
  /** Count pill next to the title. Omitted/0 renders no badge. */
  badge?: number;
  loading: boolean;
  error?: string | null;
  onRetry?: () => void;
  empty?: boolean;
  emptyText?: string;
  viewAllHref?: string;
  viewAllLabel?: string;
  children: ReactNode;
}

/**
 * Shared shell every /home bento card mounts into: title + optional badge,
 * then exactly one of a loading skeleton, an empty line, an error + Retry, or
 * the card's own content — plus an optional "View all" footer link.
 *
 * While loading, the shell takes the footprint it resolved to on this
 * browser's last visit (lib/home-shape, keyed by title): a card that ended
 * up empty skeletons as the collapsed row (already `order`ed to the bottom),
 * a card that had content reserves its last height. Resolving then happens
 * in place instead of reflowing the whole board (E277).
 */
export function HomeCard({
  title,
  icon: Icon,
  badge,
  loading,
  error,
  onRetry,
  empty,
  emptyText,
  viewAllHref,
  viewAllLabel,
  children,
}: Props) {
  // Read once at mount — the reservation only matters for the first paint.
  const [remembered] = useState(() => readHomeShape()[title]);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (loading || error) return;
    // Measured, not derived: with the bento's row-stretch the card's box IS
    // the row height, which is exactly what the next visit must reserve.
    // Floors at 1 so "present, height unknown" (jsdom) never reads as empty.
    rememberHomeShape(title, empty ? 0 : Math.max(1, ref.current?.offsetHeight ?? 0));
  });

  // Empty (and not loading/erroring) collapses to a one-line invitation row
  // instead of the full shell — STYLE_GUIDE "Home signal cards" ruling.
  const collapsed = loading ? remembered === 0 : !error && empty;
  if (collapsed) {
    return (
      <div className="home-card home-card--empty" ref={ref}>
        {Icon && <Icon width={14} height={14} strokeWidth={1.8} aria-hidden />}
        <h2 className="home-card-title">{title}</h2>
        {loading ? (
          <span
            className="home-card-empty home-card-skeleton-bar"
            role="status"
            aria-label="Loading"
            aria-busy="true"
          />
        ) : (
          <span className="home-card-empty">{emptyText ?? 'Nothing here yet.'}</span>
        )}
        {!loading && viewAllHref && (
          <Link to={viewAllHref} className="home-card-view-all">
            {viewAllLabel ?? 'View all'}
          </Link>
        )}
      </div>
    );
  }

  const reserved = loading && typeof remembered === 'number' && remembered > 1;
  return (
    <div className="home-card" ref={ref} style={reserved ? { minHeight: remembered } : undefined}>
      <div className="home-card-header">
        <h2 className="home-card-title">
          {Icon && <Icon width={14} height={14} strokeWidth={1.8} aria-hidden />}
          {title}
        </h2>
        {!!badge && badge > 0 && <span className="home-card-badge">{badge}</span>}
      </div>
      <div className="home-card-body">
        {loading ? (
          <div className="home-card-skeleton" role="status" aria-label="Loading" aria-busy="true">
            <span className="home-card-skeleton-bar" />
            <span className="home-card-skeleton-bar" />
            <span className="home-card-skeleton-bar" />
          </div>
        ) : error ? (
          <div className="home-card-error" role="alert">
            <span>{error}</span>
            {onRetry && (
              <button
                type="button"
                className="home-card-retry"
                aria-label={`Retry loading ${title}`}
                onClick={onRetry}
              >
                Retry
              </button>
            )}
          </div>
        ) : (
          children
        )}
      </div>
      {viewAllHref && (
        <Link to={viewAllHref} className="home-card-view-all">
          {viewAllLabel ?? 'View all'}
        </Link>
      )}
    </div>
  );
}
