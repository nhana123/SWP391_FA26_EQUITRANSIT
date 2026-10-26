import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { CoordinatorRoutesPage } from './CoordinatorRoutesPage';
import { CoordinatorHubsPage } from './CoordinatorHubsPage';
import * as api from './api';

const sampleRoutes: api.RouteTemplate[] = [
  {
    routeTemplateId: 1,
    routeCode: 'ROUTE-VN-CN-ROAD',
    routeName: 'Việt Nam - Nam Ninh (Đường bộ)',
    originCountryCode: 'VN',
    originCity: 'TP. Hồ Chí Minh',
    originAirportCode: null,
    destinationCountryCode: 'CN',
    destinationCity: 'Nam Ninh',
    destinationAirportCode: null,
    transportMode: 'ROAD',
    estimatedRoadKm: 1950,
    estimatedAirKm: 0,
    estimatedHours: 35.5,
    routeSummary: 'TP.HCM → Hữu Nghị Quan → Nam Ninh',
    baseRoadRate: 1.0,
    baseAirRate: 0,
    isActive: true,
  },
  {
    routeTemplateId: 2,
    routeCode: 'ROUTE-VN-FR-AIR',
    routeName: 'Hà Nội - Paris (Hàng không)',
    originCountryCode: 'VN',
    originCity: null,
    originAirportCode: 'HAN',
    destinationCountryCode: 'FR',
    destinationCity: null,
    destinationAirportCode: 'CDG',
    transportMode: 'AIR',
    estimatedRoadKm: 0,
    estimatedAirKm: 9200,
    estimatedHours: 14.5,
    routeSummary: 'Sân bay Nội Bài → Charles de Gaulle',
    baseRoadRate: 1.0,
    baseAirRate: 1200,
    isActive: true,
  },
];

const sampleHubs: api.CoordinatorLocation[] = [
  {
    locationId: 25,
    countryCode: 'VN',
    locationType: 'HUB',
    locationName: 'Trụ sở EquiTransit Việt Nam (Củ Chi Hub)',
    locationCode: 'HUB-VN',
    address: 'Ấp Bến Đình, Nhuận Đức, Củ Chi, TP. Hồ Chí Minh',
    latitude: 11.0825,
    longitude: 106.5186,
    isPrimaryHub: true,
    domesticRatePerKm: 1.2,
    isActive: true,
  },
];

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('Coordinator studio features', () => {
  it('renders route templates listing with corridor badges and rates', async () => {
    vi.spyOn(api.coordinatorApi, 'listRouteTemplates').mockResolvedValue(sampleRoutes);

    renderWithClient(<CoordinatorRoutesPage />);

    expect(await screen.findByText('Predefined Routes')).toBeInTheDocument();
    expect(await screen.findByText('Việt Nam - Nam Ninh (Đường bộ)')).toBeInTheDocument();
    expect(await screen.findByText('Hà Nội - Paris (Hàng không)')).toBeInTheDocument();
    expect(screen.getByText('ROUTE-VN-CN-ROAD')).toBeInTheDocument();
    expect(screen.getByText('ROUTE-VN-FR-AIR')).toBeInTheDocument();
  });

  it('renders company hubs and quarantine barn listings with primary tag and coordinates', async () => {
    vi.spyOn(api.coordinatorApi, 'listLocations').mockResolvedValue(sampleHubs);

    renderWithClient(<CoordinatorHubsPage />);

    expect(await screen.findByText('Company Hubs & Quarantine Barns')).toBeInTheDocument();
    expect(await screen.findByText('Trụ sở EquiTransit Việt Nam (Củ Chi Hub)')).toBeInTheDocument();
    expect(screen.getByText('PRIMARY TERMINAL')).toBeInTheDocument();
    expect(screen.getByText('≤100 km FREE · >100 km: $2.00 / km')).toBeInTheDocument();
  });
});
