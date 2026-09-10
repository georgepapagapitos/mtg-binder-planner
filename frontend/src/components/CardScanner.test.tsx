// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { CardScanner } from './CardScanner';
import { useScanQueueStore } from '../lib/use-scan-queue';
import { isNativePlatform } from '../lib/platform';
import type { ScryfallCard } from '@/deck-builder/types';

// The scanner pulls in the opencv/WASM loader and the native camera bridge —
// neither can run under happy-dom (see the sibling exclude-list rationale in
// vitest.config.ts for scanner/opencv-loader.ts, scanner/detect.ts,
// scanner/scan.ts). Mock the seams the same way the runtime does: platform
// detection, the Capacitor plugins, and the scan pipeline's prewarm/scan.
vi.mock('../lib/scanner/scan', () => ({
  prewarm: vi.fn().mockResolvedValue(undefined),
  scan: vi.fn(),
}));
vi.mock('@capacitor-community/camera-preview', () => ({
  CameraPreview: {
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    captureSample: vi.fn().mockResolvedValue({ value: '' }),
  },
}));
vi.mock('@capacitor/app', () => ({
  App: {
    addListener: vi.fn().mockResolvedValue({ remove: vi.fn() }),
  },
}));
vi.mock('../lib/platform', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/platform')>();
  return { ...actual, isNativePlatform: vi.fn(() => false) };
});

function makeCard(overrides: Partial<ScryfallCard> = {}): ScryfallCard {
  return {
    id: 'card-1',
    oracle_id: 'oracle-bolt',
    name: 'Lightning Bolt',
    cmc: 1,
    type_line: 'Instant',
    color_identity: ['R'],
    keywords: [],
    rarity: 'common',
    set: 'lea',
    set_name: 'Limited Edition Alpha',
    collector_number: '161',
    prices: { usd: '1.50' },
    legalities: { commander: 'legal' },
    image_uris: {
      small: '',
      normal: '',
      large: '',
      png: '',
      art_crop: '',
      border_crop: '',
    },
    ...overrides,
  } as ScryfallCard;
}

function installMediaDevices(value: unknown) {
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    writable: true,
    value,
  });
}

beforeEach(() => {
  useScanQueueStore.setState({ queue: [] });
  vi.mocked(isNativePlatform).mockReturnValue(false);
});

afterEach(() => {
  installMediaDevices(undefined);
  useScanQueueStore.setState({ queue: [] });
});

describe('CardScanner', () => {
  it('shows the permission-denied error state when the browser refuses camera access', async () => {
    const getUserMedia = vi
      .fn()
      .mockRejectedValue(Object.assign(new Error('denied'), { name: 'NotAllowedError' }));
    installMediaDevices({ getUserMedia });

    render(<CardScanner onClose={vi.fn()} onConfirm={vi.fn()} />);

    expect(
      await screen.findByText(
        'Camera permission denied. Enable it in your browser settings to scan cards.'
      )
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
  });

  it("shows 'no camera' guidance when the browser has no camera API at all", async () => {
    installMediaDevices(undefined);

    render(<CardScanner onClose={vi.fn()} onConfirm={vi.fn()} />);

    expect(await screen.findByText("Camera isn't available in this browser.")).toBeTruthy();
  });

  it('shows the queue count badge once cards are queued', async () => {
    // Native path — CameraPreview.start (mocked above) resolves immediately,
    // sidestepping the getUserMedia/MediaStream track dance the web path
    // needs just to reach 'ready'.
    vi.mocked(isNativePlatform).mockReturnValue(true);
    useScanQueueStore.setState({
      queue: [
        {
          id: 'card-1::nonfoil',
          card: makeCard(),
          qty: 3,
          finish: 'nonfoil',
          rawText: 'Lightning Bolt',
        },
      ],
    });

    render(<CardScanner onClose={vi.fn()} onConfirm={vi.fn()} />);

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Review 3 scanned cards' })).toBeTruthy()
    );
  });
});
