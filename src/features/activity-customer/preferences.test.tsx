import { beforeEach, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { ApiError } from '../../shared/api/client';
import { queryClient } from '../../shared/api/query';
import { getSession, startSession } from '../../shared/api/session';
import type { Role } from '../../shared/api/contracts';
import { activityApi } from './api';
import { EmailPreferencesPage } from './preferences';
import { activityKeys } from './shared';
vi.mock('./api', async (original) => ({
  ...(await original<typeof import('./api')>()),
  activityApi: { preference: vi.fn(), savePreference: vi.fn() },
}));
beforeEach(() => {
  vi.resetAllMocks();
  queryClient.clear();
  vi.mocked(activityApi.preference).mockResolvedValue({ enabled: false });
  vi.mocked(activityApi.savePreference).mockImplementation(async (enabled) => ({ enabled }));
});
function mount(role: Role = 'CUSTOMER') {
  startSession({ accessToken: 'test-only', tokenType: 'Bearer', expiresIn: 600, role });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <EmailPreferencesPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return userEvent.setup({ delay: null });
}
it('saves the exact ordinary-mail choice and leaves security and in-app notifications separate', async () => {
  const user = mount();
  const choice = await screen.findByRole('checkbox');
  expect(choice).not.toBeChecked();
  expect(
    screen.getByText(/security verification or password-recovery emails remain available/),
  ).toBeInTheDocument();
  await user.click(choice);
  await user.click(screen.getByRole('button', { name: 'Save email preference' }));
  await screen.findByText('Email preference saved.');
  expect(activityApi.savePreference).toHaveBeenCalledWith(true);
  expect(screen.getByText('Saved preference: Enabled.')).toBeInTheDocument();
  expect(activityApi.preference).toHaveBeenCalledTimes(1);
});
it.each([0, 503])(
  'keeps the original false choice frozen for an uncertain %s retry',
  async (status) => {
    vi.mocked(activityApi.preference).mockResolvedValue({ enabled: true });
    vi.mocked(activityApi.savePreference)
      .mockRejectedValueOnce(new ApiError(status, 'Uncertain.'))
      .mockResolvedValueOnce({ enabled: false });
    const user = mount();
    await user.click(await screen.findByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Save email preference' }));
    const retry = await screen.findByRole('button', { name: 'Retry the same email preference' });
    expect(screen.getByRole('checkbox')).not.toBeChecked();
    expect(screen.getByRole('checkbox')).toBeDisabled();
    await user.click(retry);
    await screen.findByText('Email preference saved.');
    expect(vi.mocked(activityApi.savePreference).mock.calls).toEqual([[false], [false]]);
  },
);
it('shows a safe field error and preserves a choice after validation failure', async () => {
  vi.mocked(activityApi.savePreference).mockRejectedValue(
    new ApiError(400, 'private-note', undefined, { enabled: 'private-note' }),
  );
  const user = mount();
  await user.click(await screen.findByRole('checkbox'));
  await user.click(screen.getByRole('button', { name: 'Save email preference' }));
  await screen.findByText('Choose whether to receive ordinary email updates.');
  expect(screen.getByRole('checkbox')).toBeChecked();
  expect(screen.getByRole('checkbox')).toBeEnabled();
  expect(screen.queryByText('private-note')).toBeNull();
});
it('preserves unsaved input through a background deployment error and explicit GET recovery', async () => {
  const user = mount();
  await user.click(await screen.findByRole('checkbox'));
  const s = getSession()!;
  const key = [...activityKeys.all(s.generation, s.role), 'preference'];
  vi.mocked(activityApi.preference).mockRejectedValueOnce(new ApiError(503, 'Unavailable.'));
  await act(async () => {
    await queryClient.invalidateQueries({ queryKey: key });
  });
  await screen.findByText(/Deployment blocked/);
  expect(screen.getByRole('checkbox')).toBeChecked();
  expect(screen.getByRole('checkbox')).toBeDisabled();
  vi.mocked(activityApi.preference).mockResolvedValue({ enabled: false });
  await user.click(screen.getByRole('button', { name: 'Reload preference and review' }));
  await screen.findByText('Current preference loaded. Review your choice before saving.');
  expect(screen.getByRole('checkbox')).toBeChecked();
  expect(activityApi.savePreference).not.toHaveBeenCalled();
});
it('requires a fresh GET after a definite conflict and preserves the pending choice', async () => {
  vi.mocked(activityApi.savePreference)
    .mockRejectedValueOnce(new ApiError(409, 'Changed.'))
    .mockResolvedValueOnce({ enabled: true });
  const user = mount();
  await user.click(await screen.findByRole('checkbox'));
  await user.click(screen.getByRole('button', { name: 'Save email preference' }));
  await user.click(await screen.findByRole('button', { name: 'Reload preference and review' }));
  await screen.findByText('Current preference loaded. Review your choice before saving.');
  await user.click(screen.getByRole('button', { name: 'Save email preference' }));
  await screen.findByText('Email preference saved.');
  expect(activityApi.preference).toHaveBeenCalledTimes(2);
});
it.each([403, 404])('hides preference controls after a write returns %s', async (status) => {
  vi.mocked(activityApi.savePreference).mockRejectedValue(new ApiError(status, 'Denied.'));
  const user = mount();
  await screen.findByRole('checkbox');
  await user.click(screen.getByRole('button', { name: 'Save email preference' }));
  await screen.findByRole('alert');
  expect(screen.queryByRole('checkbox')).toBeNull();
});
it.each(['MANAGER', 'SPECIALIST', 'COORDINATOR', 'DRIVER'] as const)(
  'does not fetch Customer email preferences for %s',
  (role) => {
    mount(role);
    expect(activityApi.preference).not.toHaveBeenCalled();
  },
);
it('does not repopulate a previous account cache after an in-flight save', async () => {
  let finish!: (value: { enabled: boolean }) => void;
  vi.mocked(activityApi.savePreference).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const user = mount();
  await screen.findByRole('checkbox');
  const oldGeneration = getSession()!.generation;
  await user.click(screen.getByRole('button', { name: 'Save email preference' }));
  await waitFor(() => expect(activityApi.savePreference).toHaveBeenCalled());
  await act(async () => {
    startSession({
      accessToken: 'second-test-only',
      tokenType: 'Bearer',
      expiresIn: 600,
      role: 'CUSTOMER',
    });
    finish({ enabled: false });
  });
  expect(
    queryClient.getQueriesData({ queryKey: activityKeys.all(oldGeneration, 'CUSTOMER') }),
  ).toEqual([]);
});
