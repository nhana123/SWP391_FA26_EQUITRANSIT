import { describe, expect, it } from 'vitest';
import { horseForm, horseInput, validateHorse } from './form';
describe('horse replacement payload', () => {
  it('matches current microchip/passport formats and keeps unknown values null', () => {
    const form = horseForm();
    form.name = 'Test Horse';
    form.microchipId = 'invalid';
    form.passportNumber = 'abc';
    expect(validateHorse(form)).toHaveProperty('microchipId');
    expect(validateHorse(form)).toHaveProperty('passportNumber');
    form.microchipId = '985112003456789';
    form.passportNumber = 'FEI-10459921';
    expect(validateHorse(form)).toEqual({});
    form.microchipId = '  ';
    expect(horseInput(form).microchipId).toBeNull();
  });
  it('keeps unknown measurements null and sends no ownership or computed data', () => {
    const form = horseForm();
    form.name = 'Test Horse';
    const input = horseInput(form);
    expect(input.weightKg).toBeNull();
    expect(input.heightCm).toBeNull();
    expect(input.bodyWidthCm).toBeNull();
    expect(input).not.toHaveProperty('horseId');
    expect(input).not.toHaveProperty('measurementsComplete');
    expect(validateHorse(form)).toEqual({});
  });
  it('rejects zero, exponent notation and excessive decimal precision', () => {
    const form = horseForm();
    form.name = 'Test Horse';
    form.weightKg = '0';
    form.heightCm = '1e2';
    form.bodyWidthCm = '80.001';
    expect(Object.keys(validateHorse(form))).toEqual(
      expect.arrayContaining(['weightKg', 'heightCm', 'bodyWidthCm']),
    );
  });
});
