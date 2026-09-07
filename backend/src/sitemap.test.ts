import { describe, expect, it } from 'vitest';
import { STATIC_URLS, buildSitemapXml } from './sitemap';

describe('buildSitemapXml', () => {
  it('emits every static page and escapes dynamic paths', () => {
    const xml = buildSitemapXml([
      ...STATIC_URLS,
      { path: '/d/a&b', lastmod: Date.UTC(2026, 8, 7, 12), priority: 0.7 },
    ]);
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain('<loc>https://spellcontrol.com/</loc>');
    expect(xml).toContain('<loc>https://spellcontrol.com/guides/import-moxfield.html</loc>');
    expect(xml).toContain('<loc>https://spellcontrol.com/d/a&amp;b</loc>');
    expect(xml).toContain('<lastmod>2026-09-07</lastmod>');
    expect(xml).toContain('<priority>0.7</priority>');
    expect((xml.match(/<url>/g) ?? []).length).toBe(STATIC_URLS.length + 1);
  });
});
