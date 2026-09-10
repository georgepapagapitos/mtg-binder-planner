import { describe, expect, it } from 'vitest';
import type { CollisionDetection } from '@dnd-kit/core';
import type { PlaytestCard } from '@/lib/playtest';
import { makePlaytestCollision } from './attach-drop';
import { hostDroppableId, hostFromDroppableId, isPlaytestAttachment } from './zones';

describe('isPlaytestAttachment', () => {
  it.each([
    ['Enchantment — Aura', true],
    ['Artifact — Equipment', true],
    ['Legendary Artifact — Equipment', true],
    ['Artifact — Fortification', true],
    ['Creature — Human Knight', false],
    ['Enchantment — Saga', false],
    ['Artifact', false],
    [undefined, false],
  ])('%s → %s', (typeLine, expected) => {
    expect(isPlaytestAttachment(typeLine as string | undefined)).toBe(expected);
  });
});

describe('host droppable ids', () => {
  it('round-trips and rejects other droppables', () => {
    expect(hostFromDroppableId(hostDroppableId('abc'))).toBe('abc');
    expect(hostFromDroppableId('battlefield')).toBeNull();
    expect(hostFromDroppableId('zone:graveyard')).toBeNull();
    expect(hostFromDroppableId(null)).toBeNull();
  });
});

/** Minimal dnd-kit collision args: one battlefield droppable containing two
 *  card hosts; the pointer sits over host `c2`. */
function args(activeCardId: string): Parameters<CollisionDetection>[0] {
  const rect = (left: number, top: number, w: number, h: number) => ({
    left,
    top,
    width: w,
    height: h,
    right: left + w,
    bottom: top + h,
  });
  const droppableRects = new Map<string, ReturnType<typeof rect>>([
    ['battlefield', rect(0, 0, 1000, 600)],
    [hostDroppableId('c1'), rect(20, 20, 100, 140)],
    [hostDroppableId('c2'), rect(300, 20, 100, 140)],
  ]);
  return {
    active: { id: `bf:${activeCardId}`, data: { current: { cardId: activeCardId } } },
    collisionRect: rect(320, 40, 100, 140),
    droppableRects,
    droppableContainers: [...droppableRects.keys()].map((id) => ({
      id,
      data: { current: undefined },
      disabled: false,
      node: { current: null },
      rect: { current: droppableRects.get(id)! },
      key: id,
    })),
    pointerCoordinates: { x: 350, y: 90 },
  } as unknown as Parameters<CollisionDetection>[0];
}

describe('makePlaytestCollision', () => {
  const cards: Record<string, PlaytestCard> = {
    aura: { id: 'aura', name: 'Rancor', typeLine: 'Enchantment — Aura' },
    bear: { id: 'bear', name: 'Grizzly Bears', typeLine: 'Creature — Bear' },
  };
  const detect = makePlaytestCollision((id) => cards[id]);

  it('reports the permanent under the pointer as a host when dragging an Aura', () => {
    const hits = detect(args('aura'));
    expect(hits.map((h) => String(h.id))).toEqual([hostDroppableId('c2')]);
  });

  it('never reports a host for an ordinary permanent — a nudge is a reposition', () => {
    const hits = detect(args('bear')).map((h) => String(h.id));
    expect(hits).toContain('battlefield');
    expect(hits.some((id) => id.startsWith('host:'))).toBe(false);
  });

  it('never offers a card as its own host', () => {
    const hits = detect({
      ...args('c2'),
      active: { id: 'bf:c2', data: { current: { cardId: 'c2' } } },
    } as never);
    expect(hits.map((h) => String(h.id)).some((id) => id === hostDroppableId('c2'))).toBe(false);
  });
});
