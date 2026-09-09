import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { isSpaRoute } from './spa-routes';

describe('isSpaRoute', () => {
  it('owns every top-level route declared in frontend/src/App.tsx', () => {
    const app = readFileSync(
      path.join(__dirname, '..', '..', 'frontend', 'src', 'App.tsx'),
      'utf8'
    );
    const roots = new Set([...app.matchAll(/path="\/([^"/:*]*)/g)].map((m) => `/${m[1]}`));
    expect(roots.size).toBeGreaterThan(10);
    for (const root of roots) expect(isSpaRoute(root), root).toBe(true);
  });

  it('rejects paths the router does not own', () => {
    for (const p of ['/nope', '/guides/missing.html', '/wp-admin', '/decks-old/1']) {
      expect(isSpaRoute(p), p).toBe(false);
    }
    expect(isSpaRoute('/')).toBe(true);
    expect(isSpaRoute('/decks/abc/playtest')).toBe(true);
  });
});
