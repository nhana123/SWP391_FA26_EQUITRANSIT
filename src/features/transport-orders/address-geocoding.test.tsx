import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { OrderEditor } from './pages';
import { routesApi, CATALOG_COUNTRIES, CATALOG_LOCATIONS } from './route-api';
import { ordersApi } from './api';
import { ApiError } from '../../shared/api/client';
import { queryClient } from '../../shared/api/query';
import { startSession } from '../../shared/api/session';

vi.mock('./api', () => ({
  ordersApi: { get: vi.fn(), update: vi.fn(), submit: vi.fn(), create: vi.fn() },
}));

describe('Address Geocoding Search & Validation in Step 1', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    queryClient.clear();
    startSession({
      accessToken: 'test-only',
      tokenType: 'Bearer',
      expiresIn: 60,
      role: 'CUSTOMER',
    });
    vi.spyOn(routesApi, 'countries').mockResolvedValue(CATALOG_COUNTRIES);
    vi.spyOn(routesApi, 'locations').mockResolvedValue(CATALOG_LOCATIONS);
    vi.spyOn(routesApi, 'hubs').mockResolvedValue(
      CATALOG_LOCATIONS.filter((l) => l.locationType === 'HUB'),
    );
  });

  it('searches real addresses, lets user select a suggestion, validates it, and displays verified GPS badge + OSM attribution', async () => {
    const searchSpy = vi.spyOn(routesApi, 'searchAddress').mockResolvedValue([
      {
        displayName: '123 Nguyễn Huệ, Quận 1, Thành phố Hồ Chí Minh, Việt Nam',
        formattedAddress: '123 Nguyễn Huệ, Quận 1, Hồ Chí Minh',
        latitude: 10.773461,
        longitude: 106.704078,
        countryCode: 'VN',
        city: 'Hồ Chí Minh',
        district: 'Quận 1',
        road: 'Nguyễn Huệ',
      },
    ]);
    const validateSpy = vi.spyOn(routesApi, 'validateAddress').mockResolvedValue({
      isValid: true,
      matchedAddress: {
        displayName: '123 Nguyễn Huệ, Quận 1, Thành phố Hồ Chí Minh, Việt Nam',
        formattedAddress: '123 Nguyễn Huệ, Quận 1, Hồ Chí Minh',
        latitude: 10.773461,
        longitude: 106.704078,
        countryCode: 'VN',
        city: 'Hồ Chí Minh',
        district: 'Quận 1',
        road: 'Nguyễn Huệ',
      },
      message: 'Address matched by geocoder.',
    });

    const user = userEvent.setup({ delay: null });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <OrderEditor />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    // Select pickup country VN
    await user.selectOptions(screen.getByLabelText('Pickup country (ISO code)'), 'VN');

    const pickupInput = screen.getByLabelText('Pickup address');
    await user.type(pickupInput, '123 Nguyen Hue');

    // Click explicit Search button for Pickup address
    const searchButtons = screen.getAllByRole('button', { name: /Tìm địa chỉ/i });
    await user.click(searchButtons[0]);

    expect(searchSpy).toHaveBeenCalledWith(
      '123 Nguyen Hue',
      'VN',
      5,
      expect.any(AbortSignal),
    );

    // Dropdown suggestion appears
    const option = await screen.findByRole('option', {
      name: /123 Nguyễn Huệ, Quận 1, Hồ Chí Minh/i,
    });
    await user.click(option);

    expect(validateSpy).toHaveBeenCalledWith(
      '123 Nguyễn Huệ, Quận 1, Thành phố Hồ Chí Minh, Việt Nam',
      'VN',
      expect.any(AbortSignal),
    );

    expect(
      await screen.findByTestId('address-verified-Pickup address'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Pickup address')).toHaveValue(
      '123 Nguyễn Huệ, Quận 1, Thành phố Hồ Chí Minh, Việt Nam',
    );
    expect(
      screen.getAllByRole('link', { name: '© OpenStreetMap contributors' })[0],
    ).toHaveAttribute('href', 'https://www.openstreetmap.org/copyright');
  }, 15000);

  it('rejects random fake addresses like "đâsd" with empty search results and blocks step progression', async () => {
    vi.spyOn(routesApi, 'searchAddress').mockResolvedValue([]);

    const user = userEvent.setup({ delay: null });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <OrderEditor />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await user.selectOptions(screen.getByLabelText('Pickup country (ISO code)'), 'VN');
    await user.type(screen.getByLabelText('Pickup address'), 'đâsd');

    const searchButtons = screen.getAllByRole('button', { name: /Tìm địa chỉ/i });
    await user.click(searchButtons[0]);

    expect(
      await screen.findByText(/Không tìm thấy địa chỉ thực tế nào khớp với "đâsd"/i),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Pickup address')).toHaveAttribute(
      'aria-invalid',
      'true',
    );

    // Attempt to advance to Step 2 (Horse) -> must remain blocked on Step 1
    await user.click(
      screen.getByRole('button', { name: 'Tiếp tục sang bước Chọn ngựa →' }),
    );
    expect(screen.getByRole('button', { name: '1. Journey' })).toHaveAttribute(
      'aria-current',
      'step',
    );
  });

  it('validates unverified address when clicking Continue and blocks if isValid is false', async () => {
    const validateSpy = vi.spyOn(routesApi, 'validateAddress').mockResolvedValue({
      isValid: false,
      matchedAddress: null,
      message: 'No matching address found; select a search result.',
    });

    const user = userEvent.setup({ delay: null });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <OrderEditor />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await user.selectOptions(screen.getByLabelText('Pickup country (ISO code)'), 'VN');
    await user.type(screen.getByLabelText('Pickup address'), 'asdfgh999');

    await user.click(
      screen.getByRole('button', { name: 'Tiếp tục sang bước Chọn ngựa →' }),
    );

    await waitFor(() =>
      expect(validateSpy).toHaveBeenCalledWith('asdfgh999', 'VN'),
    );
    expect(
      await screen.findByText(/Địa chỉ không tồn tại trên bản đồ/i),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '1. Journey' })).toHaveAttribute(
      'aria-current',
      'step',
    );
    expect(ordersApi.create).not.toHaveBeenCalled();
  });

  it('handles 503 GEOCODING_UNAVAILABLE separately from invalid address and blocks progression', async () => {
    vi.spyOn(routesApi, 'searchAddress').mockRejectedValue(
      new ApiError(503, 'Upstream timeout', 'GEOCODING_UNAVAILABLE'),
    );

    const user = userEvent.setup({ delay: null });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <OrderEditor />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await user.selectOptions(screen.getByLabelText('Pickup country (ISO code)'), 'VN');
    await user.type(screen.getByLabelText('Pickup address'), '123 Nguyen Hue');

    const searchButtons = screen.getAllByRole('button', { name: /Tìm địa chỉ/i });
    await user.click(searchButtons[0]);

    expect(
      await screen.findByText(/Dịch vụ xác thực bản đồ \(OpenStreetMap\) đang tạm thời gián đoạn \(503\)/i),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: 'Tiếp tục sang bước Chọn ngựa →' }),
    );
    expect(screen.getByRole('button', { name: '1. Journey' })).toHaveAttribute(
      'aria-current',
      'step',
    );
  });
});
