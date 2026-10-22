import { useState } from 'react';
import { z } from 'zod';
import { request } from '../../../shared/api/client';
import { ErrorNotice } from '../../../shared/ui/common';
import { plansApi } from '../api';
import { resourcesApi } from '../../resources/api';
import type { Leg, PlanDetail, RoadInput, StallInput } from '../contracts';
import { FlightForm } from '../forms';
import { CommandForm, type Pinned } from '../hooks';
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
}: {
  plan: PlanDetail;
  leg: Leg;
  pinned: Pinned;
}) {
  const [options, setOptions] = useState<Option[]>([]),
    [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Option | null>(null);
  const [drivers, setDrivers] = useState<{ staffId: number; fullName: string }[]>([]),
    [driverSearch, setDriverSearch] = useState(''),
    [driver, setDriver] = useState('');
  const [error, setError] = useState<unknown>(null),
    [loading, setLoading] = useState(false);
  const [approval, setApproval] = useState(''),
    [acceptance, setAcceptance] = useState<'PENDING' | 'ACCEPTED' | 'REJECTED'>('PENDING');
  const [assignment, setAssignment] = useState<'HELD' | 'CONFIRMED'>('HELD');
  const [candidates, setCandidates] = useState<Awaited<ReturnType<typeof plansApi.candidates>>>([]);
  const air = leg.transportMode === 'AIR';
  async function chooseSharedStall(stallId: number) {
    setLoading(true);
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
      setOptions((current) => [...current.filter((o) => o.id !== stallId), option]);
      setSelected(option);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }
  async function find() {
    setLoading(true);
    setError(null);
    setSelected(null);
    try {
      const data = await request(
        `/api/resources/${air ? 'STALL' : 'VEHICLE'}/candidates?${new URLSearchParams({ ...(search.trim() ? { search: search.trim() } : {}), page: '0', size: '10' })}`,
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
        },
      );
      setOptions(data.items);
      if (!air)
        setDrivers(await graphApi.drivers(plan.orderId, plan.planId, leg.legId, driverSearch));
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
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
      <button type="button" disabled={loading} onClick={() => void find()}>
        {loading ? 'Đang kiểm tra…' : '🔍 Tìm tài nguyên & kiểm tra lịch trống'}
      </button>
      <ErrorNotice error={error} />
      <label>
        {air ? 'Chuồng bay' : 'Xe tải'}
        <select
          value={selected?.id ?? ''}
          onChange={(e) =>
            setSelected(options.find((o) => o.id === Number(e.target.value)) ?? null)
          }
        >
          <option value="">Chọn từ kết quả kiểm tra</option>
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
