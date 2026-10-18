import { queryKeys } from '../../shared/api/query';
export const pricingKeys = {
  all: (generation: string) => [...queryKeys.session(generation), 'service-pricing'] as const,
  products: (generation: string) => [...pricingKeys.all(generation), 'products'] as const,
  history: (generation: string, page: number) =>
    [...pricingKeys.all(generation), 'history', { page }] as const,
  tariff: (generation: string, id: number) =>
    [...pricingKeys.all(generation), 'tariff', id] as const,
};
