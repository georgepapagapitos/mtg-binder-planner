// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AdminPanel } from './AdminPanel';
import type { AdminUserSummary, AdminReportRow } from '../lib/admin-api';

// AdminPanel's own network calls are mocked; Modal is real, so this is an
// integration-style test of the confirm-gating wiring around clearUserProfile
// (mirrors how UploadPanel.test.tsx treats Modal as real infrastructure).
const listUsersMock = vi.fn<() => Promise<AdminUserSummary[]>>();
const clearUserProfileMock = vi.fn<(id: string) => Promise<void>>();
// AdminPanel also fetches the Reports section on mount — stub it to an empty
// list so this file's own test (which only exercises the Users card) isn't
// left with an unresolved/rejected fetch.
const listReportsMock = vi.fn<() => Promise<AdminReportRow[]>>(() => Promise.resolve([]));
const setUserAiMock =
  vi.fn<(id: string, patch: { access?: boolean; dailyLimit?: number | null }) => Promise<void>>();
vi.mock('../lib/admin-api', () => ({
  listUsers: () => listUsersMock(),
  deleteUser: vi.fn(),
  clearUserProfile: (id: string) => clearUserProfileMock(id),
  setUserAi: (id: string, patch: { access?: boolean; dailyLimit?: number | null }) =>
    setUserAiMock(id, patch),
  listReports: () => listReportsMock(),
  resolveReport: vi.fn(),
}));

const baseUser: AdminUserSummary = {
  id: 'u1',
  username: 'nova',
  role: 'user',
  createdAt: Date.parse('2026-01-01T00:00:00Z'),
  dataBytes: 1024,
  displayName: 'Nova',
  bio: 'Cube drafter',
  avatarCardName: null,
  aiAccess: false,
  aiDailyLimit: null,
};

describe('AdminPanel — AI access (T114)', () => {
  it('shows Off, then saves access + limit from the dialog and re-renders On', async () => {
    listUsersMock.mockResolvedValueOnce([baseUser]);
    render(<AdminPanel currentUserId="admin-1" />);
    await screen.findByText('nova');
    expect(screen.getByText('Off')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Actions for nova' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'AI access…' }));
    await screen.findByText('AI access for nova');

    // A non-numeric limit disables Save with a hint; blank/whole numbers are fine.
    const limit = screen.getByLabelText('Daily limit');
    fireEvent.change(limit, { target: { value: '2.5' } });
    expect((screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(limit, { target: { value: '25' } });
    fireEvent.click(screen.getByLabelText('Allow AI features'));

    listUsersMock.mockResolvedValueOnce([{ ...baseUser, aiAccess: true, aiDailyLimit: 25 }]);
    setUserAiMock.mockResolvedValueOnce(undefined);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(setUserAiMock).toHaveBeenCalledWith('u1', { access: true, dailyLimit: 25 })
    );
    await waitFor(() => expect(screen.queryByText('AI access for nova')).toBeNull());
    await screen.findByText('On');
    expect(screen.getByText('25/day')).toBeTruthy();
  });
});

describe('AdminPanel — clear profile', () => {
  it('cancel fires no API call; confirm clears the profile and refreshes the row', async () => {
    listUsersMock.mockResolvedValueOnce([baseUser]);

    render(<AdminPanel currentUserId="admin-1" />);
    await screen.findByText('nova');

    fireEvent.click(screen.getByRole('button', { name: 'Actions for nova' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Clear profile' }));
    await screen.findByText('Clear profile?');

    // Cancel: dismisses without calling the API.
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByText('Clear profile?')).toBeNull());
    expect(clearUserProfileMock).not.toHaveBeenCalled();

    // Re-open and confirm; the refetch after success returns a cleared row.
    listUsersMock.mockResolvedValueOnce([{ ...baseUser, displayName: null, bio: null }]);
    clearUserProfileMock.mockResolvedValueOnce(undefined);
    fireEvent.click(screen.getByRole('button', { name: 'Actions for nova' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Clear profile' }));
    await screen.findByText('Clear profile?');
    fireEvent.click(screen.getByRole('button', { name: 'Clear profile' }));

    await waitFor(() => expect(clearUserProfileMock).toHaveBeenCalledWith('u1'));
    await waitFor(() => expect(screen.queryByText('Clear profile?')).toBeNull());
    await waitFor(() => expect(screen.queryByText('Nova')).toBeNull());
    expect(screen.getByText('—')).toBeTruthy();
  });
});
