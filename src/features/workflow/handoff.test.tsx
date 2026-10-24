import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { complianceApi } from '../compliance/api';
import { handoverApi } from '../handover/api';
import { compileBody } from '../plans/studio/graphApi';
import { ApiError } from '../../shared/api/client';
import { filesApi } from '../../shared/api/files';
import { handoffErrorHelp } from '../../shared/api/error-codes';
import { startSession } from '../../shared/api/session';
import { ErrorNotice } from '../../shared/ui/common';

// BE_HANDOFF_FOR_FE.md, sections 2 and 3.2.
beforeEach(() => {
  startSession({ accessToken: 'test-only', tokenType: 'Bearer', expiresIn: 60, role: 'CUSTOMER' });
});
afterEach(() => vi.unstubAllGlobals());
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
const api = 'http://localhost:8080/api/transport-orders/9';
const command = {
  recordVersion: '000000000001A2B3',
  operationId: 'd86b4f63-5acc-4f20-8da3-e24323268814',
};
const receipt = { entityId: 501, ...command, recordVersion: '000000000001A2B4', fileKey: null };

describe('backend handoff contracts', () => {
  it('sends the one-step document submission flat, without a nested command', async () => {
    const fetch = vi.fn().mockResolvedValue(json(receipt));
    vi.stubGlobal('fetch', fetch);
    const result = await complianceApi.uploadAndSubmit(9, 44, {
      ...command,
      fileKey: '84032724-eac7-45df-8d04-e54f092279d0',
      documentNumber: null,
      issuedDate: '2026-10-01',
      expiryDate: '2027-03-01',
    });
    expect(fetch.mock.calls[0][0]).toBe(`${api}/compliance/requirements/44/upload-and-submit`);
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({
      ...command,
      fileKey: '84032724-eac7-45df-8d04-e54f092279d0',
      documentNumber: null,
      issuedDate: '2026-10-01',
      expiryDate: '2027-03-01',
    });
    expect(result.recordVersion).toBe('000000000001A2B4');
  });

  it('stores files as multipart and reads them back as bytes with the session', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        json({
          fileKey: '84032724-eac7-45df-8d04-e54f092279d0',
          fileName: 'cert.pdf',
          fileSizeBytes: 3,
          contentType: 'application/pdf',
        }),
      )
      .mockResolvedValueOnce(new Response('%PDF', { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    const file = new File(['%PDF'], 'cert.pdf', { type: 'application/pdf' });
    const stored = await filesApi.upload(file);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('http://localhost:8080/api/files/upload');
    expect(init.body).toBeInstanceOf(FormData);
    expect((init.body as FormData).get('file')).toBe(file);
    // The browser sets the multipart boundary; no JSON content type is forced.
    expect(init.headers['Content-Type']).toBeUndefined();
    expect(init.headers.Authorization).toBe('Bearer test-only');
    const bytes = await filesApi.read(stored.fileKey);
    expect(fetch.mock.calls[1][0]).toBe(`http://localhost:8080/api/files/${stored.fileKey}`);
    expect(await bytes.text()).toBe('%PDF');
  });

  it('uploads and reads handover files by key, and closes a delivered order', async () => {
    const file = {
      fileKey: '84032724-eac7-45df-8d04-e54f092279d0',
      purpose: 'HANDOVER_SIGNATURE',
      contentType: 'image/png',
      fileName: 'signature.png',
      contentBase64: 'iVBORw0KGgo=',
    };
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(json(file, 201))
      .mockResolvedValueOnce(json(file))
      .mockResolvedValueOnce(
        json({
          orderId: 9,
          orderStatus: 'CLOSED',
          recordVersion: '000000000001A2B5',
          operationId: command.operationId,
          updatedAt: '2026-10-23T08:15:00Z',
        }),
      );
    vi.stubGlobal('fetch', fetch);
    const uploaded = await handoverApi.uploadFile(9, {
      fileName: 'signature.png',
      contentType: 'image/png',
      purpose: 'HANDOVER_SIGNATURE',
      contentBase64: 'iVBORw0KGgo=',
    });
    await handoverApi.file(9, uploaded.fileKey);
    const closed = await handoverApi.closeOrder(9, command);
    expect(fetch.mock.calls.map((c) => [c[0], c[1].method ?? 'GET'])).toEqual([
      [`${api}/handover-files`, 'POST'],
      [`${api}/handover-files/${file.fileKey}`, 'GET'],
      [`${api}/handovers/close-order`, 'POST'],
    ]);
    expect(JSON.parse(fetch.mock.calls[0][1].body)).not.toHaveProperty('recordVersion');
    expect(JSON.parse(fetch.mock.calls[2][1].body)).toEqual(command);
    expect(closed.orderStatus).toBe('CLOSED');
  });

  it('sends the airfare estimate on AIR legs only', () => {
    const node = (nodeKey: string, locationName: string, nodeType: string) => ({
      nodeKey,
      nodeType,
      sequenceOrder: 0,
      locationName,
      countryCode: 'VN',
      plannedArrivalAt: null,
      plannedDepartureAt: null,
      dwellMinutes: 0,
      transitCustomsMode: null,
      transitPermitRef: null,
      welfareCareNotes: null,
      quarantineReservationId: null,
      posX: 0,
      posY: 0,
      details: null,
    });
    const wire = (id: string, mode: 'ROAD' | 'AIR', from: string, to: string) => ({
      id,
      sequenceNo: 1,
      fromNodeKey: from,
      toNodeKey: to,
      transportMode: mode,
      distanceKm: '100',
      distanceSource: 'MANUAL_VERIFIED',
      plannedDeparture: '2027-01-01T08:00:00+07:00',
      plannedArrival: '2027-01-01T10:00:00+07:00',
      legStatus: 'PLANNED',
      estimatedAirfare: '1500.50',
    });
    const payload = compileBody(
      {
        nodes: [
          node('a', 'Stable', 'ORIGIN'),
          node('b', 'SGN', 'AIRPORT_HANDOVER'),
          node('c', 'SIN', 'DESTINATION'),
        ],
        wires: [wire('w1', 'ROAD', 'a', 'b'), wire('w2', 'AIR', 'b', 'c')],
        layout: { zoom: 1, panX: 0, panY: 0 },
      } as never,
      201,
      command.recordVersion,
      command.operationId,
    );
    expect(payload.draft.legs.map((l) => l.estimatedAirfare)).toEqual([null, 1500.5]);
  });
});

describe('handoff error codes', () => {
  it('explains every listed code next to the server message', () => {
    for (const code of [
      'QUARANTINE_RELEASE_REQUIRED',
      'HANDOVER_TIME_BEFORE_DEPARTURE',
      'ORDER_NOT_DELIVERED',
      'ORDER_VERSION_CONFLICT',
      'CLOSURE_RETRY_CONFLICT',
      'QUOTE_PRICING_PENDING',
      'TRANSIT_COUNTRIES_PENDING',
      'COMPLIANCE_SCHEMA_PENDING',
      'INVALID_BASE64',
      'FILE_TOO_LARGE',
    ])
      expect(handoffErrorHelp[code]).toBeTruthy();
    render(<ErrorNotice error={new ApiError(409, 'Not delivered.', 'ORDER_NOT_DELIVERED')} />);
    expect(screen.getByText('Not delivered.')).toBeInTheDocument();
    expect(screen.getByText(/closed only after the horse has been delivered/)).toBeInTheDocument();
  });

  it("keeps a feature's own help instead of repeating the shared one", () => {
    render(
      <ErrorNotice
        error={new ApiError(409, 'Changed.', 'ORDER_VERSION_CONFLICT')}
        overrides={{ ORDER_VERSION_CONFLICT: 'Reload the ledger.' }}
      />,
    );
    expect(screen.queryByText(/just updated by someone else/)).toBeNull();
  });
});
