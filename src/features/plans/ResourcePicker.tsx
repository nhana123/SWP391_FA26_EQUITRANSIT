import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { request } from '../../shared/api/client';
import { useSession } from '../../shared/api/session';
import { ErrorNotice } from '../../shared/ui/common';
import type { Leg, PlanDetail } from './contracts';
import type { Checked } from './validation';
import { plansApi } from './api';
import { canonicalTime } from './operational-time';

const pageSchema = z.object({
  items: z.array(
    z.object({
      id: z.number(),
      code: z.string(),
      status: z.enum(['AVAILABLE', 'PENDING', 'UNAVAILABLE']),
      recordVersion: z.string().regex(/^[a-f0-9]{16}$/i),
      blockers: z.array(z.string()),
    }),
  ),
  totalElements: z.number(),
  page: z.number(),
  size: z.number(),
});
export function ResourcePicker({
  kind,
  plan,
  leg,
  onSelect,
}: {
  kind: 'VEHICLE' | 'STALL';
  plan: PlanDetail;
  leg: Leg;
  onSelect: (id: string, checked: Checked) => void;
}) {
  const { generation } = useSession()!;
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [shared, setShared] = useState(false);
  const query = useQuery({
    queryKey: [
      'plan-resource-options',
      generation,
      plan.orderId,
      leg.legId,
      kind,
      leg.plannedDeparture,
      leg.plannedArrival,
      leg.supplierId,
      search,
      page,
    ],
    queryFn: ({ signal }) =>
      request(
        `/api/resources/${kind}/candidates?${new URLSearchParams({ page: String(page), size: '10', ...(search.trim() ? { search: search.trim() } : {}) })}`,
        pageSchema,
        {
          method: 'POST',
          signal,
          body: {
            orderId: plan.orderId,
            revisionId: plan.revisionId,
            mode: leg.transportMode,
            start: canonicalTime(leg.plannedDeparture),
            end: canonicalTime(leg.plannedArrival),
            legId: leg.legId,
            carrierSupplierId: kind === 'STALL' ? leg.supplierId : null,
          },
        },
      ),
    retry: false,
  });
  const candidates = useQuery({
    queryKey: ['plan-shared-options', generation, plan.orderId, leg.legId],
    queryFn: ({ signal }) => plansApi.candidates(plan.orderId, signal),
    enabled: shared,
    retry: false,
  });
  const compatible = candidates.data?.filter(
    (c) =>
      c.sharingCode !== 'PRIVATE' &&
      Number(c.combinedSlotQuantity) <= 3 &&
      c.assignedStallId !== null &&
      !!leg.plannedFlightNumber &&
      c.plannedFlightNumber === leg.plannedFlightNumber &&
      Date.parse(c.windowStart) === Date.parse(leg.plannedDeparture) &&
      Date.parse(c.windowEnd) === Date.parse(leg.plannedArrival),
  );
  return (
    <div className="plan-resource-picker">
      <label>
        Tìm mã {kind === 'STALL' ? 'chuồng bay' : 'xe tải'}
        <input
          value={search}
          maxLength={50}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(0);
          }}
        />
      </label>
      {query.isPending && <p role="status">Đang tải tài nguyên…</p>}
      <ErrorNotice error={query.error} />
      {query.data && (
        <>
          <select
            aria-label={kind === 'STALL' ? 'Chọn chuồng khả dụng' : 'Chọn xe khả dụng'}
            value=""
            onChange={(e) => {
              const item = query.data.items.find((x) => x.id === Number(e.target.value));
              if (item?.status === 'AVAILABLE')
                onSelect(String(item.id), { id: item.id, recordVersion: item.recordVersion });
            }}
          >
            <option value="">Chọn tài nguyên…</option>
            {query.data.items.map((item) => (
              <option key={item.id} value={item.id} disabled={item.status !== 'AVAILABLE'}>
                {item.code} · {item.status}
                {item.blockers.length ? ` · ${item.blockers.join(', ')}` : ''}
              </option>
            ))}
          </select>
          {!query.data.items.length && <p>Không có kết quả phù hợp.</p>}
          <div className="actions">
            <button type="button" disabled={page === 0} onClick={() => setPage(page - 1)}>
              Trước
            </button>
            <button
              type="button"
              disabled={(page + 1) * 10 >= query.data.totalElements}
              onClick={() => setPage(page + 1)}
            >
              Tiếp
            </button>
            <button type="button" onClick={() => void query.refetch()}>
              Làm mới
            </button>
          </div>
        </>
      )}
      {kind === 'STALL' && (
        <>
          <button type="button" onClick={() => setShared(true)}>
            🔍 Tìm Đơn Ghép Chung Chuồng (Shared Stall ≤ 3.0 slots)
          </button>
          {shared && (
            <>
              <ErrorNotice error={candidates.error} />
              {candidates.isPending ? (
                <p>Đang tìm đơn ghép…</p>
              ) : (
                <>
                  <p>
                    Chọn chuồng của đơn cùng chuyến và giờ; kiểm tra khả dụng lại trước khi gán.
                  </p>
                  {compatible?.map((c) => (
                    <button
                      key={c.candidateOrderId}
                      type="button"
                      onClick={() => onSelect(String(c.assignedStallId), null)}
                    >
                      Đơn {c.candidateOrderId} · Chuồng {c.assignedStallId} · Tổng{' '}
                      {c.combinedSlotQuantity} slots
                    </button>
                  ))}
                  {!compatible?.length && (
                    <p>Chưa có đơn đã gán chuồng cùng chuyến, cùng giờ và đủ slot.</p>
                  )}
                </>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
