import { describe, expect, it } from 'vitest';
import { normalizePath } from './analytics';

describe('normalizePath', () => {
  it('collapses ids, tokens and slugs', () => {
    expect(normalizePath('/s/abc123')).toBe('/s/:id');
    expect(normalizePath('/d/urianger-deck-453d5e02')).toBe('/d/:id');
    expect(normalizePath('/u/george')).toBe('/u/:id');
    expect(normalizePath('/gn/i/tok')).toBe('/gn/:id/*');
    expect(normalizePath('/decks/xyz/playtest')).toBe('/decks/:id/*');
    expect(normalizePath('/decks/cube/xyz')).toBe('/decks/cube/:id');
    expect(normalizePath('/collection/binders/b1')).toBe('/collection/binders/:id');
    expect(normalizePath('/pods/p1')).toBe('/pods/:id');
  });
  it('keeps static routes intact', () => {
    for (const p of [
      '/',
      '/decks',
      '/decks/new',
      '/decks/new/brew',
      '/decks/discover',
      '/collection/binders',
      '/guides/',
      '/play',
    ]) {
      expect(normalizePath(p)).toBe(p);
    }
  });
});
