// @vitest-environment happy-dom
/**
 * B6-04: a compact "back" control the ActionBar only shows when the caller
 * supplies one — the short-landscape tier folds `.playtest-page__header`'s
 * back-navigation in here (CSS-gated); every other tier omits it entirely,
 * since `.playtest-page__header` already covers it there.
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ActionBar } from './ActionBar';

function baseProps() {
  return {
    turn: 1,
    libraryCount: 60,
    isNarrow: false,
    onDraw: vi.fn(),
    onShuffle: vi.fn(),
    onMulligan: vi.fn(),
    onUntapAll: vi.fn(),
    onNextTurn: vi.fn(),
    onReset: vi.fn(),
    takeback: {
      stepsAvailable: 0,
      verdict: 'none' as const,
      mode: 'ask' as const,
      boundaryReason: null,
      isPending: false,
      onClick: vi.fn(),
      onOpenSettings: vi.fn(),
    },
    onScry: vi.fn(),
    onCreateToken: vi.fn(),
    onOpenStats: vi.fn(),
    onOpenLog: vi.fn(),
    onOpenDice: vi.fn(),
    onOpenResistance: vi.fn(),
    onOpenDesignations: vi.fn(),
    selectMode: false,
    onToggleSelectMode: vi.fn(),
    selectionSize: 0,
    resistanceLevel: 'off' as const,
    monarch: false,
    initiative: false,
    citysBlessing: false,
    hasUnreadLog: false,
  };
}

describe('ActionBar — back button (B6-04)', () => {
  it('omits the back button when onBack is not supplied', () => {
    render(<ActionBar {...baseProps()} />);
    expect(screen.queryByRole('button', { name: /^←/ })).toBeNull();
  });

  it('renders and wires the back button when supplied', () => {
    const onBack = vi.fn();
    render(<ActionBar {...baseProps()} deckName="Abigale" onBack={onBack} />);
    const btn = screen.getByRole('button', { name: '← Abigale' });
    fireEvent.click(btn);
    expect(onBack).toHaveBeenCalledOnce();
  });
});
