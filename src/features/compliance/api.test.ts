import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { complianceApi } from './api';
import { startSession } from '../../shared/api/session';

beforeEach(() => {
  startSession({
    accessToken: 'test-only',
    tokenType: 'Bearer',
    expiresIn: 60,
    role: 'SPECIALIST',
  });
});
afterEach(() => vi.unstubAllGlobals());
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
const origin = 'http://127.0.0.1:8080/api/transport-orders/9/compliance';
const receipt = {
  entityId: 5,
  operationId: 'd86b4f63-5acc-4f20-8da3-e24323268814',
  recordVersion: '000000000001A2B3',
  fileKey: null,
};
const command = {
  recordVersion: '000000000001A2B3',
  operationId: 'd86b4f63-5acc-4f20-8da3-e24323268814',
};

describe('compliance adapter (#78)', () => {
  it('reads the overview for one phase with a bounded page', async () => {
    const fetch = vi.fn().mockResolvedValue(
      json({
        revisionId: 7,
        recordVersion: '000000000001A2B3',
        readiness: {
          revisionId: 7,
          phase: 'ARRIVAL',
          asOf: '2027-02-20T12:00:00Z',
          expiresAt: null,
          status: 'PENDING',
          blockers: ['RULE_ASSESSMENT_PENDING'],
        },
        requirements: [],
        page: 0,
        size: 20,
        totalElements: 0,
      }),
    );
    vi.stubGlobal('fetch', fetch);
    const o = await complianceApi.overview(9, 'ARRIVAL', 0);
    expect(fetch.mock.calls[0][0]).toBe(`${origin}?phase=ARRIVAL&page=0&size=20`);
    expect(o.readiness.blockers).toEqual(['RULE_ASSESSMENT_PENDING']);
  });

  it('nests command and keeps the rest of the body flat', async () => {
    const fetch = vi.fn().mockResolvedValue(json(receipt));
    vi.stubGlobal('fetch', fetch);
    await complianceApi.review(9, 102, { ...command, decision: 'APPROVED', feedback: null });
    expect(fetch.mock.calls[0][0]).toBe(`${origin}/submissions/102/reviews`);
    expect(fetch.mock.calls[0][1].method).toBe('POST');
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({
      command,
      decision: 'APPROVED',
      feedback: null,
    });
  });

  it('submits to the exact requirement and revokes by document version', async () => {
    const fetch = vi.fn().mockImplementation(() => Promise.resolve(json(receipt)));
    vi.stubGlobal('fetch', fetch);
    await complianceApi.submit(9, 44, { ...command, documentVersionId: 103 });
    await complianceApi.revoke(9, 103, { ...command, reason: 'Revoked by authority.' });
    expect(fetch.mock.calls.map((c) => c[0])).toEqual([
      `${origin}/requirements/44/submissions`,
      `${origin}/documents/103/revocations`,
    ]);
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ command, documentVersionId: 103 });
  });

  it('reads private files only by an opaque UUID key', async () => {
    const fetch = vi.fn().mockResolvedValue(
      json({
        fileKey: '84032724-eac7-45df-8d04-e54f092279d0',
        contentType: 'image/png',
        fileName: 'cert.png',
        contentBase64: 'iVBORw0KGgo=',
      }),
    );
    vi.stubGlobal('fetch', fetch);
    await complianceApi.file(9, '84032724-eac7-45df-8d04-e54f092279d0');
    expect(fetch.mock.calls[0][0]).toBe(`${origin}/files/84032724-eac7-45df-8d04-e54f092279d0`);
    expect(() => complianceApi.file(9, '../../etc/passwd')).toThrow();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('keeps unavailable assessment counts as null, not zero', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        json({
          applicability: null,
          requiredDays: null,
          visitCount: null,
          testCount: null,
          doseCount: null,
          certificateCount: null,
          validUntil: null,
        }),
      ),
    );
    const a = await complianceApi.assessment(9);
    expect(a.visitCount).toBeNull();
    expect(a.applicability).toBeNull();
  });
});
