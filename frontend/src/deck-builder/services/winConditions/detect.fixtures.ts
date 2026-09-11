// REAL Scryfall oracle text (fetched 2026-09-10 via /cards/named?exact=).
// Ground-truth fixtures for the win-condition detector — never author-written.
// Cards the synergy corpus already carries are read from there instead.

export interface FixtureCard {
  name: string;
  type_line: string;
  keywords: string[];
  oracle_text: string;
}

export const WINCON_FIXTURES: FixtureCard[] = [
  {
    name: 'Niv-Mizzet, Parun',
    type_line: 'Legendary Creature — Dragon Wizard',
    keywords: ['Flying'],
    oracle_text:
      "This spell can't be countered.\nFlying\nWhenever you draw a card, Niv-Mizzet deals 1 damage to any target.\nWhenever a player casts an instant or sorcery spell, you draw a card.",
  },
  {
    name: 'Elenda, the Dusk Rose',
    type_line: 'Legendary Creature — Vampire Knight',
    keywords: ['Lifelink'],
    oracle_text:
      "Lifelink\nWhenever another creature dies, put a +1/+1 counter on Elenda.\nWhen Elenda dies, create X 1/1 white Vampire creature tokens with lifelink, where X is Elenda's power.",
  },
  {
    name: 'Kessig Flamebreather',
    type_line: 'Creature — Human Shaman',
    keywords: [],
    oracle_text:
      'Whenever you cast a noncreature spell, this creature deals 1 damage to each opponent.',
  },
  {
    name: 'Prodigal Sorcerer',
    type_line: 'Creature — Human Wizard Sorcerer',
    keywords: [],
    oracle_text: '{T}: This creature deals 1 damage to any target.',
  },
  {
    name: 'Warstorm Surge',
    type_line: 'Enchantment',
    keywords: [],
    oracle_text:
      'Whenever a creature you control enters, it deals damage equal to its power to any target.',
  },
  {
    name: 'Torbran, Thane of Red Fell',
    type_line: 'Legendary Creature — Dwarf Noble',
    keywords: [],
    oracle_text:
      'If a red source you control would deal damage to an opponent or a permanent an opponent controls, it deals that much damage plus 2 instead.',
  },
  {
    name: 'Talrand, Sky Summoner',
    type_line: 'Legendary Creature — Merfolk Wizard',
    keywords: [],
    oracle_text:
      'Whenever you cast an instant or sorcery spell, create a 2/2 blue Drake creature token with flying.',
  },
  {
    name: 'Bruvac the Grandiloquent',
    type_line: 'Legendary Creature — Human Advisor',
    keywords: ['Mill'],
    oracle_text:
      'If an opponent would mill one or more cards, they mill twice that many cards instead. (To mill a card, a player puts the top card of their library into their graveyard.)',
  },
  {
    name: 'Skithiryx, the Blight Dragon',
    type_line: 'Legendary Creature — Phyrexian Dragon Skeleton',
    keywords: ['Flying', 'Regenerate', 'Infect'],
    oracle_text:
      'Flying\nInfect (This creature deals damage to creatures in the form of -1/-1 counters and to players in the form of poison counters.)\n{B}: Skithiryx gains haste until end of turn.\n{B}{B}: Regenerate Skithiryx.',
  },
];
