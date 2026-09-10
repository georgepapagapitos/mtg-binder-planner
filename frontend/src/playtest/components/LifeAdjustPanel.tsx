import { useEffect, useRef, useState } from 'react';
import { useLockBodyScroll } from '@/lib/use-lock-body-scroll';
import { useEscapeKey } from '@/lib/use-escape-key';
import { useSheetExit } from '@/lib/use-sheet-exit';
import { getSafeViewport } from '@/lib/popover-placement';
import { usePressRepeat } from '@/lib/use-press-repeat';
import { cmdDamageToLethal } from '@/lib/cmd-damage';

/** One commander-damage row — read-only ("taken", self panel) when
 *  `onAdjust` is absent, steppable ("from {opponent}", opponent panel)
 *  when present. `key` disambiguates a partner's row from the primary's. */
export interface CmdDamageRow {
  key: string;
  name: string;
  value: number;
  onAdjust?(delta: number): void;
}

/** Online-only panel content — absent in solo mode. Discriminated by
 *  `kind`: `self` gets an editable poison stepper (when enabled) and a
 *  read-only "damage taken" list; `opponent` gets a read-only life note and
 *  a steppable "damage from" list (mutates MY seat's damage) plus a "View
 *  board" escape hatch into the full board inspector. */
export type OnlinePanelData =
  | {
      kind: 'self';
      poison?: { value: number; onAdjust(delta: number): void };
      cmdDamageTaken: CmdDamageRow[];
    }
  | {
      kind: 'opponent';
      name: string;
      cmdDamageFrom: CmdDamageRow[];
      onViewBoard(): void;
    };

interface Props {
  variant: 'floating' | 'sheet';
  /** Trigger chip's rect (floating variant only) — anchors the popover under it. */
  anchorRect: DOMRect | null;
  title: string;
  life: number;
  /** False renders life as a plain read-only number — an online opponent's
   *  seat, which only they may change (see `online.kind === 'opponent'`). */
  lifeEditable: boolean;
  /** Present only for a SOLO opponent — solo's own commander-damage track
   *  (dealt BY you TO them). Online commander damage instead rides `online`. */
  commanderDamage?: number;
  commanderDamageThreshold: number;
  defeated: boolean;
  /** Player-scoped counters (poison/energy/experience/…) for this player. */
  counters: Record<string, number>;
  /** "Counters" by default; online-self overrides to "Counters (this
   *  device)" — this section is local-only bookkeeping even while seated. */
  countersLabel?: string;
  onClose(): void;
  onAdjustLife(delta: number): void;
  onAdjustCommanderDamage?(delta: number): void;
  onAdjustCounter(kind: string, delta: number): void;
  /** Set while seated at an online table — see `OnlinePanelData`. */
  online?: OnlinePanelData;
}

const MARGIN = 8;
const STEPS = [-5, -1, 1, 5] as const;
/** Poison is the one alternate kill condition life/commander damage can't
 *  express; energy and experience are the other two counters a deck routinely
 *  tracks on the player. Anything else gets added by name. */
const PLAYER_COUNTER_KINDS = ['poison', 'energy', 'experience'];
const MAX_COUNTER_NAME = 20;

/** A ± step that repeats while held — see `usePressRepeat`. Split into its own
 *  component because the hook can't be called inside a `.map`. */
function StepButton({
  className = 'playtest-life-panel__step',
  label,
  onAdjust,
  children,
}: {
  className?: string;
  label: string;
  onAdjust(): void;
  children: React.ReactNode;
}) {
  const press = usePressRepeat(onAdjust);
  return (
    <button type="button" className={className} aria-label={label} {...press}>
      {children}
    </button>
  );
}

function Stepper({
  label,
  value,
  onAdjust,
}: {
  label: string;
  value: number;
  onAdjust(delta: number): void;
}) {
  return (
    <div className="playtest-life-panel__stepper">
      <span className="playtest-life-panel__stepper-label">{label}</span>
      <div className="playtest-life-panel__stepper-row">
        {STEPS.slice(0, 2).map((d) => (
          <StepButton key={d} label={`${label} ${d}`} onAdjust={() => onAdjust(d)}>
            {d}
          </StepButton>
        ))}
        <span className="playtest-life-panel__value" aria-live="polite">
          {value}
        </span>
        {STEPS.slice(2).map((d) => (
          <StepButton key={d} label={`${label} +${d}`} onAdjust={() => onAdjust(d)}>
            +{d}
          </StepButton>
        ))}
      </div>
    </div>
  );
}

/** A ±1 stepper — poison, and every online commander-damage row. Coarser
 *  ±5/±1 (the `Stepper` above) fits a life total's range; a single hit of
 *  commander damage or poison moves by ones. */
function PlusMinusStepper({
  label,
  value,
  lethal,
  onAdjust,
}: {
  label: string;
  value: number;
  lethal?: boolean;
  onAdjust(delta: number): void;
}) {
  return (
    <div className="playtest-life-panel__pm-row">
      <StepButton
        className="playtest-life-panel__pm-step"
        label={`${label} -1`}
        onAdjust={() => onAdjust(-1)}
      >
        −
      </StepButton>
      <span
        className={`playtest-life-panel__value${lethal ? ' is-lethal' : ''}`}
        aria-live="polite"
      >
        {value}
      </span>
      <StepButton
        className="playtest-life-panel__pm-step"
        label={`${label} +1`}
        onAdjust={() => onAdjust(1)}
      >
        +
      </StepButton>
    </div>
  );
}

/** One commander-damage row — see `CmdDamageRow`'s doc. */
function CmdRow({ name, value, onAdjust }: CmdDamageRow) {
  const toLethal = cmdDamageToLethal(value);
  const lethal = value >= 21;
  return (
    <div className={`playtest-life-panel__cmd-row${lethal ? ' is-lethal' : ''}`}>
      <span className="playtest-life-panel__cmd-row-name" title={name}>
        {name}
      </span>
      {onAdjust ? (
        <PlusMinusStepper
          label={`Commander damage from ${name}`}
          value={value}
          onAdjust={onAdjust}
        />
      ) : (
        <span
          className={`playtest-life-panel__value${lethal ? ' is-lethal' : ''}`}
          aria-live="polite"
        >
          {value}
        </span>
      )}
      {toLethal !== null && (
        <span className="playtest-life-panel__cmdr-note">{toLethal} to lethal</span>
      )}
      {lethal && <span className="playtest-life-panel__cmdr-note">Lethal commander damage</span>}
    </div>
  );
}

/**
 * Life/commander-damage adjustment popover for one player (LifeStrip chip).
 * Mirrors `CardContextMenu`'s dual floating/sheet chrome: a cursor-anchored
 * popover on wide viewports, the shared card-picker bottom sheet on narrow
 * ones (both variant-agnostic content).
 *
 * Solo play (`online` absent) shows the original life/commander-damage/
 * counters body. Seated at an online table (`online` set), the body swaps to
 * the table's real fields — see `OnlinePanelData`.
 */
export function LifeAdjustPanel({
  variant,
  anchorRect,
  title,
  life,
  lifeEditable,
  commanderDamage,
  commanderDamageThreshold,
  defeated,
  counters,
  countersLabel,
  onClose,
  onAdjustLife,
  onAdjustCommanderDamage,
  onAdjustCounter,
  online,
}: Props) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [clamped, setClamped] = useState<{ left: number; top: number } | null>(null);
  const [counterText, setCounterText] = useState('');
  const { isClosing, beginClose, onAnimationEnd } = useSheetExit(onClose, 'binder-sheet-slide-out');

  useLockBodyScroll();
  useEscapeKey(variant === 'sheet' ? beginClose : onClose);

  useEffect(() => {
    if (variant !== 'floating') return;
    const el = panelRef.current;
    if (!el || !anchorRect) return;
    const rect = el.getBoundingClientRect();
    const safe = getSafeViewport();
    const left = Math.max(MARGIN, Math.min(anchorRect.left, safe.right - rect.width - MARGIN));
    const top = Math.max(
      MARGIN,
      Math.min(anchorRect.bottom + 6, safe.bottom - rect.height - MARGIN)
    );
    setClamped({ left, top });
  }, [anchorRect, variant]);

  function submitCounter() {
    const kind = counterText.trim().slice(0, MAX_COUNTER_NAME);
    if (!kind) return;
    onAdjustCounter(kind, 1);
    setCounterText('');
  }

  // Presets plus any custom kind already on this player, so a counter added by
  // name stays adjustable afterwards. Online-self already has an
  // authoritative "Poison" stepper above (table-tracked) — "one fact, one
  // place": drop the local preset so it never shows a second, do-nothing
  // "poison" row right below the real one.
  const hasOnlinePoison = online?.kind === 'self' && online.poison !== undefined;
  const presetKinds = hasOnlinePoison
    ? PLAYER_COUNTER_KINDS.filter((k) => k !== 'poison')
    : PLAYER_COUNTER_KINDS;
  const counterKinds = [
    ...presetKinds,
    ...Object.keys(counters).filter((k) => !presetKinds.includes(k) && k !== 'poison'),
  ];

  const body = (
    <>
      {lifeEditable ? (
        <Stepper label="Life" value={life} onAdjust={onAdjustLife} />
      ) : (
        <div className="playtest-life-panel__stepper">
          <span className="playtest-life-panel__stepper-label">Life</span>
          <span
            className="playtest-life-panel__value playtest-life-panel__value--readonly"
            aria-live="polite"
          >
            {life}
          </span>
        </div>
      )}
      {online?.kind === 'opponent' && (
        <p className="playtest-life-panel__readonly-note">
          Only {online.name} can change their life.
        </p>
      )}
      {commanderDamage !== undefined && onAdjustCommanderDamage && (
        <div className="playtest-life-panel__cmdr">
          <Stepper
            label="Commander damage"
            value={commanderDamage}
            onAdjust={onAdjustCommanderDamage}
          />
          <p className="playtest-life-panel__cmdr-note">
            {commanderDamageThreshold - commanderDamage > 0
              ? `${commanderDamageThreshold - commanderDamage} more is lethal`
              : 'Lethal commander damage'}
          </p>
        </div>
      )}
      {online?.kind === 'self' && online.poison && (
        <div className="playtest-life-panel__stepper">
          <span className="playtest-life-panel__stepper-label">Poison</span>
          <PlusMinusStepper
            label="Poison"
            value={online.poison.value}
            lethal={online.poison.value >= 10}
            onAdjust={online.poison.onAdjust}
          />
        </div>
      )}
      {online?.kind === 'self' && online.cmdDamageTaken.length > 0 && (
        <div className="playtest-life-panel__cmd-list">
          <div className="playtest-life-panel__counters-heading">Commander damage taken</div>
          {online.cmdDamageTaken.map((row) => (
            <CmdRow key={row.key} name={row.name} value={row.value} onAdjust={row.onAdjust} />
          ))}
        </div>
      )}
      {online?.kind === 'opponent' && online.cmdDamageFrom.length > 0 && (
        <div className="playtest-life-panel__cmd-list">
          <div className="playtest-life-panel__counters-heading">
            Commander damage from {online.name}
          </div>
          {online.cmdDamageFrom.map((row) => (
            <CmdRow key={row.key} name={row.name} value={row.value} onAdjust={row.onAdjust} />
          ))}
        </div>
      )}
      {online?.kind === 'opponent' && (
        <button
          type="button"
          className="btn playtest-life-panel__view-board"
          onClick={online.onViewBoard}
        >
          View board
        </button>
      )}
      {(!online || online.kind === 'self') && (
        <div className="playtest-life-panel__counters">
          <div className="playtest-life-panel__counters-heading">{countersLabel ?? 'Counters'}</div>
          {counterKinds.map((k) => (
            <div key={k} className="playtest-life-panel__counter">
              <span className="playtest-life-panel__counter-label">{k}</span>
              <StepButton
                label={`${k} minus 1, currently ${counters[k] ?? 0}`}
                onAdjust={() => onAdjustCounter(k, -1)}
              >
                −
              </StepButton>
              <span className="playtest-life-panel__value" aria-live="polite">
                {counters[k] ?? 0}
              </span>
              <StepButton
                label={`${k} plus 1, currently ${counters[k] ?? 0}`}
                onAdjust={() => onAdjustCounter(k, 1)}
              >
                +
              </StepButton>
            </div>
          ))}
          <div className="playtest-life-panel__counter-add">
            <input
              type="text"
              value={counterText}
              onChange={(e) => setCounterText(e.target.value)}
              placeholder="Other counter"
              maxLength={MAX_COUNTER_NAME}
              aria-label="Counter name"
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitCounter();
              }}
            />
            <button
              type="button"
              disabled={!counterText.trim()}
              onClick={submitCounter}
              aria-label="Add counter"
            >
              Add
            </button>
          </div>
        </div>
      )}
      {defeated && (
        <p className="playtest-life-panel__defeated">Defeated. Heal to bring them back.</p>
      )}
    </>
  );

  if (variant === 'sheet') {
    return (
      <div className="card-picker-root">
        {/* The backdrop fully covers the root (both `inset: 0`), so it — not
            root — is what a "click outside the sheet" actually lands on. */}
        <div className="card-picker-backdrop" role="presentation" onClick={() => beginClose()} />
        <div
          className={`card-picker-sheet playtest-life-panel-sheet${isClosing ? ' is-closing' : ''}`}
          role="dialog"
          aria-modal="true"
          aria-label={title}
          onAnimationEnd={onAnimationEnd}
        >
          <div className="card-picker-handle" aria-hidden />
          <div className="card-picker-header">
            <h2 className="card-picker-title">{title}</h2>
          </div>
          <div className="playtest-life-panel">{body}</div>
          <div className="card-picker-footer">
            <button type="button" className="btn" onClick={() => beginClose()}>
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="playtest-ctx__backdrop" role="presentation" onClick={onClose} />
      <div
        ref={panelRef}
        className="playtest-life-panel-floating"
        style={{
          left: clamped?.left ?? anchorRect?.left ?? 0,
          top: clamped?.top ?? anchorRect?.bottom ?? 0,
          visibility: clamped ? 'visible' : 'hidden',
        }}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="playtest-life-panel__title">{title}</div>
        <div className="playtest-life-panel">{body}</div>
      </div>
    </>
  );
}
