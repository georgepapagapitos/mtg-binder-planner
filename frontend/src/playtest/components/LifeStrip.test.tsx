// @vitest-environment happy-dom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { OpponentLife } from '@/lib/playtest';
import { makePlayer, type GamePlayer } from '@/lib/game-state';
import type { OnlineTable } from '../hooks/use-online-table';
import { LifeStrip } from './LifeStrip';

function soloProps() {
  return {
    life: 40,
    opponents: [] as OpponentLife[],
    commanderDamageThreshold: 21,
    isNarrow: false,
    monarch: false,
    initiative: false,
    citysBlessing: false,
    playerCounters: {},
    onAdjustLife: vi.fn(),
    onAdjustCommanderDamage: vi.fn(),
    onAdjustCounter: vi.fn(),
    onlineTable: null,
  };
}

/** `makePlayer` derives `life` from `startingLife` and always zeroes
 *  `poison` — neither can be dialed in through its own input, so this
 *  overrides them on the result instead of fighting its signature. */
function player(opts: {
  seat: number;
  name: string;
  life?: number;
  poison?: number;
  partner?: string | null;
}): GamePlayer {
  const base = makePlayer({
    id: `p${opts.seat}`,
    userId: `u${opts.seat}`,
    seat: opts.seat,
    name: opts.name,
    startingLife: opts.life ?? 40,
    partner: opts.partner,
  });
  return { ...base, life: opts.life ?? base.life, poison: opts.poison ?? 0 };
}

function onlineTable(overrides: Partial<OnlineTable> = {}): OnlineTable {
  const me = player({ seat: 0, name: 'Me', life: 40 });
  const maya = player({ seat: 1, name: 'Maya', life: 34 });
  const dispatch = vi.fn();
  return {
    activeSeat: null,
    mySeat: 0,
    me,
    players: [me, maya],
    // Unused by LifeStrip's online branch (it renders off `players`, not
    // `opponents` — that field feeds OpponentRail instead).
    opponents: [],
    phase: undefined,
    poisonEnabled: false,
    commanderDamageEnabled: true,
    designations: { monarch: null, initiative: null },
    dispatch,
    ...overrides,
  };
}

describe('LifeStrip — solo mode (unchanged)', () => {
  it('renders the local life total, not a table', () => {
    render(<LifeStrip {...soloProps()} />);
    expect(screen.getByRole('button', { name: /You: 40 life/ })).toBeTruthy();
  });
});

describe('LifeStrip — online mode', () => {
  it('renders real seats (You + opponent by name), never the solo virtual opponents', () => {
    const table = onlineTable();
    render(
      <LifeStrip
        {...soloProps()}
        life={999} // local playtest life — must NOT appear anywhere
        opponents={[{ life: 1, commanderDamage: 0 }]} // solo virtual opponent — must NOT render
        onlineTable={table}
      />
    );
    expect(screen.getByText('You')).toBeTruthy();
    expect(screen.getByText('Maya')).toBeTruthy();
    expect(screen.queryByText('999')).toBeNull();
    expect(screen.queryByText('Opponent')).toBeNull();
  });

  it('shows the table life for both seats, not the local playtest life', () => {
    render(<LifeStrip {...soloProps()} life={7} onlineTable={onlineTable()} />);
    expect(screen.getByText('40')).toBeTruthy(); // me.life
    expect(screen.getByText('34')).toBeTruthy(); // Maya's life
    expect(screen.queryByText('7')).toBeNull();
  });

  it('marks the active seat with is-active-turn', () => {
    const table = onlineTable({ activeSeat: 1 });
    render(<LifeStrip {...soloProps()} onlineTable={table} />);
    const mayaChip = screen.getByText('Maya').closest('button')!;
    expect(mayaChip.className).toContain('is-active-turn');
    const meChip = screen.getByText('You').closest('button')!;
    expect(meChip.className).not.toContain('is-active-turn');
  });

  it('shows a poison badge only when poisonEnabled and poison > 0', () => {
    const table = onlineTable({
      poisonEnabled: true,
      players: [
        player({ seat: 0, name: 'Me', life: 40, poison: 3 }),
        player({ seat: 1, name: 'Maya', life: 34, poison: 0 }),
      ],
      me: player({ seat: 0, name: 'Me', life: 40, poison: 3 }),
    });
    render(<LifeStrip {...soloProps()} onlineTable={table} />);
    expect(screen.getByText('☠ 3')).toBeTruthy();
  });

  it("opens my panel with an editable life stepper dispatching the online 'life' action", () => {
    const table = onlineTable();
    render(<LifeStrip {...soloProps()} onlineTable={table} />);
    fireEvent.click(screen.getByText('You').closest('button')!);
    fireEvent.click(screen.getByRole('button', { name: 'Life +1' }));
    expect(table.dispatch).toHaveBeenCalledWith({
      type: 'life',
      seat: 0,
      delta: 1,
      actorSeat: 0,
    });
  });

  it("opens an opponent's panel read-only, with the 'only they can change their life' note and a View board button", () => {
    const table = onlineTable();
    const onViewOpponentBoard = vi.fn();
    render(
      <LifeStrip {...soloProps()} onlineTable={table} onViewOpponentBoard={onViewOpponentBoard} />
    );
    fireEvent.click(screen.getByText('Maya').closest('button')!);
    expect(screen.getByText('Only Maya can change their life.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'View board' }));
    expect(onViewOpponentBoard).toHaveBeenCalledWith(1);
  });

  it('steps commander damage FROM an opponent onto MY OWN seat', () => {
    const table = onlineTable();
    render(<LifeStrip {...soloProps()} onlineTable={table} />);
    fireEvent.click(screen.getByText('Maya').closest('button')!);
    fireEvent.click(screen.getByRole('button', { name: 'Commander damage from Maya +1' }));
    expect(table.dispatch).toHaveBeenCalledWith({
      type: 'cmd-dmg',
      seat: 0,
      fromSeat: 1,
      fromPartner: false,
      delta: 1,
      actorSeat: 0,
    });
  });
});
