import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { BookingFlowDepositPanel } from './BookingFlowDepositPanel';
import { orderStatusApi } from './status-api';
import { draftForm, draftInput } from './form';
import { queryClient } from '../../shared/api/query';
import { startSession } from '../../shared/api/session';
import type { Order } from '../../shared/api/contracts';

vi.mock('./status-api', () => ({
  ORDER_PAGE_SIZE: 20,
  orderStatusApi: {
    list: vi.fn(),
    assessment: vi.fn(),
    bookingFlowStatus: vi.fn(),
  },
}));

function makeOrder(mode: 'ROAD' | 'AIR', status: Order['orderStatus'] = 'SUBMITTED'): Order {
  const form = draftForm();
  Object.assign(form, {
    originCountryCode: 'VN',
    destinationCountryCode: mode === 'ROAD' ? 'CN' : 'FR',
    transportMode: mode,
    originHubId: '26',
    destinationHubId: '27',
  });
  return {
    orderId: 101,
    orderNumber: 'ET-FLOW-101',
    orderStatus: status,
    currency: 'USD',
    recordVersion: '0000000000000001',
    currentRevisionId: 301,
    currentPlanId: null,
    createdAt: '2026-10-26T00:00:00Z',
    updatedAt: '2026-10-26T00:00:00Z',
    draft: draftInput(form, null),
  };
}

function mount(order: Order) {
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <BookingFlowDepositPanel order={order} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  queryClient.clear();
  startSession({ accessToken: 'test-token', tokenType: 'Bearer', expiresIn: 60, role: 'CUSTOMER' });
});

describe('BookingFlowDepositPanel (ROAD vs AIR deposit & driver assignment workflow)', () => {
  it('shows awaiting Manager approval state right after submit before Manager approves', async () => {
    vi.mocked(orderStatusApi.bookingFlowStatus).mockResolvedValue({
      orderId: 101,
      transportMode: 'ROAD',
      orderStatus: 'SUBMITTED',
      hasAcceptedQuote: false,
      quoteTotal: null,
      depositRequired: false,
      depositAmount: null,
      depositPaid: '0.00',
      isDepositSatisfied: false,
      canAssignDriver: false,
      blockReason: 'AWAITING_MANAGER_APPROVAL',
    });

    mount(makeOrder('ROAD'));

    expect(
      await screen.findByText(/Chờ Quản lý duyệt & phân phối chuyên viên/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /Quản lý đang thẩm định và phân phối Điều phối viên phụ trách. Cổng đặt cọc 30% sẽ mở ngay sau khi được duyệt/i,
      ),
    ).toBeInTheDocument();
  });

  it('shows 30% deposit payment CTA for a fixed ROAD booking after Manager APPROVED', async () => {
    vi.mocked(orderStatusApi.bookingFlowStatus).mockResolvedValue({
      orderId: 101,
      transportMode: 'ROAD',
      orderStatus: 'APPROVED',
      hasAcceptedQuote: true,
      quoteTotal: '3400.00',
      depositRequired: true,
      depositAmount: '1020.00',
      depositPaid: '0.00',
      isDepositSatisfied: false,
      canAssignDriver: false,
      blockReason: 'DEPOSIT_REQUIRED',
    });

    mount(makeOrder('ROAD', 'APPROVED'));

    expect(
      await screen.findByText(/Luồng Đặt cọc & Điều phối Đường bộ/i),
    ).toBeInTheDocument();
    expect(screen.getByText('3,400.00 USD')).toBeInTheDocument();
    expect(screen.getByText('1,020.00 USD')).toBeInTheDocument();

    const payLink = screen.getByRole('link', {
      name: /Thanh toán tiền đặt cọc 30% ngay/i,
    });
    expect(payLink).toHaveAttribute('href', '/customer/requests/101/payments');
  });

  it('shows awaiting Coordinator airfare quote state for an AIR booking after submit', async () => {
    vi.mocked(orderStatusApi.bookingFlowStatus).mockResolvedValue({
      orderId: 101,
      transportMode: 'AIR',
      orderStatus: 'SUBMITTED',
      hasAcceptedQuote: false,
      quoteTotal: null,
      depositRequired: true,
      depositAmount: null,
      depositPaid: '0.00',
      isDepositSatisfied: false,
      canAssignDriver: false,
      blockReason: 'AWAITING_COORDINATOR_QUOTE',
    });

    mount(makeOrder('AIR'));

    expect(
      await screen.findByText(/Luồng Báo giá Hàng không, Đặt cọc & Điều phối/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Đang chờ Điều phối viên báo giá/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /Điều phối viên đang lên lịch chuyến bay & báo giá vé máy bay thực tế cho bạn/i,
      ),
    ).toBeInTheDocument();
  });

  it('shows quote acceptance CTA when Coordinator has issued the official AIR quote', async () => {
    vi.mocked(orderStatusApi.bookingFlowStatus).mockResolvedValue({
      orderId: 101,
      transportMode: 'AIR',
      orderStatus: 'IN_PREPARATION',
      hasAcceptedQuote: false,
      quoteTotal: '21400.00',
      depositRequired: true,
      depositAmount: '6420.00',
      depositPaid: '0.00',
      isDepositSatisfied: false,
      canAssignDriver: false,
      blockReason: 'QUOTE_ACCEPTANCE_REQUIRED',
    });

    mount(makeOrder('AIR', 'IN_PREPARATION'));

    expect(await screen.findByText('21,400.00 USD')).toBeInTheDocument();
    expect(screen.getByText('6,420.00 USD')).toBeInTheDocument();

    const quoteLink = screen.getByRole('link', {
      name: /Xem & Chấp nhận Báo giá để Đặt cọc/i,
    });
    expect(quoteLink).toHaveAttribute('href', '/customer/requests/101/quotes');
  });

  it('shows verified 30% deposit badge and unlocked driver assignment state once deposit is satisfied', async () => {
    vi.mocked(orderStatusApi.bookingFlowStatus).mockResolvedValue({
      orderId: 101,
      transportMode: 'ROAD',
      orderStatus: 'IN_PREPARATION',
      hasAcceptedQuote: true,
      quoteTotal: '3400.00',
      depositRequired: true,
      depositAmount: '1020.00',
      depositPaid: '1020.00',
      isDepositSatisfied: true,
      canAssignDriver: true,
      blockReason: null,
    });

    mount(makeOrder('ROAD', 'IN_PREPARATION'));

    expect(
      await screen.findByText(/Đã hoàn tất đặt cọc 30%/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Đã mở khóa phân công Tài xế & Phương tiện/i),
    ).toBeInTheDocument();
  });
});
