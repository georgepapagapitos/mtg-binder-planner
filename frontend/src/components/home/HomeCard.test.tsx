// @vitest-environment happy-dom
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { HomeCard } from './HomeCard';
import { readHomeShape } from '../../lib/home-shape';

type Props = Partial<Parameters<typeof HomeCard>[0]>;

function renderCard(props: Props) {
  return render(
    <MemoryRouter>
      <HomeCard title="Value movers" loading={false} {...props}>
        <p>content</p>
      </HomeCard>
    </MemoryRouter>
  );
}

// Written from an effect that can land after a test's last await — cleared
// at the START of each test (same discipline as TrendingRail.test.tsx).
beforeEach(() => localStorage.removeItem('sc-home-shape'));

/**
 * E277 guard: a card's loading skeleton takes the footprint it resolved to
 * last time, so a returning visitor's board resolves in place. Measured
 * 2026-09-09: without this, /home reflowed to CLS 0.43 desktop / 0.21 phone
 * as skeletons became tall content or 44px rows that `order` to the bottom.
 */
describe('HomeCard remembered footprint', () => {
  it('a first visit skeletons as the full shell and reserves nothing', () => {
    const { container } = renderCard({ loading: true });
    expect(container.querySelector('.home-card--empty')).toBeNull();
    expect(container.querySelector('.home-card-skeleton')).toBeTruthy();
    expect((container.querySelector('.home-card') as HTMLElement).style.minHeight).toBe('');
  });

  it('remembers an empty resolve and skeletons as the collapsed row next time, door hidden', () => {
    const { unmount } = renderCard({ empty: true, emptyText: 'Nothing.', viewAllHref: '/x' });
    expect(readHomeShape()['Value movers']).toBe(0);
    unmount();

    const { container } = renderCard({ loading: true, viewAllHref: '/x' });
    const row = container.querySelector('.home-card--empty');
    expect(row).toBeTruthy();
    expect(screen.getByRole('status', { name: 'Loading' })).toBeTruthy();
    expect(screen.queryByText('Nothing.')).toBeNull();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('reserves the last content height while loading', () => {
    localStorage.setItem('sc-home-shape', JSON.stringify({ 'Value movers': 320 }));
    const { container } = renderCard({ loading: true });
    expect((container.querySelector('.home-card') as HTMLElement).style.minHeight).toBe('320px');
    expect(container.querySelector('.home-card-skeleton')).toBeTruthy();
  });

  it('a resolved content card drops the reservation and records its footprint', () => {
    localStorage.setItem('sc-home-shape', JSON.stringify({ 'Value movers': 320 }));
    const { container } = renderCard({ loading: false });
    expect((container.querySelector('.home-card') as HTMLElement).style.minHeight).toBe('');
    expect(screen.getByText('content')).toBeTruthy();
    expect(readHomeShape()['Value movers']).toBeGreaterThan(0);
  });

  it('a remembered empty card that resolves with content renders the full shell', () => {
    localStorage.setItem('sc-home-shape', JSON.stringify({ 'Value movers': 0 }));
    const { container } = renderCard({ loading: false, empty: false });
    expect(container.querySelector('.home-card--empty')).toBeNull();
    expect(screen.getByText('content')).toBeTruthy();
  });

  it('an error never writes the shape', () => {
    renderCard({ error: 'boom' });
    expect(readHomeShape()['Value movers']).toBeUndefined();
  });
});
