import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { request } from '../../../shared/api/client';
import { useSession } from '../../../shared/api/session';
import { ErrorNotice } from '../../../shared/ui/common';
import { plansApi } from '../api';
import { resourcesApi } from '../../resources/api';
import type { Leg, PlanDetail, RoadInput, StallInput } from '../contracts';
import { FlightForm } from '../forms';
import { CommandForm, planKeys, type Pinned } from '../hooks';
import { graphApi } from './graphApi';
const optionSchema = z.object({
  id: z.number(),
  code: z.string(),
  recordVersion: z.string(),
  status: z.string(),
  blockers: z.array(z.string()),
});
type Option = z.infer<typeof optionSchema>;
export function ResourceAttachment({
  plan,
  leg,
  pinned,
  preferredId,
}: {
  plan: PlanDetail;
  leg: Leg;
  pinned: Pinned;
  /** The vehicle chosen on the wire before the leg existed. */
  preferredId?: number;
}) {
  const session = useSession()!;
  const [search, setSearch] = useState(''),
    [driverSearch, setDriverSearch] = useState(''),
    [applied, setApplied] = useState({ search: '', driverSearch: '' });
  // A shared stall checked from another order's proposal joins the choices.
  const [extra, setExtra] = useState<Option[]>([]);
  // null follows the default choice; 0 means the user cleared it.
  const [chosenId, setChosenId] = useState<number | null>(null);
  const [driver, setDriver] = useState('');
  const [error, setError] = useState<unknown>(null),
    [probing, setProbing] = useState(false);
  const [approval, setApproval] = useState(''),
    [acceptance, setAcceptance] = useState<'PENDING' | 'ACCEPTED' | 'REJECTED'>('PENDING');
  const [assignment, setAssignment] = useState<'HELD' | 'CONFIRMED'>('HELD');
  const [candidates, setCandidates] = useState<Awaited<ReturnType<typeof plansApi.candidates>>>([]);
  const air = leg.transportMode === 'AIR';
  // Free resources and drivers for this leg load as soon as it opens.
  const found = useQuery({
    queryKey: [
      ...planKeys.all(session.generation, plan.orderId),
      'leg-resources',
      leg.legId,
      applied,
    ],
    queryFn: async ({ signal }) => {
      const data = await request(
        `/api/resources/${air ? 'STALL' : 'VEHICLE'}/candidates?${new URLSearchParams({ ...(applied.search ? { search: applied.search } : {}), page: '0', size: '10' })}`,
        z.object({ items: z.array(optionSchema) }),
        {
          method: 'POST',
          body: {
            orderId: plan.orderId,
            revisionId: plan.revisionId,
            mode: air ? 'AIR' : 'ROAD',
            start: leg.plannedDeparture,
            end: leg.plannedArrival,
            carrierSupplierId: air ? leg.supplierId : null,
            legId: leg.legId,
          },
          signal,
        },
      );
      const drivers = air
        ? []
        : await graphApi.drivers(plan.orderId, plan.planId, leg.legId, applied.driverSearch);
      return { items: data.items, drivers };
    },
    retry: false,
    staleTime: 0,
  });
  const options = [
    ...(found.data?.items ?? []).filter((o) => !extra.some((e) => e.id === o.id)),
    ...extra,
  ];
  const drivers = found.data?.drivers ?? [];
  const loading = found.isFetching || probing;
  // Start from the choice made on the wire, else the first resource free for this leg.
  const fallback =
    options.find((o) => o.id === preferredId && o.status === 'AVAILABLE') ??
    options.find((o) => o.status === 'AVAILABLE') ??
    null;
  const selected = chosenId === null ? fallback : (options.find((o) => o.id === chosenId) ?? null);
  async function chooseSharedStall(stallId: number) {
    setProbing(true);
    setError(null);
    try {
      const checked = await resourcesApi.probe('STALL', stallId, {
        orderId: plan.orderId,
        revisionId: plan.revisionId,
        mode: 'AIR',
        start: leg.plannedDeparture,
        end: leg.plannedArrival,
        carrierSupplierId: leg.supplierId,
        legId: leg.legId,
      });
      if (checked.status !== 'AVAILABLE') {
        throw new Error(`Chuồng chưa khả dụng: ${checked.blockers.join(', ')}`);
      }
      const option = {
        id: stallId,
        code: `Chuồng #${stallId}`,
        recordVersion: checked.recordVersion,
        status: checked.status,
        blockers: checked.blockers,
      };
      setExtra((current) => [...current.filter((o) => o.id !== stallId), option]);
      setChosenId(stallId);
    } catch (e) {
      setError(e);
    } finally {
      setProbing(false);
    }
  }
  function find() {
    setChosenId(null);
    const next = { search: search.trim(), driverSearch: driverSearch.trim() };
    if (next.search === applied.search && next.driverSearch === applied.driverSearch)
      void found.refetch();
    else setApplied(next);
  }
  const common = (
    <>
      <label>
        Tìm {air ? 'chuồng bay' : 'xe'} theo mã
        <input value={search} onChange={(e) => setSearch(e.target.value)} maxLength={50} />
      </label>
      {!air && (
        <label>
          Tên tài xế
          <input
            value={driverSearch}
            onChange={(e) => setDriverSearch(e.target.value)}
            maxLength={80}
          />
        </label>
      )}
      <button type="button" disabled={loading} onClick={find}>
        {loading ? 'Đang kiểm tra…' : '🔄 Tìm lại theo mã / tên'}
      </button>
      <ErrorNotice error={found.error ?? error} />
      <label>
        {air ? 'Chuồng bay' : 'Xe tải'}
        <select
          value={selected?.id ?? ''}
          onChange={(e) => setChosenId(e.target.value ? Number(e.target.value) : 0)}
        >
          <option value="">{loading ? 'Đang tải…' : 'Chọn tài nguyên còn trống'}</option>
          {options.map((o) => (
            <option key={o.id} value={o.id} disabled={o.status !== 'AVAILABLE'}>
              {o.code} · {o.status}
              {o.blockers.length ? ` (${o.blockers.join(', ')})` : ''}
            </option>
          ))}
        </select>
      </label>
      {!air && (
        <label>
          Tài xế khả dụng
          <select value={driver} onChange={(e) => setDriver(e.target.value)}>
            <option value="">Chọn tài xế</option>
            {drivers.map((d) => (
              <option key={d.staffId} value={d.staffId}>
                {d.fullName}
              </option>
            ))}
          </select>
        </label>
      )}
    </>
  );
  return (
    <div className="js-resource-forms">
      <p>Kiểm tra là tham khảo. BE kiểm tra lại lịch và phiên bản khi gán.</p>
      {air ? (
        <>
          <CommandForm<StallInput>
            label="Studio stall assignment"
            title="Chuồng bay"
            pinned={pinned}
            submitLabel="Gán chuồng bay"
            send={(body) => plansApi.stall(plan.orderId, plan.planId, leg.legId, body)}
            build={() =>
              selected
                ? {
                    stallId: selected.id,
                    stallRecordVersion: selected.recordVersion,
                    carrierAcceptanceStatus: acceptance,
                    status: assignment,
                    positionDescription: null,
                    carrierApprovalFileKey: approval.trim() || null,
                    carrierContact: null,
                  }
                : null
            }
          >
            {(locked) => (
              <fieldset disabled={locked}>
                {common}
                <label>
                  Phản hồi hãng bay
                  <select
                    value={acceptance}
                    onChange={(e) => setAcceptance(e.target.value as typeof acceptance)}
                  >
                    <option>PENDING</option>
                    <option>ACCEPTED</option>
                    <option>REJECTED</option>
                  </select>
                </label>
                <label>
                  Trạng thái gán
                  <select
                    value={assignment}
                    onChange={(e) => setAssignment(e.target.value as typeof assignment)}
                  >
                    <option>HELD</option>
                    <option>CONFIRMED</option>
                  </select>
                </label>
                <label>
                  Khóa chứng từ hãng bay
                  <input
                    value={approval}
                    onChange={(e) => setApproval(e.target.value)}
                    maxLength={1024}
                  />
                </label>
                <small>
                  Số slot và chế độ ghép theo yêu cầu dịch vụ đã lưu; không được tự sửa trên dây.
                </small>
              </fieldset>
            )}
          </CommandForm>
          <button
            type="button"
            onClick={() => {
              void plansApi.candidates(plan.orderId).then(setCandidates).catch(setError);
            }}
          >
            🔍 Ghép chung chuồng ≤ 3.0 slots
          </button>
          {candidates.map((c) => (
            <div key={c.candidateOrderId} className="js-candidate">
              <strong>
                Đơn #{c.candidateOrderId} · {c.plannedFlightNumber || 'Chưa có chuyến'}
              </strong>
              <p>
                {c.combinedSlotQuantity} slots · {c.originCountryCode} → {c.destinationCountryCode}
              </p>
              <button
                type="button"
                disabled={!c.assignedStallId || loading}
                onClick={() => void chooseSharedStall(c.assignedStallId!)}
              >
                Kiểm tra & chọn chuồng đề xuất
              </button>
            </div>
          ))}
          <FlightForm plan={plan} leg={leg} pinned={pinned} />
        </>
      ) : (
        <CommandForm<RoadInput>
          label="Studio road assignment"
          title="Xe tải & tài xế"
          pinned={pinned}
          submitLabel="Gán xe & tài xế"
          send={(body) => plansApi.road(plan.orderId, plan.planId, leg.legId, body)}
          build={() =>
            selected && driver
              ? {
                  vehicleId: selected.id,
                  vehicleRecordVersion: selected.recordVersion,
                  driverStaffId: Number(driver),
                  driverBufferMinutes: 0,
                  conflictNotes: null,
                }
              : null
          }
        >
          {(locked) => <fieldset disabled={locked}>{common}</fieldset>}
        </CommandForm>
      )}
    </div>
  );
}
