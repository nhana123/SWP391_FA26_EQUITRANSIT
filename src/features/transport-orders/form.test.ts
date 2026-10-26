import { describe, expect, it } from 'vitest';
import { draftForm, draftInput, horseGaps, validateDraft } from './form';
import type { Horse } from '../../shared/api/contracts';
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
  it('requires the route, schedule, receiver and health declaration to submit', () => {
    const form = draftForm();
    Object.assign(form, {
      receiverName: 'Alex Receiver',
      receiverPhone: '+6590123456',
      influenzaVaccinated: 'false',
      declaredAccurate: 'true',
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
  it('blocks submission without the receiver or a confirmed health declaration', () => {
    const errors = validateDraft(draftForm(), true);
    expect(errors).toMatchObject({
      receiverName: 'Complete this field before submitting.',
      receiverPhone: 'Complete this field before submitting.',
      influenzaVaccinated: 'Answer the equine influenza question before submitting.',
      declaredAccurate: 'Confirm the declaration before submitting.',
    });
    // Drafts may stay incomplete.
    expect(validateDraft(draftForm())).toEqual({});
  });
  it('needs a past dose date for a vaccinated horse and keeps it in the request', () => {
    const form = Object.assign(draftForm(), {
      influenzaVaccinated: 'true',
      declaredAccurate: 'true',
    });
    expect(validateDraft(form, true)).toHaveProperty(
      'lastInfluenzaVaccinationDate',
      'Enter the date of the last dose.',
    );
    form.lastInfluenzaVaccinationDate = '2030-01-02';
    expect(validateDraft(form, false, Date.parse('2030-01-01T00:00:00Z'))).toHaveProperty(
      'lastInfluenzaVaccinationDate',
      'The last dose cannot be in the future.',
    );
    form.lastInfluenzaVaccinationDate = '2029-12-01';
    form.vaccinationRecordReference = ' Passport p.12 ';
    expect(draftInput(form, null).healthDeclaration).toEqual({
      influenzaVaccinated: true,
      lastInfluenzaVaccinationDate: '2029-12-01',
      vaccinationRecordReference: 'Passport p.12',
      healthNotes: null,
      declaredAccurate: true,
    });
    // A "No" answer never sends a dose date.
    form.influenzaVaccinated = 'false';
    expect(draftInput(form, null).healthDeclaration?.lastInfluenzaVaccinationDate).toBeNull();
    expect(draftInput(draftForm(), null).healthDeclaration).toBeNull();
    expect(draftForm(draftInput(form, null))).toMatchObject({
      influenzaVaccinated: 'false',
      declaredAccurate: 'true',
    });
  });
  it('lists the identity and size facts a horse still lacks', () => {
    const horse = {
      microchipId: null,
      passportNumber: 'FEI-1',
      dateOfBirth: null,
      sexCode: 'MARE',
      weightKg: 0,
      heightCm: 160,
    } as unknown as Horse;
    expect(horseGaps(horse)).toEqual(['microchip number', 'date of birth', 'weight']);
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
  it('serializes and restores Step 1 route selections (mode, city, airport, stall) into draft.route', () => {
    const form = Object.assign(draftForm(), {
      originCountryCode: 'VN',
      destinationCountryCode: 'FR',
      transportMode: 'AIR',
      originAirportCode: 'han',
      destinationAirportCode: 'cdg',
    });
    const draft = draftInput(form, { airStall: 'WIDE' });
    expect(draft.route).toEqual({
      originCountryCode: 'VN',
      originCity: null,
      originAirportCode: 'HAN',
      destinationCountryCode: 'FR',
      destinationCity: null,
      destinationAirportCode: 'CDG',
      transportMode: 'AIR',
      airStallPreference: 'WIDE',
    });
    expect(draftForm(draft)).toMatchObject({
      transportMode: 'AIR',
      originAirportCode: 'HAN',
      destinationAirportCode: 'CDG',
    });
  });
});
