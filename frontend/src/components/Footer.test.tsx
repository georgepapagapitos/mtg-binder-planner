// @vitest-environment happy-dom
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../store/auth', () => ({
  useAuth: (sel: (s: { user: { role?: string } | null }) => unknown) => sel({ user: null }),
}));
vi.mock('../lib/shortcut-registry', () => ({
  useShortcutRegistry: () => ({ show: vi.fn() }),
}));

import { Footer } from './Footer';

function renderFooter() {
  return render(
    <MemoryRouter>
      <Footer />
    </MemoryRouter>
  );
}

describe('Footer', () => {
  it('links Help & guides to the static guides index, alongside the Scryfall attribution', () => {
    renderFooter();
    expect(screen.getByRole('link', { name: 'Scryfall' }).getAttribute('href')).toBe(
      'https://scryfall.com'
    );
    const link = screen.getByRole('link', { name: 'Help & guides' });
    expect(link.getAttribute('href')).toBe('/guides/');
  });

  it('links Privacy and Terms as static pages', () => {
    renderFooter();
    expect(screen.getByRole('link', { name: /^privacy$/i }).getAttribute('href')).toBe(
      '/privacy.html'
    );
    expect(screen.getByRole('link', { name: /^terms$/i }).getAttribute('href')).toBe('/terms.html');
  });
});
