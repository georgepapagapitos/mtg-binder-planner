// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useUnseenChanges } from './use-unseen-changes';

describe('useUnseenChanges', () => {
  it('never badges the first board it sees, then counts arrivals until the viewer looks', () => {
    const { result, rerender } = renderHook(
      ({ ids, watching }: { ids: string[]; watching: boolean }) => useUnseenChanges(ids, watching),
      { initialProps: { ids: ['a', 'b'], watching: false } }
    );
    expect(result.current).toBe(0);
    rerender({ ids: ['a', 'b', 'c'], watching: false });
    expect(result.current).toBe(1);
    rerender({ ids: ['a', 'b', 'c', 'd'], watching: false });
    expect(result.current).toBe(2);
    // A full-board republish of the same cards adds nothing.
    rerender({ ids: ['a', 'b', 'c', 'd'], watching: false });
    expect(result.current).toBe(2);
    // Opening the inspector clears it; arrivals while open are seen live.
    rerender({ ids: ['a', 'b', 'c', 'd'], watching: true });
    expect(result.current).toBe(0);
    rerender({ ids: ['a', 'b', 'c', 'd', 'e'], watching: true });
    expect(result.current).toBe(0);
    // Closing sets the baseline to what was on screen; the next arrival counts.
    rerender({ ids: ['a', 'b', 'c', 'd', 'e'], watching: false });
    expect(result.current).toBe(0);
    rerender({ ids: ['a', 'b', 'c', 'd', 'e', 'f'], watching: false });
    expect(result.current).toBe(1);
  });

  it('does not count a card that left and never came back', () => {
    const { result, rerender } = renderHook(
      ({ ids }: { ids: string[] }) => useUnseenChanges(ids, false),
      { initialProps: { ids: ['a', 'b'] } }
    );
    rerender({ ids: ['a'] });
    expect(result.current).toBe(0);
  });
});
