import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { JourneyStudioCanvas, wireState } from './JourneyStudioCanvas';
import { cascade, connect, emptyJourney, newNode, type Journey } from './model';

/** ORIGIN -> REST_STOP -> DESTINATION with explicit +07:00 times. */
function chain(secondDeparture: string): Journey {
  let j = emptyJourney();
  j.nodes = [
    { ...newNode('ORIGIN', 0), nodeKey: 'a', locationName: 'Stable', countryCode: 'VN' },
    {
      ...newNode('REST_STOP', 1),
      nodeKey: 'b',
      locationName: 'Rest',
      countryCode: 'VN',
      dwellMinutes: 60,
    },
    { ...newNode('DESTINATION', 2), nodeKey: 'c', locationName: 'Airport', countryCode: 'VN' },
  ];
  j = connect(j, 'a', 'b');
  j = connect(j, 'b', 'c');
  j.wires[0] = {
    ...j.wires[0],
    distanceKm: '45',
    plannedDeparture: '2027-02-01T06:00:00+07:00',
    plannedArrival: '2027-02-01T08:00:00+07:00',
  };
  j.wires[1] = {
    ...j.wires[1],
    distanceKm: '30',
    plannedDeparture: secondDeparture,
    plannedArrival: '2027-02-01T12:00:00+07:00',
  };
  return j;
}

describe('Journey Studio wire capsule states', () => {
  it('flags a leg departing before arrival plus rest as a timing conflict', () => {
    const j = chain('2027-02-01T08:30:00+07:00');
    expect(wireState(j, j.wires[0])).toBe('pending');
    expect(wireState(j, j.wires[1])).toBe('bad');
  });

  it('turns ready only when vehicle and driver are both attached', () => {
    const j = chain('2027-02-01T09:00:00+07:00');
    expect(wireState(j, { ...j.wires[0], vehicleId: 1 })).toBe('pending');
    expect(wireState(j, { ...j.wires[0], vehicleId: 1, driverStaffId: 2 })).toBe('road');
  });

  it('cascade pushes the conflicting leg past the rest stop and clears the warning', () => {
    const fixed = cascade(chain('2027-02-01T08:30:00+07:00'));
    expect(Date.parse(fixed.wires[1].plannedDeparture)).toBe(
      Date.parse('2027-02-01T09:00:00+07:00'),
    );
    expect(wireState(fixed, fixed.wires[1])).not.toBe('bad');
  });

  it('offers the 1-click auto-align only on red wires and only when editable', async () => {
    const onAutoFix = vi.fn();
    const j = chain('2027-02-01T08:30:00+07:00');
    const { rerender } = render(
      <JourneyStudioCanvas
        journey={j}
        onChange={() => undefined}
        editable
        selection={null}
        select={() => undefined}
        onAutoFix={onAutoFix}
      />,
    );
    const buttons = screen.getAllByRole('button', { name: /Tự động đẩy khớp giờ/ });
    expect(buttons).toHaveLength(1);
    await userEvent.setup({ delay: null }).click(buttons[0]);
    expect(onAutoFix).toHaveBeenCalledOnce();
    rerender(
      <JourneyStudioCanvas
        journey={j}
        onChange={() => undefined}
        editable={false}
        selection={null}
        select={() => undefined}
      />,
    );
    expect(screen.queryByRole('button', { name: /Tự động đẩy khớp giờ/ })).toBeNull();
  });

  it.each([false, true])(
    'shows recorded leg status without missing-resource claims for redacted public views (driver=%s)',
    async (driverMode) => {
      const j = chain('2027-02-01T09:00:00+07:00');
      j.wires[0] = { ...j.wires[0], legStatus: 'COMPLETED' };
      render(
        <JourneyStudioCanvas
          journey={j}
          onChange={() => undefined}
          editable={false}
          selection={null}
          select={() => undefined}
          driverMode={driverMode}
          resourceDetailsVisible={false}
        />,
      );
      const capsule = screen.getByRole('button', { name: 'Chặng 1 ROAD – xem chi tiết' });
      expect(capsule).toHaveTextContent('COMPLETED');
      expect(screen.queryByText('Chưa gán xe')).not.toBeInTheDocument();
      await userEvent.setup({ delay: null }).hover(capsule);
      const tooltip = screen.getByRole('tooltip');
      expect(tooltip).toHaveTextContent('COMPLETED');
      expect(tooltip).not.toHaveTextContent(/Chưa đủ tài nguyên|Sẵn sàng|Tài xế|Air stall/);
    },
  );

  it('retains missing-resource context for an internal plan even when its layout is read-only', async () => {
    render(
      <JourneyStudioCanvas
        journey={chain('2027-02-01T09:00:00+07:00')}
        onChange={() => undefined}
        editable={false}
        selection={null}
        select={() => undefined}
      />,
    );
    const capsule = screen.getByRole('button', { name: 'Chặng 1 ROAD – xem chi tiết' });
    expect(capsule).toHaveTextContent('Chưa gán xe');
    await userEvent.setup({ delay: null }).hover(capsule);
    expect(screen.getByRole('tooltip')).toHaveTextContent('Chưa đủ tài nguyên');
  });
});
