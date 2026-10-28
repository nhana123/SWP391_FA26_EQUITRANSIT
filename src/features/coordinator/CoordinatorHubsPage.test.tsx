import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AddressSuggestion } from '../../shared/api/contracts';
import { CoordinatorHubsPage } from './CoordinatorHubsPage';
import { coordinatorApi } from './api';
import { routesApi } from '../transport-orders/route-api';

vi.mock('./api', () => ({
  coordinatorApi: { listLocations: vi.fn(), createLocation: vi.fn() },
}));
vi.mock('../transport-orders/route-api', () => ({
  routesApi: { searchAddress: vi.fn() },
}));

const match: AddressSuggestion = {
  displayName: 'Củ Chi, Thành phố Hồ Chí Minh, Việt Nam',
  formattedAddress: 'Củ Chi, Thành phố Hồ Chí Minh',
  latitude: 11.0067,
  longitude: 106.5132,
  countryCode: 'VN',
};

async function openForm() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <CoordinatorHubsPage />
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByRole('button', { name: /add company hub/i }));
  fireEvent.change(screen.getByLabelText(/hub name/i), { target: { value: 'Cu Chi Hub' } });
  fireEvent.change(screen.getByLabelText(/physical address/i), { target: { value: 'Cu Chi' } });
}

describe('Hub address geocoding', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(coordinatorApi.listLocations).mockResolvedValue([]);
    vi.mocked(routesApi.searchAddress).mockResolvedValue([match]);
  });

  it('searches only on request, fills coordinates and saves the chosen location', async () => {
    await openForm();
    expect(routesApi.searchAddress).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /save company hub/i })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /find address/i }));
    fireEvent.click(await screen.findByRole('button', { name: match.displayName }));
    expect(routesApi.searchAddress).toHaveBeenCalledWith(
      'Cu Chi',
      'VN',
      5,
      expect.any(AbortSignal),
    );
    expect(screen.getByLabelText('Latitude')).toHaveValue(String(match.latitude));
    expect(screen.getByLabelText('Longitude')).toHaveValue(String(match.longitude));
    expect(screen.getByLabelText('Latitude')).toHaveAttribute('readonly');
    fireEvent.click(screen.getByRole('button', { name: /save company hub/i }));
    await waitFor(() =>
      expect(coordinatorApi.createLocation).toHaveBeenCalledWith(
        expect.objectContaining({
          address: match.displayName,
          latitude: match.latitude,
          longitude: match.longitude,
          countryCode: 'VN',
        }),
      ),
    );
  });

  it('clears coordinates after address or country edits', async () => {
    await openForm();
    fireEvent.click(screen.getByRole('button', { name: /find address/i }));
    fireEvent.click(await screen.findByRole('button', { name: match.displayName }));
    fireEvent.change(screen.getByLabelText(/physical address/i), {
      target: { value: 'Another street' },
    });
    expect(screen.getByLabelText('Latitude')).toHaveValue('');
    expect(screen.getByRole('button', { name: /save company hub/i })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /find address/i }));
    fireEvent.click(await screen.findByRole('button', { name: match.displayName }));
    fireEvent.change(screen.getByLabelText(/country code/i), { target: { value: 'TH' } });
    expect(screen.getByLabelText('Longitude')).toHaveValue('');
    expect(screen.getByRole('button', { name: /save company hub/i })).toBeDisabled();
  });

  it('handles no matches and provider errors without inventing coordinates', async () => {
    vi.mocked(routesApi.searchAddress)
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new Error('Unavailable'));
    await openForm();
    fireEvent.click(screen.getByRole('button', { name: /find address/i }));
    expect(await screen.findByText(/no address found/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /find address/i }));
    expect(await screen.findByText(/address search is unavailable/i)).toBeInTheDocument();
    expect(screen.getByLabelText('Latitude')).toHaveValue('');
    expect(coordinatorApi.createLocation).not.toHaveBeenCalled();
  });

  it('ignores a late response after the address is edited', async () => {
    let complete!: (value: AddressSuggestion[]) => void;
    vi.mocked(routesApi.searchAddress).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    await openForm();
    fireEvent.click(screen.getByRole('button', { name: /find address/i }));
    fireEvent.change(screen.getByLabelText(/physical address/i), {
      target: { value: 'New address' },
    });
    await act(async () => complete([match]));
    expect(screen.queryByRole('button', { name: match.displayName })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Latitude')).toHaveValue('');
  });
});
