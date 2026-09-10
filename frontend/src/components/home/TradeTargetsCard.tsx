import './TradeTargetsCard.css';
import { useMemo } from 'react';
import { Target } from 'lucide-react';
import { useCollectionStore } from '../../store/collection';
import { aggregateTradeTargets } from '../../lib/home-signals';
import { findPriceTargetHits } from '../../lib/price-alerts';
import { formatMoney } from '../../lib/format-money';
import { HomeCard } from './HomeCard';

const DISPLAY_LIMIT = 4;

/**
 * Home's trade-targets summary — static want-list entries the owner is still
 * short copies of, aggregated across every list (home-signals.ts's
 * `aggregateTradeTargets`). Prices render in each entry's own stamped
 * currency (never the viewer's display default — see `ListEntry.currency`).
 * A row whose live price is currently AT OR UNDER its target (T117 —
 * `findPriceTargetHits`, matched by name since this view is already
 * name-deduped across lists) gets an "Under target" badge — the toast that
 * fires on the crossing (store/collection.ts's price-refresh tick) is a
 * moment-in-time nudge; this is the always-visible surface it points back to.
 *
 * Insight-only, no invitation value when empty: unlike every other Home
 * card, this renders nothing rather than an empty shell (STYLE_GUIDE "Home
 * signal cards" — insight surfaces never displace content with a placeholder
 * that has nothing to invite the user toward).
 */
export function TradeTargetsCard() {
  const lists = useCollectionStore((s) => s.lists);
  const cards = useCollectionStore((s) => s.cards);

  const rows = useMemo(() => aggregateTradeTargets(lists, cards), [lists, cards]);
  const underTargetNames = useMemo(
    () => new Set(findPriceTargetHits(lists).map((h) => h.name.toLowerCase())),
    [lists]
  );

  if (rows.length === 0) return null;

  const visible = rows.slice(0, DISPLAY_LIMIT);

  return (
    <HomeCard
      title="Trade targets"
      icon={Target}
      loading={false}
      badge={rows.length}
      viewAllHref="/collection/lists"
      viewAllLabel="View lists"
    >
      <ul className="home-trade-targets-list">
        {visible.map((row) => (
          <li key={row.name.toLowerCase()} className="home-trade-target-row">
            <span className="home-trade-target-info">
              <span className="home-trade-target-name">{row.name}</span>
              <span className="home-trade-target-list">
                {row.listNames[0]}
                {row.listNames.length > 1 && ` +${row.listNames.length - 1} more`}
              </span>
            </span>
            {underTargetNames.has(row.name.toLowerCase()) && (
              <span className="home-trade-target-under">Under target</span>
            )}
            {row.targetPrice !== undefined && (
              <span className="home-trade-target-price">
                {formatMoney(row.targetPrice, { currency: row.currency ?? 'USD' })}
              </span>
            )}
          </li>
        ))}
      </ul>
    </HomeCard>
  );
}
