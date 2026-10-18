// Test fixtures only, not product financial values.
export const financialFixture = {
  currency: 'USD' as const,
  quotedValue: '99999999999999999999.99',
  reportedTransfers: '150.00',
  netBankReceipts: '110.00',
  netAllocated: '90.00',
  actualCost: '40.00',
  operationallyCompletedOrders: 3,
  closedOrders: 1,
};
export const auditFixture = {
  items: [
    {
      eventId: 201,
      userId: null,
      entityType: 'ORDER_ACTIVITY',
      entityId: 11,
      actionCode: 'SUBMITTED',
      occurredAt: '2026-01-01T08:00:00Z',
      redactedSnapshot: '{"redacted":true}',
    },
  ],
  totalElements: 24,
  page: 0,
  size: 20,
};
