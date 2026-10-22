import { describe, expect, it } from 'vitest';
import {
  emptyLeg,
  validateFlight,
  validateLegs,
  validateRoad,
  validateQuarantine,
  validateStall,
  type LegForm,
} from './validation';

const leg = (patch: Partial<LegForm>): LegForm => ({
  ...emptyLeg('ROAD'),
  startPoint: 'Hanoi Stable',
  endPoint: 'Noi Bai Airport',
  distanceKm: '45.500',
  distanceSource: 'Verified route',
  plannedDeparture: '2027-02-01T06:00:00+07:00',
  plannedArrival: '2027-02-01T08:00:00+07:00',
  ...patch,
});
const road = leg({});
const air1 = leg({
  transportMode: 'AIR',
  startPoint: 'HAN',
  endPoint: 'SIN',
  distanceKm: '2200',
  plannedDeparture: '2027-02-01T10:00:00+07:00',
  plannedArrival: '2027-02-01T14:30:00+08:00',
  startTimezone: 'Asia/Ho_Chi_Minh',
  endTimezone: 'Asia/Singapore',
  plannedFlightNumber: 'VN661',
});
const air2 = leg({
  transportMode: 'AIR',
  startPoint: 'SIN',
  endPoint: 'LHR',
  distanceKm: '10880',
  plannedDeparture: '2027-02-01T23:00:00+08:00',
  plannedArrival: '2027-02-02T05:30:00Z',
  plannedFlightNumber: 'SQ322',
});

describe('plan leg builder rules (#80)', () => {
  it('requires reference, evidence and future expiry only for confirmed quarantine', () => {
    const reservation = {
      facilityName: 'Demo facility',
      reservationReference: '',
      startsAt: '2099-02-01T08:00:00Z',
      endsAt: '2099-02-03T08:00:00Z',
      status: 'HELD' as const,
      supplierId: '',
      evidenceFileKey: '',
      expiresAt: '',
      facilityContact: '',
    };
    expect(validateQuarantine(reservation, 1).errors).toEqual({});
    expect(
      Object.keys(validateQuarantine({ ...reservation, status: 'CONFIRMED' }, 1).errors).sort(),
    ).toEqual(['evidenceFileKey', 'expiresAt', 'reservationReference']);
    const confirmed = {
      ...reservation,
      status: 'CONFIRMED' as const,
      reservationReference: 'DEMO-REF',
      evidenceFileKey: 'demo/evidence.pdf',
      expiresAt: '2099-02-05T08:00:00Z',
    };
    expect(validateQuarantine(confirmed, 1).input).toMatchObject({ status: 'CONFIRMED' });
    expect(
      validateQuarantine({ ...confirmed, expiresAt: '2000-01-01T00:00:00Z' }, 1).errors,
    ).toHaveProperty('expiresAt');
  });
  it('keeps ROAD → AIR → AIR → ROAD with offsets, km as numbers and consecutive sequence', () => {
    const last = leg({
      startPoint: 'LHR',
      endPoint: 'Newmarket',
      plannedDeparture: '2027-02-02T08:00:00Z',
      plannedArrival: '2027-02-02T10:30:00Z',
    });
    const r = validateLegs([road, air1, air2, last]);
    expect(r.errors).toEqual({});
    expect(r.input!.map((l) => [l.sequenceNo, l.transportMode, l.distanceKm])).toEqual([
      [1, 'ROAD', 45.5],
      [2, 'AIR', 2200],
      [3, 'AIR', 10880],
      [4, 'ROAD', 45.5],
    ]);
    // Offsets are sent exactly as entered; flight numbers only on AIR legs.
    expect(r.input![1].plannedArrival).toBe('2027-02-01T14:30:00+08:00');
    expect(r.input![0].plannedFlightNumber).toBeNull();
    expect(r.input![2].plannedFlightNumber).toBe('SQ322');
  });

  it('rejects overlapping connections, reversed windows, bad zones and sourceless distances', () => {
    const r = validateLegs([
      road,
      leg({ ...air1, plannedDeparture: '2027-02-01T07:00:00+07:00' }),
      leg({
        plannedArrival: '2027-02-01T05:00:00+07:00',
        startTimezone: 'Mars/Base',
        distanceSource: ' ',
        distanceKm: '0',
      }),
    ]);
    expect(r.input).toBeNull();
    expect(r.errors['leg2.plannedDeparture']).toMatch(/before leg 1 arrives/);
    expect(Object.keys(r.errors)).toEqual(
      expect.arrayContaining([
        'leg3.plannedArrival',
        'leg3.startTimezone',
        'leg3.distanceSource',
        'leg3.distanceKm',
      ]),
    );
    expect(validateLegs([]).errors.legs).toBeDefined();
    expect(validateLegs(Array.from({ length: 21 }, () => road)).errors.legs).toBeDefined();
  });

  it('assigns a vehicle only with the version from an availability check of that vehicle', () => {
    const f = {
      vehicleId: '11',
      driverStaffId: '41',
      driverBufferMinutes: '60',
      conflictNotes: '',
    };
    expect(validateRoad(f, null).errors.vehicleId).toMatch(/Check this vehicle/);
    expect(
      validateRoad(f, { id: 12, recordVersion: '000000000001A2B3' }).errors.vehicleId,
    ).toBeDefined();
    expect(validateRoad(f, { id: 11, recordVersion: '000000000001A2B3' }).input).toEqual({
      vehicleId: 11,
      vehicleRecordVersion: '000000000001A2B3',
      driverStaffId: 41,
      driverBufferMinutes: 60,
      conflictNotes: null,
    });
    expect(
      validateRoad({ ...f, driverBufferMinutes: '' }, { id: 11, recordVersion: '000000000001A2B3' })
        .errors,
    ).toHaveProperty('driverBufferMinutes');
  });

  it('confirms a stall only when the carrier accepted it with proof', () => {
    const f = {
      stallId: '12',
      carrierAcceptanceStatus: 'PENDING' as const,
      status: 'CONFIRMED' as const,
      positionDescription: '',
      carrierApprovalFileKey: '',
      carrierContact: '',
    };
    const checked = { id: 12, recordVersion: '000000000001A2B3' };
    expect(Object.keys(validateStall(f, checked).errors).sort()).toEqual([
      'carrierAcceptanceStatus',
      'carrierApprovalFileKey',
    ]);
    expect(validateStall({ ...f, status: 'HELD' }, checked).errors).toEqual({});
    expect(
      validateStall(
        { ...f, carrierAcceptanceStatus: 'ACCEPTED', carrierApprovalFileKey: 'carrier-ok.pdf' },
        checked,
      ).input,
    ).toMatchObject({ stallRecordVersion: '000000000001A2B3', status: 'CONFIRMED' });
  });

  it('keeps HELD distinct from CONFIRMED and sends capacity as a number', () => {
    const f = {
      offerId: '501',
      airlineName: 'Vietnam Airlines Cargo',
      flightNumber: 'VN0051',
      reservationReference: '',
      status: 'HELD' as const,
      evidenceFileKey: '',
      expiresAt: '',
      supplierContact: '',
      usableCapacitySlots: '3.0',
    };
    expect(validateFlight(f).input).toMatchObject({
      status: 'HELD',
      usableCapacitySlots: 3,
      reservationReference: null,
    });
    const confirmed = validateFlight({ ...f, status: 'CONFIRMED' });
    expect(Object.keys(confirmed.errors).sort()).toEqual([
      'evidenceFileKey',
      'expiresAt',
      'reservationReference',
    ]);
    expect(validateFlight({ ...f, usableCapacitySlots: '1.25' }).errors).toHaveProperty(
      'usableCapacitySlots',
    );
  });
});
