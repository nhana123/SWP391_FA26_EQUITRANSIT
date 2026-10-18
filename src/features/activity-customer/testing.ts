// Artificial fixtures for tests only. Never import this file from runtime UI.
export const fixtureTime = '2026-01-01T08:00:00Z';
export const dashboardFixture = {
  role: 'CUSTOMER' as const,
  counts: [{ status: 'SUBMITTED' as const, count: 24 }],
  items: [{ orderId: 11, orderNumber: 'TEST-11', status: 'SUBMITTED' as const }],
  totalElements: 24,
  page: 0,
  size: 20,
};
export const notificationFixture = {
  notificationId: 101,
  orderId: 11,
  title: 'Test order update',
  message: 'Open the request to view the update.',
  createdAt: fixtureTime,
  readAt: null,
};
export const notificationsFixture = {
  items: [
    notificationFixture,
    { ...notificationFixture, notificationId: 102, orderId: null, title: 'Test general update' },
  ],
  totalElements: 24,
  page: 0,
  size: 20,
};
