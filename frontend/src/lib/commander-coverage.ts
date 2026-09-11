/**
 * Commander coverage: how much of a commander's deck the user's collection
 * can already fill. Pure, network-free (E283).
 *
 * This is the same metric the owned-only generator gates its pool wideners
 * on (E282, `thinOwnedPoolCount` in deckGeneration/dataAcquisition.ts): count
 * the cards on the commander's EDHREC page (`cardlists.allNonLand`) that the
 * user owns AND whose color identity fits the deck, and compare that against
 * the spell slots the deck needs (deck size minus lands). Below
 * `OWNED_POOL_THIN_RATIO` × slots the generator has to widen the pool, so
 * that line is what "no gaps" means here. Calibrated on the 2026-09-10 panel:
 * Sram 59 thin; Talrand 76 / Ayara 77 / Krenko 86 / Ezuri 93 fine, all vs 62.
 *
 * Readiness (`commander-readiness.ts`, staples owned out of 100) is a
 * different question and stays a secondary stat beside this one.
 */

/** Widen the owned-only pool when owned-on-page < ratio × spell slots. */
export const OWNED_POOL_THIN_RATIO = 1.2;

/** Minimal page-card shape: `EDHRECCard` is assignable. */
export interface CoverageCard {
  name: string;
  primary_type?: string;
}

export interface CommanderCoverage {
  /** False when the page had no cards (EDHREC offline / unreachable). */
  available: boolean;
  /** Owned, identity-fitting nonland cards on the commander's page. */
  owned: number;
  /** Spell slots the deck needs: deck size minus lands. */
  slots: number;
  /** Owned count at which the generator stops widening: ceil(ratio × slots). */
  comfortable: number;
  /** Below the comfortable line: some slots come from outside the page. */
  thin: boolean;
  /** One plain line for the row. */
  line: string;
}

/**
 * @param pageCards - the commander's EDHREC `allNonLand`. Empty → unavailable.
 * @param ownedNames - owned card names, lowercased.
 * @param identityByName - lowercased name → color identity letters, for the
 *   owned cards. A name missing from the map counts as fitting (mirrors the
 *   generator, which only has identity for the lean owned pool).
 * @param deckIdentity - the commander's color identity letters.
 */
export function computeCoverage(
  pageCards: readonly CoverageCard[],
  ownedNames: ReadonlySet<string>,
  identityByName: ReadonlyMap<string, readonly string[]>,
  deckIdentity: readonly string[],
  landCount = 37,
  deckSize = 99
): CommanderCoverage {
  const slots = Math.max(0, deckSize - landCount);
  const comfortable = Math.ceil(slots * OWNED_POOL_THIN_RATIO);
  if (pageCards.length === 0) {
    return {
      available: false,
      owned: 0,
      slots,
      comfortable,
      thin: true,
      line: 'No EDHREC data for this commander right now.',
    };
  }
  const identity = new Set(deckIdentity);
  let owned = 0;
  for (const card of pageCards) {
    if (card.primary_type === 'Land') continue;
    const key = card.name.toLowerCase();
    if (!ownedNames.has(key)) continue;
    const ci = identityByName.get(key);
    if (ci && !ci.every((c) => identity.has(c))) continue;
    owned += 1;
  }
  const thin = owned < comfortable;
  const line = thin
    ? `${owned} owned cards for ${slots} slots, a few will come from outside this commander's data`
    : `${owned} owned cards for ${slots} slots, no gaps`;
  return { available: true, owned, slots, comfortable, thin, line };
}

/** Best coverage first; unavailable last; ties by name. */
export function compareCoverage(
  a: { name: string; coverage?: CommanderCoverage },
  b: { name: string; coverage?: CommanderCoverage }
): number {
  const oa = a.coverage?.available ? a.coverage.owned : -1;
  const ob = b.coverage?.available ? b.coverage.owned : -1;
  if (ob !== oa) return ob - oa;
  return a.name.localeCompare(b.name);
}

/** How many of a tag page's top cards we count the reason line against. */
export const REASON_TOP_N = 30;

/**
 * The per-row reason line: how much of the commander's top archetype page
 * the user already owns. "You own 18 of the Equipment page's top 30."
 * Null when the tag page had no cards.
 */
export function computeReasonLine(
  tagCards: readonly CoverageCard[],
  ownedNames: ReadonlySet<string>,
  themeName: string
): string | null {
  const top = tagCards.filter((c) => c.primary_type !== 'Land').slice(0, REASON_TOP_N);
  if (top.length === 0) return null;
  const owned = top.filter((c) => ownedNames.has(c.name.toLowerCase())).length;
  return `You own ${owned} of the ${themeName} page's top ${top.length}`;
}
