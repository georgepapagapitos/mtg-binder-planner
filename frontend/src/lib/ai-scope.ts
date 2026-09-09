/**
 * The deck's AI sources contract (T112): where every AI feature on the deck
 * may draw candidates from. `any` = the whole card pool; `owned` = the
 * player's collection; `uncommitted` = owned copies not already sitting in
 * another of their decks. Persisted on the deck (`deck.aiScope`) so the review
 * and the refine pass read the same answer, and part of the server's cache
 * key, so changing it makes the next reading a new one.
 *
 * A leaf on purpose: the decks store, the AI clients and the control all
 * import it, and none of them may import each other.
 */
export type AiScope = 'any' | 'owned' | 'uncommitted';
