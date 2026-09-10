import { useDroppable } from '@dnd-kit/core';
import type { PlaytestCard } from '@/lib/playtest';
import { PlaytestCardView } from './PlaytestCardView';

interface Props {
  cards: PlaytestCard[];
  onCardClick?(cardId: string, index: number): void;
  /** Open the hand-card menu (HandCardMenu.tsx) — right-click, the Context
   *  Menu key / Shift+Enter, or a touch long-press, mirroring how battlefield
   *  cards open theirs. Tap/click still plays the card. */
  onCardMenu?(cardId: string, x: number, y: number): void;
}

export function Hand({ cards, onCardClick, onCardMenu }: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: 'hand' });
  return (
    <div ref={setNodeRef} className={`playtest-hand${isOver ? ' is-over' : ''}`} aria-label="Hand">
      <span className="playtest-hand__label">Hand ({cards.length})</span>
      <div className="playtest-hand__cards">
        {cards.map((c, i) => (
          <PlaytestCardView
            key={c.id}
            card={c}
            draggableId={`hand:${c.id}`}
            size="sm"
            onClick={onCardClick ? (cardId) => onCardClick(cardId, i) : undefined}
            onContextMenu={
              onCardMenu
                ? (cardId, e) => {
                    e.preventDefault();
                    onCardMenu(cardId, e.clientX, e.clientY);
                  }
                : undefined
            }
            onLongPress={onCardMenu}
            title={onCardMenu ? 'Click to play · right-click or hold for options' : undefined}
          />
        ))}
      </div>
    </div>
  );
}
