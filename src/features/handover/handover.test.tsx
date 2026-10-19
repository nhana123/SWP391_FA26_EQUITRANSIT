import { setDateTime } from '../../test/date-time';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import {
  ActualCosts,
  CustomerHandovers,
  LegHandovers,
  Profitability,
  validateHandover,
} from './panels';
import { handoverApi } from './api';
import { ApiError } from '../../shared/api/client';
import type { Role } from '../../shared/api/contracts';
import { queryClient } from '../../shared/api/query';
import { startSession } from '../../shared/api/session';

const handover = (patch: Record<string, unknown> = {}) => ({
  handoverId: 71,
  legId: 903,
  orderId: 101,
  planId: 801,
  recordedByName: 'Antoine Dupont',
  handoverType: 'INTERMEDIATE_AIRPORT',
  handoverTime: '2026-10-18T07:00:00Z',
  receivedByName: 'Markus Vance',
  receiverAuthority: null,
  receiverSignatureFileKey: null,
  horseConditionStatus: 'GOOD',
  outcome: 'SUCCESSFUL',
  exceptionNotes: null,
  photoFileKey: null,
  locationDescription: null,
  customerDecision: null,
  customerFeedback: null,
  customerRespondedAt: null,
  ...patch,
});
const customerView = (patch: Record<string, unknown> = {}) => ({
  handoverId: 72,
  orderId: 101,
  handoverType: 'FINAL_RECEIVER',
  handoverTime: '2026-10-18T09:00:00Z',
  receivedByName: 'Jean-Pierre Dubois',
  horseConditionStatus: 'EXCELLENT',
  outcome: 'SUCCESSFUL',
  photoFileKey: 'photos/stall.jpg',
  receiverSignatureFileKey: 'signatures/dubois.png',
  locationDescription: 'Stall 12',
  customerDecision: null,
  customerFeedback: null,
  customerRespondedAt: null,
  ...patch,
});
const cost = {
  costId: 5,
  planId: 801,
  legId: 902,
  costCode: 'AIR_FREIGHT',
  amount: '1850.5',
  currency: 'USD',
  incurredAt: '2026-10-18T05:00:00Z',
  description: 'Airway bill 618',
  recordedByName: 'Claire Martin',
  evidenceFileKey: null,
};

beforeEach(() => {
  queryClient.clear();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function mount(role: Role, ui: ReactNode) {
  startSession({ accessToken: 'test-only', tokenType: 'Bearer', expiresIn: 60, role });
  render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
  return userEvent.setup({ delay: null });
}
const fill = async (user: ReturnType<typeof userEvent.setup>, field: HTMLElement, text: string) => {
  await user.click(field);
  await user.paste(text);
};

describe('handover rules (F14)', () => {
  const base = {
    kind: 'FINAL_RECEIVER' as const,
    handoverTime: '2026-10-18T09:00:00Z',
    receivedByName: 'Jean-Pierre Dubois',
    receiverAuthority: '',
    receiverSignatureFileKey: '',
    photoFileKey: '',
    horseConditionStatus: 'GOOD' as const,
    outcome: 'SUCCESSFUL' as const,
    exceptionNotes: '',
    locationDescription: '',
  };
  it('final delivery needs signature and photo; problems need notes; no future time', () => {
    expect(Object.keys(validateHandover(base)).sort()).toEqual([
      'photoFileKey',
      'receiverSignatureFileKey',
    ]);
    expect(
      validateHandover({ ...base, kind: 'INTERMEDIATE_AIRPORT', outcome: 'EXCEPTION' }),
    ).toEqual({ exceptionNotes: 'Describe what went wrong.' });
    expect(
      validateHandover({
        ...base,
        kind: 'INTERMEDIATE_CARRIER',
        handoverTime: new Date(Date.now() + 3_600_000).toISOString().replace(/\.\d{3}Z$/, 'Z'),
      }).handoverTime,
    ).toMatch(/future/);
  });
});

describe('leg handover (F14)', () => {
  it('a driver records final delivery on the last leg through the driver route', async () => {
    vi.spyOn(handoverApi, 'forLeg').mockResolvedValue([]);
    const final = vi.spyOn(handoverApi, 'finalDelivery').mockResolvedValue({
      handoverId: 72,
      orderId: 101,
      planId: 801,
      legId: 903,
      orderStatus: 'DELIVERED',
      planStatus: 'COMPLETED',
      completedAt: '2026-10-18T09:05:00Z',
      receivedByName: 'Jean-Pierre Dubois',
      horseConditionStatus: 'EXCELLENT',
      quarantineReleaseVerified: true,
    });
    const onRecorded = vi.fn().mockResolvedValue(undefined);
    const user = mount(
      'DRIVER',
      <LegHandovers legId={903} asDriver finalLeg onRecorded={onRecorded} />,
    );
    const form = within(await screen.findByRole('form', { name: 'Record handover' }));
    expect(form.getByLabelText('Handover type')).toHaveValue('FINAL_RECEIVER');
    setDateTime(form.getByLabelText('Handover time'), '2026-10-18T09:00:00Z');
    await fill(user, form.getByLabelText('Received by'), 'Jean-Pierre Dubois');
    await fill(user, form.getByLabelText(/Receiver authority/), 'STABLE_MANAGER');
    await fill(user, form.getByLabelText('Receiver signature file'), 'signatures/dubois.png');
    await fill(user, form.getByLabelText('Handover photo file'), 'photos/stall.jpg');
    await user.selectOptions(form.getByLabelText('Horse condition'), 'EXCELLENT');
    await user.click(form.getByRole('button', { name: 'Record final delivery' }));
    await waitFor(() => expect(final).toHaveBeenCalledTimes(1));
    expect(final).toHaveBeenCalledWith(true, 903, {
      handoverTime: '2026-10-18T09:00:00Z',
      receivedByName: 'Jean-Pierre Dubois',
      receiverAuthority: 'STABLE_MANAGER',
      receiverSignatureFileKey: 'signatures/dubois.png',
      horseConditionStatus: 'EXCELLENT',
      outcome: 'SUCCESSFUL',
      exceptionNotes: null,
      photoFileKey: 'photos/stall.jpg',
      locationDescription: null,
    });
    await waitFor(() =>
      expect(onRecorded).toHaveBeenCalledWith(expect.stringMatching(/DELIVERED.*not settle/)),
    );
  });

  it('a middle leg offers only intermediate types and shows recorded handovers', async () => {
    vi.spyOn(handoverApi, 'forLeg').mockResolvedValue([handover()]);
    const intermediate = vi.spyOn(handoverApi, 'intermediate').mockResolvedValue(handover());
    const user = mount(
      'COORDINATOR',
      <LegHandovers legId={902} asDriver={false} finalLeg={false} onRecorded={vi.fn()} />,
    );
    expect(await screen.findByText(/Markus Vance/)).toBeInTheDocument();
    const form = within(screen.getByRole('form', { name: 'Record handover' }));
    expect(form.queryByRole('option', { name: 'Final delivery to receiver' })).toBeNull();
    setDateTime(form.getByLabelText('Handover time'), '2026-10-18T07:00:00Z');
    await fill(user, form.getByLabelText('Received by'), 'Markus Vance');
    await user.click(form.getByRole('button', { name: 'Record handover' }));
    await waitFor(() => expect(intermediate).toHaveBeenCalledTimes(1));
    expect(intermediate.mock.calls[0][0]).toBe(false);
    expect(intermediate.mock.calls[0][2]).toMatchObject({ handoverType: 'INTERMEDIATE_AIRPORT' });
  });

  it('explains a blocked final delivery and locks after an unknown result', async () => {
    vi.spyOn(handoverApi, 'forLeg').mockResolvedValue([]);
    const final = vi
      .spyOn(handoverApi, 'finalDelivery')
      .mockRejectedValueOnce(new ApiError(409, 'Blocked', 'QUARANTINE_RELEASE_REQUIRED'))
      .mockRejectedValueOnce(new ApiError(0, 'Network'));
    const user = mount(
      'MANAGER',
      <LegHandovers legId={903} asDriver={false} finalLeg onRecorded={vi.fn()} />,
    );
    const form = within(await screen.findByRole('form', { name: 'Record handover' }));
    setDateTime(form.getByLabelText('Handover time'), '2026-10-18T09:00:00Z');
    await fill(user, form.getByLabelText('Received by'), 'Owner');
    await fill(user, form.getByLabelText('Receiver signature file'), 'sig');
    await fill(user, form.getByLabelText('Handover photo file'), 'photo');
    const button = form.getByRole('button', { name: 'Record final delivery' });
    await user.click(button);
    expect(await screen.findByText(/quarantine release has not passed/)).toBeInTheDocument();
    await user.click(button);
    expect(await screen.findByText(/cannot be safely repeated/)).toBeInTheDocument();
    expect(button).toBeDisabled();
    expect(final).toHaveBeenCalledTimes(2);
  });
});

describe('customer delivery answer (F14)', () => {
  it('asks for details before reporting a problem, then sends the answer once', async () => {
    vi.spyOn(handoverApi, 'customerList').mockResolvedValue([customerView()]);
    const decide = vi
      .spyOn(handoverApi, 'decide')
      .mockResolvedValue(customerView({ customerDecision: 'EXCEPTION' }));
    const user = mount('CUSTOMER', <CustomerHandovers orderId={101} />);
    const form = within(await screen.findByRole('form', { name: 'Delivery answer' }));
    expect(screen.getByText('signatures/dubois.png')).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(/cost|Antoine|recorded by/i);
    await user.click(form.getByLabelText('Delivered with a problem'));
    await user.click(form.getByRole('button', { name: 'Send answer' }));
    expect(
      await form.findByText('Describe the problem so staff can follow up.'),
    ).toBeInTheDocument();
    expect(decide).not.toHaveBeenCalled();
    await fill(user, form.getByLabelText('What is wrong'), 'Small scratch on left hind leg.');
    await user.click(form.getByRole('button', { name: 'Send answer' }));
    await waitFor(() =>
      expect(decide).toHaveBeenCalledWith(101, 72, 'EXCEPTION', 'Small scratch on left hind leg.'),
    );
  });

  it('shows a recorded answer without a form, and no form for transfers', async () => {
    vi.spyOn(handoverApi, 'customerList').mockResolvedValue([
      customerView({ handoverId: 70, handoverType: 'INTERMEDIATE_AIRPORT' }),
      customerView({
        customerDecision: 'ACCEPTED',
        customerRespondedAt: '2026-10-18T10:00:00Z',
      }),
    ]);
    mount('CUSTOMER', <CustomerHandovers orderId={101} />);
    expect(await screen.findByText('I accept the delivery')).toBeInTheDocument();
    expect(screen.getByText(/no answer is needed from you/)).toBeInTheDocument();
    expect(screen.queryByRole('form', { name: 'Delivery answer' })).toBeNull();
  });
});

describe('actual costs and profitability (F14)', () => {
  it('lists plan costs and records a new one with a numeric amount', async () => {
    vi.spyOn(handoverApi, 'costs').mockResolvedValue([cost]);
    const add = vi.spyOn(handoverApi, 'addCost').mockResolvedValue({ ...cost, costId: 6 });
    const user = mount(
      'COORDINATOR',
      <ActualCosts
        planId={801}
        legs={[
          { legId: 901, sequenceNo: 1 },
          { legId: 902, sequenceNo: 2 },
        ]}
        canWrite
      />,
    );
    const table = await screen.findByRole('table', { name: 'Actual costs' });
    expect(table).toHaveTextContent('USD 1850.5');
    expect(table).toHaveTextContent('Leg 2');
    const form = within(screen.getByRole('form', { name: 'Record actual cost' }));
    await user.selectOptions(form.getByLabelText('Leg'), '901');
    await user.selectOptions(form.getByLabelText('Cost type'), 'ROAD_TOLL');
    await fill(user, form.getByLabelText('Amount'), '-5');
    setDateTime(form.getByLabelText('Incurred at'), '2026-10-18T05:00:00Z');
    await user.click(form.getByRole('button', { name: 'Record cost' }));
    expect(await form.findByText(/non-negative amount/)).toBeInTheDocument();
    await user.clear(form.getByLabelText('Amount'));
    await fill(user, form.getByLabelText('Amount'), '42.50');
    await user.click(form.getByRole('button', { name: 'Record cost' }));
    await waitFor(() =>
      expect(add).toHaveBeenCalledWith(801, {
        legId: 901,
        costCode: 'ROAD_TOLL',
        amount: 42.5,
        currency: 'USD',
        incurredAt: '2026-10-18T05:00:00Z',
        description: null,
        evidenceFileKey: null,
      }),
    );
    expect(await screen.findByText('Cost 6 recorded.')).toBeInTheDocument();
  });

  it('shows the manager margin without calling it a settlement', async () => {
    vi.spyOn(handoverApi, 'profitability').mockResolvedValue({
      planId: 801,
      orderId: 101,
      currency: 'USD',
      totalQuotedAmount: '14500',
      totalActualCost: '10300',
      grossProfit: '4200',
      profitMarginPercent: '28.97',
      costCount: 4,
    });
    mount('MANAGER', <Profitability planId={801} />);
    expect(await screen.findByText('28.97%')).toBeInTheDocument();
    expect(screen.getByText('USD 4200')).toBeInTheDocument();
    expect(screen.getByText(/not a payment or settlement status/)).toBeInTheDocument();
  });
});

describe('handover adapter (F14)', () => {
  it('uses the role routes and methods from the BE controllers', async () => {
    startSession({ accessToken: 'test-only', tokenType: 'Bearer', expiresIn: 60, role: 'DRIVER' });
    const fetch = vi
      .fn()
      .mockImplementation(() => Promise.resolve(new Response('[]', { status: 200 })));
    vi.stubGlobal('fetch', fetch);
    await handoverApi.forLeg(true, 903);
    await handoverApi.forLeg(false, 903);
    await handoverApi.costs(801);
    await handoverApi.customerList(101);
    const origin = 'http://127.0.0.1:8080';
    expect(fetch.mock.calls.map((c) => c[0])).toEqual([
      `${origin}/api/driver/legs/903/handovers`,
      `${origin}/api/coordinator/legs/903/handovers`,
      `${origin}/api/coordinator/plans/801/actual-costs`,
      `${origin}/api/customer/transport-orders/101/handovers`,
    ]);
    fetch.mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify(customerView()), { status: 200 })),
    );
    await handoverApi.decide(101, 72, 'ACCEPTED', null);
    expect(fetch.mock.calls[4][0]).toBe(
      `${origin}/api/customer/transport-orders/101/handovers/72/decision`,
    );
    expect(fetch.mock.calls[4][1].method).toBe('PUT');
    expect(JSON.parse(fetch.mock.calls[4][1].body)).toEqual({
      decision: 'ACCEPTED',
      feedback: null,
    });
  });
});
