import type { Order } from '../../shared/api/contracts';
import { draftForm, draftInput } from '../transport-orders/form';
import type { Charge, Disclosure } from './contracts';

// Test fixtures only; never imported by runtime code.
export const testOrder = (patch: Partial<Order> = {}): Order => ({
  orderId: 11,
  orderNumber: 'ET-TEST-11',
  orderStatus: 'DRAFT',
  currency: 'USD',
  recordVersion: '00000000000000e1',
  currentRevisionId: null,
  currentPlanId: null,
  createdAt: '2030-01-01T00:00:00Z',
  updatedAt: '2030-01-01T00:00:00Z',
  draft: draftInput(Object.assign(draftForm(), { horseId: '5' }), null),
  ...patch,
});

export const testCharge = (patch: Partial<Charge> = {}): Charge => ({
  code: 'ROAD',
  uiSection: 'TRANSPORTATION',
  costGroup: 'TRANSPORTATION',
  label: 'Road transport',
  mandatory: true,
  selected: true,
  unit: 'KM',
  quantity: null,
  unitRate: null,
  amount: null,
  pricingStatus: 'RATE_AND_QUANTITY_PENDING',
  tariffId: null,
  tariffVersion: null,
  formula: 'ROAD km × rate',
  blockers: ['RATE_PENDING'],
  ...patch,
});

export const testDisclosure = (patch: Partial<Disclosure> = {}): Disclosure => ({
  orderId: 11,
  recordVersion: '00000000000000e1',
  revisionId: null,
  horseRecordVersion: '00000000000000f1',
  asOf: '2030-01-01T00:00:00Z',
  currency: 'USD',
  selected: null,
  sections: [
    { code: 'TRANSPORTATION', title: 'Transportation', options: ['EQUITRANSIT', 'CUSTOMER'] },
    { code: 'AIR_STALL', title: 'Available Air Stalls for Your Horse', options: ['WIDE'] },
    { code: 'HORSE_CARE', title: 'Horse Care', options: ['ENHANCED', 'GROOMING', 'BOARDING'] },
    { code: 'VETERINARY', title: 'Veterinary', options: ['EQUITRANSIT', 'CUSTOMER'] },
    { code: 'QUARANTINE', title: 'Quarantine Packages', options: ['STANDARD', 'ENHANCED'] },
    {
      code: 'INSURANCE',
      title: 'Insurance',
      options: ['NONE', 'EXISTING', 'MORTALITY', 'COMBINED'],
    },
    { code: 'ADDITIONAL_CHARGES', title: 'Additional Charges', options: ['SHOW_ALL'] },
  ],
  airStalls: [
    {
      option: 'WIDE',
      slots: 1.5,
      status: 'PENDING',
      policyId: null,
      policyVersion: null,
      reasons: ['FIT_POLICY_PENDING'],
    },
  ],
  quarantine: { applicability: 'UNKNOWN', requiredDays: null, assessmentId: null },
  charges: [testCharge()],
  knownSubtotal: '0.00',
  totalEstimate: null,
  payable: false,
  carrierConfirmation: 'NOT_CONFIRMED',
  ...patch,
});
