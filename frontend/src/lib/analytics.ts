import { apiUrl } from './api-base';

/**
 * First-party, cookieless beacon (see backend/src/routes/events.ts).
 *
 * Three shapes ride one endpoint, and every one sends only an event name, a
 * normalized path, and low-cardinality strings — no ids, no user data — so an
 * aggregate counter is all the server can ever hold:
 *
 *  - usage events (`track`): a name and a path.
 *  - client errors (`reportError`): the exception's message and the script
 *    frame it came from, for uncaught errors, unhandled rejections, and
 *    render crashes the ErrorBoundary catches. Deduped per page load and
 *    capped, so a looping error is one beacon, not a flood.
 *  - web vitals (`startVitals`): LCP, CLS and INP for the page load, sent
 *    once when the page is hidden. The server keeps the band, not the value.
 *
 * Fire-and-forget: a failed beacon is silently dropped.
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

function send(payload: Record<string, unknown>): void {
  const body = JSON.stringify(payload);
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

export function track(name: EventName, path: string = window.location.pathname): void {
  send({ name, path: normalizePath(path) });
}

// ---------------------------------------------------------------------------
// Client errors

export type ErrorKind = 'error' | 'rejection' | 'render';

/** Browser noise that is not a defect: benign observer warnings, aborted navigations. */
const IGNORED = /ResizeObserver loop|AbortError|The operation was aborted/;
const MAX_ERRORS_PER_LOAD = 10;
const seen = new Set<string>();

/**
 * Message + top stack frame for an unknown thrown value. The frame is the
 * first stack line that names a script, trimmed to `<file>:<line>:<col>` so
 * the server can key on it; origin and query are dropped so the row never
 * carries a token that happened to be in a URL.
 */
export function describeError(value: unknown): { message: string; frame: string } {
  const err = value as { message?: unknown; stack?: unknown } | null;
  const message =
    typeof err?.message === 'string' && err.message
      ? err.message
      : typeof value === 'string'
        ? value
        : String(value ?? 'Unknown error');
  const stack = typeof err?.stack === 'string' ? err.stack : '';
  const line = stack.split('\n').find((l) => /\.[cm]?js(\?[^:]*)?:\d+/.test(l)) ?? '';
  const m = /([^\s/()]+\.[cm]?js)(?:\?[^:]*)?:(\d+):(\d+)/.exec(line);
  const frame = m ? `${m[1]}:${m[2]}:${m[3]}` : '';
  return { message: message.slice(0, 500), frame };
}

export function reportError(kind: ErrorKind, value: unknown): void {
  const { message, frame } = describeError(value);
  if (IGNORED.test(message)) return;
  const key = `${kind}|${message}|${frame}`;
  if (seen.has(key) || seen.size >= MAX_ERRORS_PER_LOAD) return;
  seen.add(key);
  send({ name: 'error', path: normalizePath(window.location.pathname), kind, message, frame });
}

/** Window-level listeners; the ErrorBoundary covers render crashes itself. */
export function installErrorReporting(): void {
  window.addEventListener('error', (e) => reportError('error', e.error ?? e.message));
  window.addEventListener('unhandledrejection', (e) => reportError('rejection', e.reason));
}

// ---------------------------------------------------------------------------
// Web vitals

export type VitalMetric = 'LCP' | 'CLS' | 'INP';

interface LayoutShiftEntry extends PerformanceEntry {
  value: number;
  hadRecentInput: boolean;
}

/**
 * Largest CLS session window: shifts less than 1s apart and inside a 5s
 * window group into one session; the page's CLS is its largest session.
 * Mirrors the web-vitals library's definition.
 */
export function clsSessionMax(shifts: { startTime: number; value: number }[]): number {
  let max = 0;
  let session = 0;
  let first = 0;
  let prev = 0;
  for (const s of shifts) {
    if (session && s.startTime - prev < 1000 && s.startTime - first < 5000) session += s.value;
    else {
      session = s.value;
      first = s.startTime;
    }
    prev = s.startTime;
    if (session > max) max = session;
  }
  return max;
}

/**
 * Observe the page load's vitals and beacon them once, when the page is
 * first hidden. Attributed to the path the load started on. INP is the
 * slowest interaction seen, which is the web-vitals value for pages with
 * fewer than fifty interactions and slightly pessimistic beyond that.
 */
export function startVitals(): void {
  if (typeof PerformanceObserver === 'undefined' || document.visibilityState === 'hidden') return;
  const supported = PerformanceObserver.supportedEntryTypes ?? [];
  const path = normalizePath(window.location.pathname);
  const shifts: { startTime: number; value: number }[] = [];
  let lcp = -1;
  let inp = -1;
  const observe = (type: string, cb: (entries: PerformanceEntry[]) => void, opts = {}) => {
    if (!supported.includes(type)) return;
    try {
      new PerformanceObserver((list) => cb(list.getEntries())).observe({
        type,
        buffered: true,
        ...opts,
      });
    } catch {
      // An observer type the browser lists but refuses is a skipped metric.
    }
  };
  observe('largest-contentful-paint', (entries) => {
    lcp = entries[entries.length - 1]?.startTime ?? lcp;
  });
  observe('layout-shift', (entries) => {
    for (const e of entries as LayoutShiftEntry[]) {
      if (!e.hadRecentInput) shifts.push({ startTime: e.startTime, value: e.value });
    }
  });
  observe(
    'event',
    (entries) => {
      for (const e of entries) if (e.duration > inp) inp = e.duration;
    },
    { durationThreshold: 40 }
  );
  let sent = false;
  const flush = () => {
    if (sent || document.visibilityState !== 'hidden') return;
    sent = true;
    if (lcp >= 0) send({ name: 'vital', path, metric: 'LCP', value: Math.round(lcp) });
    if (shifts.length) send({ name: 'vital', path, metric: 'CLS', value: clsSessionMax(shifts) });
    else if (supported.includes('layout-shift'))
      send({ name: 'vital', path, metric: 'CLS', value: 0 });
    if (inp >= 0) send({ name: 'vital', path, metric: 'INP', value: Math.round(inp) });
  };
  document.addEventListener('visibilitychange', flush);
  window.addEventListener('pagehide', flush);
}
