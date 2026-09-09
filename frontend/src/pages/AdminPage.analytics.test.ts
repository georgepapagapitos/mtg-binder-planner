import { describe, expect, it } from 'vitest';
import { groupErrors, summarizeVitals } from './AdminPage';

describe('groupErrors', () => {
  it('sums a distinct error across days and keeps its latest sighting', () => {
    const row = { kind: 'error' as const, path: '/play', message: 'boom', frame: 'a.js:1:1' };
    const grouped = groupErrors([
      { ...row, day: '2026-09-08', count: 3, last_seen: '2026-09-08 10:00:00+00' },
      { ...row, day: '2026-09-09', count: 5, last_seen: '2026-09-09 10:00:00+00' },
      {
        ...row,
        frame: 'b.js:2:2',
        day: '2026-09-09',
        count: 1,
        last_seen: '2026-09-09 11:00:00+00',
      },
    ]);
    expect(grouped.map((g) => [g.frame, g.count, g.days, g.last_seen])).toEqual([
      ['a.js:1:1', 8, 2, '2026-09-09 10:00:00+00'],
      ['b.js:2:2', 1, 1, '2026-09-09 11:00:00+00'],
    ]);
  });
});

describe('summarizeVitals', () => {
  it('passes at p75 when at least three quarters of samples are good, failing rows first', () => {
    const out = summarizeVitals([
      { day: 'd', path: '/', metric: 'LCP', rating: 'good', count: 75 },
      { day: 'd', path: '/', metric: 'LCP', rating: 'poor', count: 25 },
      { day: 'd', path: '/decks', metric: 'CLS', rating: 'good', count: 2 },
      { day: 'd', path: '/decks', metric: 'CLS', rating: 'needs-improvement', count: 2 },
    ]);
    expect(out.map((r) => [r.metric, r.path, r.samples, r.passes])).toEqual([
      ['CLS', '/decks', 4, false],
      ['LCP', '/', 100, true],
    ]);
  });
});
