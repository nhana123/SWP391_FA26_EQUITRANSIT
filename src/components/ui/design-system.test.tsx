import { expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { RequestTable } from './RequestTable';
import { OrderLifecycle } from './OrderLifecycle';
import { StatusBadge } from './StatusBadge';
import { LoadedOrderFilter } from './LoadedOrderFilter';

it('keeps long request identifiers accessible and preserves the detail route while filtering', async () => {
  const user = userEvent.setup({ delay: null });
  const longCode = 'TR-d64b5f3abcda01234567895142';
  render(
    <MemoryRouter>
      <RequestTable
        label="Requests"
        emptyMessage="Empty"
        items={[
          { orderId: 1, orderNumber: longCode, status: 'CONFIRMED' },
          { orderId: 2, orderNumber: 'DEMO-ORD-02', status: 'COMPLETED' },
        ]}
        path={(item) => `/customer/requests/${item.orderId}`}
      />
    </MemoryRouter>,
  );
  expect(screen.getByRole('link', { name: longCode })).toHaveAttribute(
    'href',
    '/customer/requests/1',
  );
  await user.click(screen.getByRole('button', { name: 'Completed' }));
  expect(screen.queryByRole('link', { name: longCode })).toBeNull();
  expect(screen.getByRole('link', { name: 'DEMO-ORD-02' })).toHaveAttribute(
    'href',
    '/customer/requests/2',
  );
  await user.type(screen.getByRole('searchbox'), 'unmatched');
  expect(screen.getByText('No matching requests on this page')).toBeInTheDocument();
  expect(screen.queryByText('Empty')).toBeNull();
});

it('does not mark transit or delivery as complete from preparation approval', () => {
  render(<OrderLifecycle status="APPROVED" />);
  expect(screen.getByText('Request').closest('li')).toHaveAttribute('aria-current', 'step');
  expect(screen.getByText('Transit').closest('li')).not.toHaveClass('done');
  expect(screen.getByText('Delivered').closest('li')).not.toHaveClass('done');
});

it('filters current transit requests consistently in dashboards and loaded queues', async () => {
  const user = userEvent.setup();
  const items = [
    { orderId: 1, orderNumber: 'TR-TRANSIT', status: 'IN_TRANSIT', orderStatus: 'IN_TRANSIT' },
    { orderId: 2, orderNumber: 'TR-CONFIRMED', status: 'CONFIRMED', orderStatus: 'CONFIRMED' },
  ];
  const { unmount } = render(
    <MemoryRouter>
      <RequestTable
        items={items}
        label="Requests"
        emptyMessage="Empty"
        path={(item) => `/customer/requests/${item.orderId}`}
      />
    </MemoryRouter>,
  );
  await user.click(screen.getByRole('button', { name: 'In Transit' }));
  expect(screen.getByRole('link', { name: 'TR-TRANSIT' })).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'TR-CONFIRMED' })).toBeNull();
  unmount();
  render(
    <LoadedOrderFilter items={items}>
      {(rows) => (
        <ul>
          {rows.map((row) => (
            <li key={row.orderId}>{row.orderNumber}</li>
          ))}
        </ul>
      )}
    </LoadedOrderFilter>,
  );
  await user.click(screen.getByRole('button', { name: 'In Transit' }));
  expect(screen.getByText('TR-TRANSIT')).toBeInTheDocument();
  expect(screen.queryByText('TR-CONFIRMED')).toBeNull();
});

it('does not show a running lifecycle for a cancelled journey', () => {
  render(<OrderLifecycle status="CANCELLED" />);
  expect(screen.getByText(/no further progress is implied/i)).toBeInTheDocument();
  expect(document.querySelector('[aria-current="step"]')).toBeNull();
});

it('provides textual status meaning and a neutral fallback for unknown states', () => {
  render(
    <>
      <StatusBadge status="IN_TRANSIT">In transit</StatusBadge>
      <StatusBadge status="FUTURE_STATUS" />
    </>,
  );
  expect(screen.getByText('In transit')).toHaveClass('status-transit');
  expect(screen.getByText('FUTURE_STATUS')).toHaveClass('status-neutral');
});
