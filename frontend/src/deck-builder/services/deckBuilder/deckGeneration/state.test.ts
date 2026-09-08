import { describe, it, expect } from 'vitest';
import { createState, addMustInclude } from './state';
import type { GenerationContext } from './state';
import type { Customization, ScryfallCard } from '@/deck-builder/types';

// Minimal fixtures — createState only reads a handful of Customization fields
// (everything else falls back via ?? / !!), so a slim cast is enough here
// rather than hand-rolling the full ~40-field Customization shape.
function makeContext(customizationOverrides: Partial<Customization> = {}): GenerationContext {
  const commander = { name: 'Test Commander', color_identity: ['G'] } as unknown as ScryfallCard;
  const customization = {
    deckFormat: 99,
    ...customizationOverrides,
  } as unknown as Customization;
  return {
    commander,
    partnerCommander: null,
    colorIdentity: ['G'],
    customization,
  };
}

describe('createState — brewLevel clamp', () => {
  it('clamps a value above 1 down to 1', () => {
    // A brewLevel > 1.5 made cardPicking.ts's inclusion multiplier go
    // negative — inverting the staples<->brew dial instead of maxing it out.
    const state = createState(makeContext({ brewLevel: 5 }));
    expect(state.cfg.brewLevel).toBe(1);
  });

  it('clamps a negative value up to 0', () => {
    const state = createState(makeContext({ brewLevel: -3 }));
    expect(state.cfg.brewLevel).toBe(0);
  });

  it('leaves an in-range value untouched', () => {
    const state = createState(makeContext({ brewLevel: 0.7 }));
    expect(state.cfg.brewLevel).toBe(0.7);
  });

  it('defaults to 0.5 when omitted', () => {
    const state = createState(makeContext({ brewLevel: undefined }));
    expect(state.cfg.brewLevel).toBe(0.5);
  });
});

describe('addMustInclude — ban conflict', () => {
  it('records a user must-include that is also banned, for the caller to disclose', () => {
    const state = createState(makeContext());
    state.bannedCards.add('Elvish Archdruid');

    addMustInclude(state, 'Elvish Archdruid', 'user');

    expect(state.mustIncludeNames).not.toContain('Elvish Archdruid');
    expect(state.mustIncludeBanConflicts).toEqual(['Elvish Archdruid']);
  });

  it('does not record a combo-sourced conflict (those skips are by design)', () => {
    const state = createState(makeContext());
    state.bannedCards.add('Elvish Archdruid');

    addMustInclude(state, 'Elvish Archdruid', 'combo');

    expect(state.mustIncludeBanConflicts).toEqual([]);
  });

  it('adds a non-banned must-include normally', () => {
    const state = createState(makeContext());

    addMustInclude(state, 'Sol Ring', 'user');

    expect(state.mustIncludeNames).toEqual(['Sol Ring']);
    expect(state.mustIncludeBanConflicts).toEqual([]);
  });
});
