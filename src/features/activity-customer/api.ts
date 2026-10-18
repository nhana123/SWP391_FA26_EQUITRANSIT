import { ApiError, request } from '../../shared/api/client';
import {
  dashboardSchema,
  emailPreferenceSchema,
  notificationSchema,
  notificationsSchema,
} from './contracts';

export const ACTIVITY_PAGE_SIZE = 20;
export const activityApi = {
  dashboard: (page: number, signal?: AbortSignal) =>
    request(`/api/dashboard?page=${page}&size=${ACTIVITY_PAGE_SIZE}`, dashboardSchema, { signal }),
  notifications: (page: number, size = ACTIVITY_PAGE_SIZE, signal?: AbortSignal) =>
    request(`/api/notifications?page=${page}&size=${size}`, notificationsSchema, { signal }),
  read: async (id: number) => {
    const result = await request(`/api/notifications/${id}/read`, notificationSchema, {
      method: 'PUT',
    });
    if (result.notificationId !== id || result.readAt === null)
      throw new ApiError(502, 'Invalid notification acknowledgement.');
    return result;
  },
  preference: (signal?: AbortSignal) =>
    request('/api/customers/me/notification-preferences', emailPreferenceSchema, { signal }),
  savePreference: async (enabled: boolean) => {
    const result = await request(
      '/api/customers/me/notification-preferences',
      emailPreferenceSchema,
      {
        method: 'PUT',
        body: { enabled },
      },
    );
    if (result.enabled !== enabled) throw new ApiError(502, 'Invalid preference acknowledgement.');
    return result;
  },
};
