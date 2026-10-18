import { describe, expect, it } from 'vitest';
import { fromValues, toValues, validSafeUrl } from './forms';
import { catalogs, type PolicyData } from './contracts';

const vehicle = {
  vehicleCode: ' VEH-1 ',
  plateNumber: '51C-1',
  horseCapacity: '2',
  climateSystemType: 'Ventilation',
  status: 'ACTIVE',
  ownerSupplierId: '',
  maintenanceFrom: '',
  maintenanceTo: '',
  documentExpiresAt: '2028-01-01T00:00:00Z',
  bufferMinutes: '60',
  notes: '   ',
};
const policy = {
  ...toValues('fit-policies', null),
  policyCode: 'CARRIER-WIDE',
  slotQuantity: '1.5',
  effectiveFrom: '2027-01-01T00:00:00Z',
};

describe('resource form conversion (#79)', () => {
  it('sends trimmed text, null for empty optionals and the whole window', () => {
    expect(fromValues('vehicles', vehicle)).toEqual({
      errors: {},
      data: {
        vehicleCode: 'VEH-1',
        plateNumber: '51C-1',
        horseCapacity: 2,
        climateSystemType: 'Ventilation',
        status: 'ACTIVE',
        ownerSupplierId: null,
        window: {
          maintenanceFrom: null,
          maintenanceTo: null,
          documentExpiresAt: '2028-01-01T00:00:00Z',
          bufferMinutes: 60,
          notes: null,
        },
      },
    });
  });

  it('sends size/slot decimals as JSON numbers, not strings', () => {
    const { data } = fromValues('stalls', {
      ...toValues('stalls', null),
      stallCode: 'STALL-1',
      capacitySlots: '3.0',
      internalHeightCm: '240.50',
      internalWidthCm: '90',
      weightLimitKg: '',
      bufferMinutes: '0',
    });
    expect(data).toMatchObject({
      capacitySlots: 3,
      internalHeightCm: 240.5,
      internalWidthCm: 90,
      weightLimitKg: null,
    });
    expect(fromValues('fit-policies', policy).data).toMatchObject({ slotQuantity: 1.5 });
  });

  it('rejects precision beyond the DTO, a missing buffer and invalid windows', () => {
    const { errors } = fromValues('stalls', {
      ...toValues('stalls', null),
      stallCode: 'S',
      capacitySlots: '1.25',
      internalHeightCm: '0',
      internalWidthCm: '1234567',
      bufferMinutes: '',
      maintenanceTo: '2027-01-02T00:00:00Z',
    });
    expect(Object.keys(errors).sort()).toEqual([
      'bufferMinutes',
      'capacitySlots',
      'internalHeightCm',
      'internalWidthCm',
      'maintenanceTo',
    ]);
    expect(
      fromValues('vehicles', {
        ...vehicle,
        maintenanceFrom: '2027-01-02T00:00:00Z',
        maintenanceTo: '2027-01-01T00:00:00Z',
      }).errors.maintenanceTo,
    ).toMatch(/follow its start/);
    expect(fromValues('vehicles', { ...vehicle, bufferMinutes: '525601' }).errors).toHaveProperty(
      'bufferMinutes',
    );
  });

  it('never infers an approval: APPROVED needs all three limits and a real source', () => {
    const approved = fromValues('fit-policies', { ...policy, status: 'APPROVED' });
    expect(approved.data).toBeNull();
    expect(Object.keys(approved.errors).sort()).toEqual([
      'maxHeightCm',
      'maxWeightKg',
      'maxWidthCm',
      'sourceUrl',
    ]);
    const sourced = fromValues('fit-policies', {
      ...policy,
      status: 'APPROVED',
      maxWeightKg: '650',
      maxHeightCm: '190',
      maxWidthCm: '90',
      sourceFileKey: '0849d3a2-8d0c-4b75-8855-aeb8c16c71b9',
    });
    expect(sourced.errors).toEqual({});
    // A draft may stay incomplete; nothing is filled in for it.
    expect(fromValues('fit-policies', policy).data).toMatchObject({
      maxWeightKg: null,
      sourceUrl: null,
      status: 'DRAFT',
    });
  });

  it('accepts only 1, 1.5 or 3 slots and credential-free HTTP(S) sources', () => {
    expect(fromValues('fit-policies', { ...policy, slotQuantity: '2' }).errors).toHaveProperty(
      'slotQuantity',
    );
    expect(validSafeUrl('https://carrier.example.com/policy')).toBe(true);
    expect(validSafeUrl('https://user:pw@carrier.example.com/policy')).toBe(false);
    expect(validSafeUrl('ftp://carrier.example.com/policy')).toBe(false);
  });

  it('validates supplier contacts and keeps active as a real boolean', () => {
    const base = { ...toValues('suppliers', null), name: 'Partner', services: 'Road\nAir stall' };
    expect(fromValues('suppliers', { ...base, active: 'false' }).data).toMatchObject({
      services: ['Road', 'Air stall'],
      active: false,
      email: null,
    });
    const bad = fromValues('suppliers', {
      ...base,
      email: 'nope',
      phone: '12',
      services: 'Road\nRoad',
    });
    expect(Object.keys(bad.errors).sort()).toEqual(['email', 'phone', 'services']);
  });

  it('reads server BigDecimal numbers back as text for editing', () => {
    const view = catalogs['fit-policies'].view.parse({
      id: 3,
      recordVersion: '00000000000000a1',
      version: 2,
      reviewedBy: 31,
      reviewedAt: '2027-01-01T00:00:00Z',
      data: {
        policyCode: 'CARRIER-WIDE',
        stallId: null,
        carrierSupplierId: 21,
        slotQuantity: 1.5,
        maxWeightKg: 650,
        maxHeightCm: 190,
        maxWidthCm: 90,
        effectiveFrom: '2027-01-01T00:00:00Z',
        effectiveTo: null,
        sourceUrl: 'https://carrier.example.com/fit-policy',
        sourceFileKey: null,
        status: 'APPROVED',
      },
    });
    const data: PolicyData = view.data;
    expect(data.slotQuantity).toBe('1.5');
    expect(toValues('fit-policies', data)).toMatchObject({
      slotQuantity: '1.5',
      maxWeightKg: '650',
    });
  });
});
