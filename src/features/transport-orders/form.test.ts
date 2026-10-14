import { describe, expect, it } from 'vitest';
import { draftForm, draftInput, validateDraft } from './form';
describe('draft and submit contracts', () => {
  it('requires departure/import type and matches current phone/timezone patterns', () => {
    const form = draftForm();
    expect(validateDraft(form, true)).toHaveProperty('preferredDepartureAt');
    expect(validateDraft(form, true)).toHaveProperty('importType');
    form.receiverPhone = '090 123 4567';
    form.originTimezone = 'UTC';
    expect(validateDraft(form)).toHaveProperty('receiverPhone');
    expect(validateDraft(form)).toHaveProperty('originTimezone');
    form.receiverPhone = '+84901234567';
    form.originTimezone = 'Etc/UTC';
    expect(validateDraft(form)).toEqual({});
  });
  it('allows partial drafts and preserves complete services during itinerary changes', () => {
    const form = draftForm();
    form.originAddress = 'Updated stable';
    const services = {
      insurance: 'EXISTING' as const,
      existingPolicyReference: 'test-ref',
      declaredValue: '50000.00',
      roadProviderName: 'Chosen provider',
      groomingDays: 2,
    };
    expect(validateDraft(form)).toEqual({});
    expect(draftInput(form, services).services).toEqual(services);
    expect(draftInput(form, services).horseId).toBeNull();
  });
  it('requires only the backend submission requirements', () => {
    const form = draftForm();
    Object.assign(form, {
      horseId: '1',
      originCountryCode: 'VN',
      destinationCountryCode: 'GB',
      originAddress: 'A',
      destinationAddress: 'B',
      originTimezone: 'Asia/Ho_Chi_Minh',
      destinationTimezone: 'Europe/London',
      preferredDepartureAt: '2030-02-01T08:00:00Z',
      deliveryDeadline: '2030-02-01T18:00:00Z',
      importType: 'NEEDS_ADVICE',
    });
    expect(validateDraft(form, true, Date.parse('2029-01-01T00:00:00Z'))).toEqual({});
    form.destinationCountryCode = 'VN';
    expect(validateDraft(form, true)).toHaveProperty('destinationCountryCode');
  });
  it('checks dates without using machine timezone and preserves UTC offsets', () => {
    const form = draftForm();
    form.preferredDepartureAt = '2030-02-01T09:00:00+07:00';
    form.deliveryDeadline = '2030-02-01T01:00:00Z';
    expect(validateDraft(form)).toHaveProperty('preferredDepartureAt');
    form.deliveryDeadline = '2030-02-02T10:00:00Z';
    expect(draftInput(form, null).preferredDepartureAt).toBe('2030-02-01T09:00:00+07:00');
    form.eventStartAt = '2030-02-02T09:00:00Z';
    expect(validateDraft(form)).toHaveProperty('deliveryDeadline');
  });
});
