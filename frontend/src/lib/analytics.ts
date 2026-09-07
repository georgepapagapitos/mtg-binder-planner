import { apiUrl } from './api-base';

/**
 * First-party, cookieless usage beacon (see backend/src/routes/events.ts).
 * Sends only an event name and a normalized path — no ids, no user data —
 * so an aggregate counter is all the server can ever hold. Fire-and-forget:
 * a failed beacon is silently dropped.
 */
export type EventName =
  | 'pageview'
  | 'import_started'
  | 'sample_loaded'
  | 'browse_decks'
  | 'sign_in'
  | 'guide_cta';

const ID_ROUTES =
  /^\/(s|d|u|gn|pods|friends|decks\/cube|decks|collection\/(?:binders|lists|sets))\/([^/]+)(\/.*)?$/;
const STATIC_SECOND = new Set(['new', 'discover', 'saved', 'compare', 'cube', 'combos']);

/** Collapse per-entity segments so counters stay low-cardinality and free of tokens/slugs. */
export function normalizePath(pathname: string): string {
  const m = ID_ROUTES.exec(pathname);
  if (!m) return pathname;
  const [, prefix, seg, rest] = m;
  if (prefix === 'decks' && STATIC_SECOND.has(seg)) return pathname;
  return `/${prefix}/:id${rest ? '/*' : ''}`;
}

export function track(name: EventName, path: string = window.location.pathname): void {
  const body = JSON.stringify({ name, path: normalizePath(path) });
  try {
    if (
      navigator.sendBeacon?.(apiUrl('/api/events'), new Blob([body], { type: 'application/json' }))
    ) {
      return;
    }
    void fetch(apiUrl('/api/events'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Beacons are best-effort by definition.
  }
}
