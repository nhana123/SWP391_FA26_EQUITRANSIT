import { describe, expect, it } from 'vitest';
import { captureTokenLink, clearCapturedToken, getCapturedToken } from './token';
import { passwordErrors, safeReturnTo } from './validation';
import { horseSchema } from '../api/contracts';
describe('public token and credential handling', () => {
  it('strips token before rendering and survives repeated reads under StrictMode', () => {
    history.replaceState(null, '', '/verify-email?token=test-token&source=mail');
    captureTokenLink();
    expect(location.search).toBe('?source=mail');
    expect(getCapturedToken('/verify-email')).toBe('test-token');
    expect(getCapturedToken('/verify-email')).toBe('test-token');
    expect(getCapturedToken('/reset-password')).toBeNull();
    clearCapturedToken();
    expect(getCapturedToken('/verify-email')).toBeNull();
    history.replaceState(null, '', '/');
  });
  it('checks bcrypt UTF-8 limit without trimming passwords', () => {
    const p = 'ề'.repeat(25);
    expect(passwordErrors(p, p).password).toBeDefined();
    expect(passwordErrors(' 1234567890 ', ' 1234567890 ')).toEqual({});
    expect(passwordErrors(' 1234567890 ', '1234567890')).toHaveProperty('confirmPassword');
  });
  it('rejects external return targets and unsafe integer IDs', () => {
    expect(safeReturnTo('//evil.example')).toBe('/customer/horses');
    expect(safeReturnTo('/customer/\\evil')).toBe('/customer/horses');
    expect(safeReturnTo('/customer/requests/new')).toBe('/customer/requests/new');
    expect(horseSchema.shape.horseId.safeParse(9007199254740992).success).toBe(false);
  });
});
