import { describe, expect, it } from 'vitest';
import { fileProblem, MAX_FILE_BYTES } from './files';
import {
  validateAssessment,
  validateAuthority,
  validateChecklist,
  validateRule,
  validateUpload,
  type AuthorityForm,
} from './validation';

const file = { fileName: 'cert.png', contentType: 'image/png', contentBase64: 'iVBORw0KGgo=' };
const rule = {
  phase: 'PRE_EXPORT' as const,
  ruleCode: 'vn-gb-health',
  documentType: 'health_certificate',
  displayName: 'Veterinary health certificate',
  transitCountryCode: '',
  sourceUrl: 'https://authority.example/rules/health',
  effectiveFrom: '2026-10-01T00:00:00Z',
  effectiveTo: '',
  instructions: '',
  authorityRequired: 'true' as const,
};
const authority: AuthorityForm = {
  ruleId: '101',
  decision: 'APPROVED',
  authorityName: 'Competent veterinary authority',
  applicationReference: 'AUTH-2027-001',
  sourceReference: 'Authority decision reference',
  evidenceFileKey: '84032724-eac7-45df-8d04-e54f092279d0',
  decidedAt: '2026-10-16T12:00:00Z',
  expiresAt: '2099-03-01T12:00:00Z',
  holdReason: '',
};
const assessment = {
  applicability: 'REQUIRED' as const,
  requiredDays: '14',
  visitCount: '1',
  testCount: '2',
  doseCount: '0',
  certificateCount: '1',
  sourceReference: 'Specialist assessment',
  validUntil: '2099-02-20T12:00:00Z',
};

describe('compliance input rules (#78)', () => {
  it('accepts only small PDF/PNG/JPEG files with a simple, matching name', () => {
    expect(fileProblem({ name: 'cert.png', type: 'image/png', size: 10 })).toBeNull();
    expect(fileProblem({ name: 'scan.JPEG', type: 'image/jpeg', size: 10 })).toBeNull();
    expect(fileProblem({ name: 'cert.png', type: 'image/png', size: MAX_FILE_BYTES + 1 })).toMatch(
      /5 MiB/,
    );
    expect(fileProblem({ name: 'cert.pdf', type: 'image/png', size: 10 })).toMatch(/matching/);
    expect(fileProblem({ name: 'run.exe', type: 'application/x-msdownload', size: 10 })).toMatch(
      /PDF, PNG or JPEG/,
    );
    expect(fileProblem({ name: '../cert.png', type: 'image/png', size: 10 })).toMatch(/Rename/);
    expect(fileProblem({ name: 'giấy.png', type: 'image/png', size: 10 })).toMatch(/Rename/);
  });

  it('uploads a typed version with local dates and null for an empty document number', () => {
    const ok = validateUpload({
      documentType: 'health_certificate',
      file,
      fileProblem: null,
      issuedDate: '2026-10-01',
      expiryDate: '2027-03-01',
      documentNumber: ' ',
    });
    expect(ok.input).toEqual({
      ...file,
      documentType: 'HEALTH_CERTIFICATE',
      issuedDate: '2026-10-01',
      expiryDate: '2027-03-01',
      documentNumber: null,
    });
    const bad = validateUpload({
      documentType: 'health certificate',
      file: null,
      fileProblem: null,
      issuedDate: '2027-03-01',
      expiryDate: '2026-10-01',
      documentNumber: '',
    });
    expect(Object.keys(bad.errors).sort()).toEqual(['documentType', 'expiryDate', 'file']);
  });

  it('requires an explicit authority choice and an HTTPS source for a rule', () => {
    expect(validateRule(rule).input).toMatchObject({
      ruleCode: 'VN-GB-HEALTH',
      documentType: 'HEALTH_CERTIFICATE',
      transitCountryCode: null,
      effectiveTo: null,
      instructions: null,
      authorityRequired: true,
    });
    expect(validateRule({ ...rule, authorityRequired: 'false' }).input?.authorityRequired).toBe(
      false,
    );
    const missing = validateRule({
      ...rule,
      authorityRequired: '',
      sourceUrl: 'http://authority.example',
    });
    expect(Object.keys(missing.errors).sort()).toEqual(['authorityRequired', 'sourceUrl']);
    expect(
      validateRule({ ...rule, effectiveTo: '2026-09-01T00:00:00Z' }).errors.effectiveTo,
    ).toMatch(/follow/);
  });

  it('assesses transit countries as distinct 2-letter codes', () => {
    const base = {
      phase: 'ARRIVAL' as const,
      sourceReference: 'Route assessment',
      validUntil: '2099-01-01T00:00:00Z',
    };
    expect(
      validateChecklist({ ...base, transitCountryCodes: 'sg, ae' }).input?.transitCountryCodes,
    ).toEqual(['SG', 'AE']);
    expect(
      validateChecklist({ ...base, transitCountryCodes: '' }).input?.transitCountryCodes,
    ).toEqual([]);
    expect(validateChecklist({ ...base, transitCountryCodes: 'SG,SG' }).errors).toHaveProperty(
      'transitCountryCodes',
    );
    expect(validateChecklist({ ...base, transitCountryCodes: 'SGP' }).errors).toHaveProperty(
      'transitCountryCodes',
    );
  });

  it('never turns a click into an approval: APPROVED needs evidence, a past decision and a future expiry', () => {
    expect(validateAuthority(authority).errors).toEqual({});
    const bare = validateAuthority({
      ...authority,
      evidenceFileKey: '',
      decidedAt: '',
      expiresAt: '',
    });
    expect(Object.keys(bare.errors).sort()).toEqual(['decidedAt', 'evidenceFileKey', 'expiresAt']);
    expect(
      validateAuthority({ ...authority, decidedAt: '2099-01-01T00:00:00Z' }).errors.decidedAt,
    ).toMatch(/future/);
    // Anything but an approval needs a hold reason.
    const pending = validateAuthority({ ...authority, decision: 'PENDING', evidenceFileKey: '' });
    expect(pending.errors).toHaveProperty('holdReason');
    expect(
      validateAuthority({ ...authority, decision: 'REJECTED', holdReason: 'Authority refused.' })
        .input,
    ).toMatchObject({ decision: 'REJECTED', holdReason: 'Authority refused.' });
  });

  it('sends null days when quarantine is not required and never treats empty counts as zero', () => {
    expect(validateAssessment(assessment).input).toMatchObject({ requiredDays: 14, doseCount: 0 });
    expect(
      validateAssessment({ ...assessment, applicability: 'NOT_REQUIRED', requiredDays: '14' }).input
        ?.requiredDays,
    ).toBeNull();
    expect(validateAssessment({ ...assessment, requiredDays: '0' }).errors).toHaveProperty(
      'requiredDays',
    );
    const empty = validateAssessment({ ...assessment, visitCount: '', testCount: '' });
    expect(empty.input).toBeNull();
    expect(empty.errors.visitCount).toMatch(/Enter the assessed number/);
    expect(empty.errors).toHaveProperty('testCount');
  });
});
