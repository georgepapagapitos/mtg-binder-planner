import { useId } from 'react';
import type { AiScope } from '../../lib/ai-scope';
import { useAiStatus } from '../../lib/use-ai-status';
import './AiSourcesControl.css';

/**
 * The deck's AI sources contract (T112), chosen once and read by every AI
 * surface on the deck: Read the deck's research search and the refine pass
 * both restrict their card search to it server-side.
 *
 * Native radios in a fieldset (same shape as DonorOutcomeInline). Self-hiding
 * like every AI surface: renders nothing until the feature is on. The note
 * under the options is load-bearing — the scope is part of the server's cache
 * key, so a change here turns the next press into a fresh reading against the
 * daily cap, and the control says so instead of letting the player find out.
 */
const AI_SCOPE_OPTIONS: ReadonlyArray<{ value: AiScope; label: string; hint: string }> = [
  {
    value: 'any',
    label: 'Any card',
    hint: 'The whole card pool, including cards you would have to buy.',
  },
  { value: 'owned', label: 'Cards you own', hint: 'Only your collection. Nothing to buy.' },
  {
    value: 'uncommitted',
    label: 'Free copies you own',
    hint: 'Your collection, minus copies already in another deck.',
  },
];

interface AiSourcesControlProps {
  value: AiScope;
  onChange: (scope: AiScope) => void;
  /** No collection imported: the two collection scopes have nothing to search. */
  collectionEmpty?: boolean;
}

export function AiSourcesControl({
  value,
  onChange,
  collectionEmpty = false,
}: AiSourcesControlProps) {
  const status = useAiStatus();
  const id = useId();
  if (!status?.optIn) return null;

  return (
    <fieldset className="ai-sources" aria-describedby={`${id}-note`}>
      <legend className="ai-sources-legend">Where the AI may draw from</legend>
      <div className="ai-sources-options">
        {AI_SCOPE_OPTIONS.map((opt) => {
          const disabled = collectionEmpty && opt.value !== 'any';
          const selected = value === opt.value;
          return (
            <label
              key={opt.value}
              className={`ai-sources-option${selected ? ' is-selected' : ''}${
                disabled ? ' is-disabled' : ''
              }`}
            >
              <input
                type="radio"
                name={id}
                value={opt.value}
                checked={selected}
                disabled={disabled}
                onChange={() => onChange(opt.value)}
              />
              <span className="ai-sources-option-text">
                <span className="ai-sources-option-label">{opt.label}</span>
                <span className="ai-sources-option-hint">
                  {disabled ? 'Import a collection first.' : opt.hint}
                </span>
              </span>
            </label>
          );
        })}
      </div>
      <p id={`${id}-note`} className="ai-sources-note">
        Applies to Read the deck and Refine. Changing it makes the next reading a new one, which
        counts toward today&apos;s {status.limit}.
      </p>
    </fieldset>
  );
}
