import { useState } from 'react';

/**
 * How many of `ids` have appeared since the viewer last LOOKED — the
 * "(N new)" badge on an opponent's rail entry (Forge's unseen-changes tab
 * badge). "Looked" is the caller's call: while `watching` is true (their
 * board inspector is open) every arrival is seen as it lands and the count
 * stays 0; when it closes, the baseline is whatever was on screen at that
 * moment. The first render seeds the baseline with everything, so a seat's
 * first board (or a reconnect catch-up) never badges.
 *
 * Same render-phase "adjust state when a prop changes" shape as
 * `useNewCardIds` (and the same string-key trick: `ids` is a fresh array
 * every render), for the same lint reasons documented there.
 */
export function useUnseenChanges(ids: readonly string[], watching: boolean): number {
  const key = ids.join(' ');
  const [seen, setSeen] = useState<ReadonlySet<string>>(() => new Set(ids));
  const [prevKey, setPrevKey] = useState(key);
  const [prevWatching, setPrevWatching] = useState(watching);

  if (key !== prevKey || watching !== prevWatching) {
    setPrevKey(key);
    setPrevWatching(watching);
    if (watching) {
      // Everything currently visible is, by definition, seen.
      setSeen(new Set(ids));
    } else if (prevWatching) {
      // Just stopped watching: the baseline is what was on screen.
      setSeen(new Set(ids));
    }
  }

  if (watching) return 0;
  let n = 0;
  for (const id of ids) if (!seen.has(id)) n++;
  return n;
}
