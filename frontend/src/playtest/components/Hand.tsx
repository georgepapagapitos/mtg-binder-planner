import { useDroppable } from '@dnd-kit/core';
import type { PlaytestCard } from '@/lib/playtest';
import { PlaytestCardView } from './PlaytestCardView';

interface Props {
  cards: PlaytestCard[];
  onCardClick?(cardId: string, index: number): void;
  /** Read a card without playing it — right-click, the Context Menu key /
   *  Shift+Enter, or (with `longPress`) a touch long-press, mirroring how
   *  battlefield cards open their menu. Tap/click still plays the card. */
  onCardPreview?(cardId: string): void;
  longPress?: boolean;
}

export function Hand({ cards, onCardClick, onCardPreview, longPress }: Props) {
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
              onCardPreview
                ? (cardId, e) => {
                    e.preventDefault();
                    onCardPreview(cardId);
                  }
                : undefined
            }
            onLongPress={onCardPreview && longPress ? (cardId) => onCardPreview(cardId) : undefined}
            title={
              onCardPreview
                ? longPress
                  ? 'Tap to play · hold to read'
                  : 'Click to play · right-click to read'
                : undefined
            }
          />
        ))}
      </div>
    </div>
  );
}
