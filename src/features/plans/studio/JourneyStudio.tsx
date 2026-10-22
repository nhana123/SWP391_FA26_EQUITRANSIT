import { StatusBadge } from '../../../components/ui/StatusBadge';
import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useSession } from '../../../shared/api/session';
import { ApiError } from '../../../shared/api/client';
import { ErrorNotice } from '../../../shared/ui/common';
import { plansApi } from '../api';
import { planKeys, usePinnedVersion } from '../hooks';
import { ConfirmForm, InsuranceForm, QuarantineForm } from '../forms';
import type { PlanDetail } from '../contracts';
import { JourneyStudioCanvas, type Selection } from './JourneyStudioCanvas';
import { compileBody, fromGraph, graphApi, type GraphView } from './graphApi';
import {
  cascade,
  emptyJourney,
  graphErrors,
  internationalTemplate,
  latestRecordedProgress,
  localTime,
  newNode,
  nodeDesign,
  nodeKinds,
  offsetTime,
  ordered,
  showTime,
  type Checkpoint,
  type Journey,
  type NodeDetails,
  type Wire,
} from './model';
import { ResourceAttachment } from './ResourceAttachment';
import { SupplierPicker } from './SupplierPicker';
import './studio.css';

type Props = {
  orderId: number;
  planId?: number;
  revisionId?: number;
  recordVersion?: string;
  canCompile?: boolean;
  mode: 'edit' | 'driver' | 'customer';
  onSaved?: (planId: number) => void;
};
function Field({
  label,
  value,
  onChange,
  type = 'text',
  max = 200,
  readOnly = false,
}: {
  label: string;
  value: string;
  onChange: (s: string) => void;
  type?: string;
  max?: number;
  readOnly?: boolean;
}) {
  return (
    <label className="js-field">
      {label}
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={max}
        readOnly={readOnly}
        min={type === 'number' ? 0 : undefined}
      />
    </label>
  );
}
function DateField({
  label,
  value,
  change,
  readOnly = false,
}: {
  label: string;
  value: string | null;
  change: (v: string | null) => void;
  readOnly?: boolean;
}) {
  return (
    <Field
      label={`${label} (+07)`}
      value={localTime(value)}
      onChange={(v) => change(offsetTime(v) || null)}
      type="datetime-local"
      readOnly={readOnly}
    />
  );
}
function NodeInspector({
  node,
  update,
  remove,
  editable,
  publicView,
  reservations,
}: {
  node: Checkpoint;
  update: (patch: Partial<Checkpoint>) => void;
  remove: () => void;
  editable: boolean;
  publicView: boolean;
  reservations: PlanDetail['quarantineReservations'];
}) {
  if (publicView)
    return (
      <>
        <div className="js-inspector-type">
          {nodeDesign[node.nodeType].icon} {nodeDesign[node.nodeType].name}
        </div>
        <dl>
          <dt>Địa điểm</dt>
          <dd>{node.locationName}</dd>
          <dt>Quốc gia</dt>
          <dd>{node.countryCode}</dd>
          {node.plannedArrivalAt && (
            <>
              <dt>Giờ đến (+07)</dt>
              <dd>{showTime(node.plannedArrivalAt)}</dd>
            </>
          )}
          {node.plannedDepartureAt && (
            <>
              <dt>Giờ đi (+07)</dt>
              <dd>{showTime(node.plannedDepartureAt)}</dd>
            </>
          )}
          {node.dwellMinutes > 0 && (
            <>
              <dt>Thời gian dừng</dt>
              <dd>{node.dwellMinutes} phút</dd>
            </>
          )}
        </dl>
      </>
    );
  const d = node.details ?? {};
  const detail = (patch: Partial<NodeDetails>) => update({ details: { ...d, ...patch } });
  return (
    <>
      <div className="js-inspector-type">
        {nodeDesign[node.nodeType].icon} {nodeDesign[node.nodeType].name}
      </div>
      <fieldset disabled={!editable}>
        <Field
          label="Địa điểm"
          value={node.locationName}
          onChange={(locationName) => update({ locationName })}
        />
        <Field
          label={node.nodeType === 'TRANSIT_HUB' ? 'Quốc gia quá cảnh' : 'Quốc gia (VN, SG…)'}
          value={node.countryCode}
          max={2}
          onChange={(s) => update({ countryCode: s.toUpperCase() })}
        />
        {node.nodeType !== 'ORIGIN' && (
          <DateField
            label={node.nodeType === 'QUARANTINE' ? 'Nhận vào cách ly' : 'Giờ đến'}
            value={node.plannedArrivalAt}
            readOnly
            change={(plannedArrivalAt) => update({ plannedArrivalAt })}
          />
        )}
        {node.nodeType !== 'DESTINATION' && (
          <DateField
            label={node.nodeType === 'QUARANTINE' ? 'Kết thúc cách ly' : 'Giờ đi'}
            value={node.plannedDepartureAt}
            readOnly={!['ORIGIN', 'QUARANTINE'].includes(node.nodeType)}
            change={(plannedDepartureAt) => update({ plannedDepartureAt })}
          />
        )}
        {!['ORIGIN', 'DESTINATION'].includes(node.nodeType) && (
          <Field
            label="Dừng / chuyển tiếp (phút)"
            type="number"
            value={String(node.dwellMinutes)}
            onChange={(s) => update({ dwellMinutes: Math.min(525600, Math.max(0, Number(s))) })}
          />
        )}
        {node.nodeType !== 'ORIGIN' && (
          <small>
            Giờ đến lấy từ chặng vào; sửa giờ trên dây nối.
            {node.nodeType !== 'DESTINATION' && node.nodeType !== 'QUARANTINE'
              ? ' Giờ đi tự tính từ giờ đến và thời gian dừng.'
              : ''}
          </small>
        )}
        {node.nodeType === 'ORIGIN' && (
          <>
            <Field
              label="Người liên hệ"
              value={d.contactPerson ?? ''}
              onChange={(s) => detail({ contactPerson: s || null })}
            />
            <label className="js-check">
              <input type="checkbox" checked={d.requireMicrochipCheck ?? true} disabled /> Kiểm tra
              microchip trước nhận ngựa
            </label>
            <Field
              label="Ghi chú thú y trước khởi hành"
              value={d.preDepartureVetNote ?? ''}
              max={1000}
              onChange={(s) => detail({ preDepartureVetNote: s || null })}
            />
          </>
        )}
        {node.nodeType === 'REST_STOP' && (
          <>
            <Field
              label="Kế hoạch ăn / uống"
              value={d.feedingAndWateringPlan ?? ''}
              max={1000}
              onChange={(s) => detail({ feedingAndWateringPlan: s || null })}
            />
            <label className="js-check">
              <input
                type="checkbox"
                checked={d.mandatoryVetCheck ?? false}
                onChange={(e) => detail({ mandatoryVetCheck: e.target.checked })}
              />{' '}
              Cần kiểm tra thú y
            </label>
          </>
        )}
        {node.nodeType === 'TRANSIT_HUB' && (
          <>
            <label className="js-field">
              Thủ tục quá cảnh
              <select
                value={node.transitCustomsMode ?? ''}
                onChange={(e) =>
                  update({
                    transitCustomsMode: (e.target.value ||
                      null) as Checkpoint['transitCustomsMode'],
                  })
                }
              >
                <option value="">Chưa ghi nhận</option>
                <option>STAY_ON_AIRCRAFT</option>
                <option>AIRSIDE_TRANSFER</option>
                <option>TERMINAL_HOLDING</option>
              </select>
            </label>
            <Field
              label="Tham chiếu giấy phép"
              value={node.transitPermitRef ?? ''}
              max={120}
              onChange={(s) => update({ transitPermitRef: s || null })}
            />
          </>
        )}
        {node.nodeType === 'AIRPORT_HANDOVER' && (
          <SupplierPicker
            key={node.nodeKey}
            label="Đơn vị mặt đất"
            disabled={!editable}
            value={d.groundHandlerSupplierId ?? null}
            onChange={(groundHandlerSupplierId) => detail({ groundHandlerSupplierId })}
          />
        )}
        {node.nodeType === 'QUARANTINE' && (
          <>
            <label className="js-field">
              Liên kết đặt chỗ đã lưu
              <select
                value={node.quarantineReservationId ?? ''}
                onChange={(e) =>
                  update({
                    quarantineReservationId: e.target.value ? Number(e.target.value) : null,
                  })
                }
              >
                <option value="">Chưa liên kết</option>
                {reservations.map((r) => (
                  <option key={r.reservationId} value={r.reservationId}>
                    {r.facilityName} · {r.status}
                  </option>
                ))}
              </select>
            </label>
            <SupplierPicker
              key={node.nodeKey}
              label="Cơ sở cách ly"
              disabled={!editable}
              value={d.facilitySupplierId ?? null}
              onChange={(facilitySupplierId) => detail({ facilitySupplierId })}
            />
            <label className="js-field">
              Giai đoạn
              <select
                value={d.quarantineType ?? ''}
                onChange={(e) =>
                  detail({
                    quarantineType: (e.target.value || null) as NodeDetails['quarantineType'],
                  })
                }
              >
                <option value="">Chọn giai đoạn</option>
                <option>PRE_EXPORT</option>
                <option>POST_ARRIVAL</option>
              </select>
            </label>
            <Field
              label="Số chuồng dự kiến"
              type="number"
              value={d.reservedStallCount?.toString() ?? ''}
              onChange={(s) => detail({ reservedStallCount: s ? Number(s) : null })}
            />
            <label className="js-field">
              Mức an toàn
              <select
                value={d.biosecurityLevel ?? ''}
                onChange={(e) =>
                  detail({
                    biosecurityLevel: (e.target.value || null) as NodeDetails['biosecurityLevel'],
                  })
                }
              >
                <option value="">Chưa xác định</option>
                <option>STANDARD</option>
                <option>HIGH_ISOLATION</option>
              </select>
            </label>
            <small>
              Thông tin điểm cách ly là kế hoạch; xác nhận đặt chỗ cần chứng từ bên dưới.
            </small>
          </>
        )}
        {node.nodeType === 'DESTINATION' && (
          <>
            <Field
              label="Người nhận"
              value={d.receiverName ?? ''}
              onChange={(s) => detail({ receiverName: s || null })}
            />
            <Field
              label="Điện thoại người nhận"
              value={d.receiverPhone ?? ''}
              onChange={(s) => detail({ receiverPhone: s || null })}
            />
            <SupplierPicker
              key={node.nodeKey}
              label="Nhà bảo hiểm"
              disabled={!editable}
              value={d.insurerSupplierId ?? null}
              onChange={(insurerSupplierId) => detail({ insurerSupplierId })}
            />
            <Field
              label="Số hợp đồng bảo hiểm dự kiến"
              max={150}
              value={d.policyNumber ?? ''}
              onChange={(s) => detail({ policyNumber: s || null })}
            />
            <Field
              label="Mức bảo hiểm dự kiến (USD)"
              value={d.coverageAmount ?? ''}
              onChange={(s) => detail({ coverageAmount: s || null })}
            />
          </>
        )}
        <button type="button" className="js-danger" onClick={remove}>
          Xóa điểm và dây liên quan
        </button>
      </fieldset>
      {!editable && (
        <p className="js-muted">
          Lịch đã lưu. Chỉnh lịch bằng phiên bản mới; tài nguyên và chứng từ được ghi riêng.
        </p>
      )}
    </>
  );
}

export function JourneyStudio({
  orderId,
  planId,
  revisionId,
  recordVersion,
  mode,
  canCompile = true,
  onSaved,
}: Props) {
  const session = useSession();
  const workspace = useRef<HTMLDivElement>(null);
  const [journey, setJourney] = useState<Journey>(emptyJourney),
    [selection, select] = useState<Selection>(null);
  const [seenGraph, setSeenGraph] = useState<GraphView | null>(null),
    [fork, setFork] = useState(false),
    [semanticDirty, setSemanticDirty] = useState(false);
  const [error, setError] = useState<unknown>(null),
    [problems, setProblems] = useState<string[]>([]),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState('');
  const [frozen, setFrozen] = useState<
    | { kind: 'compile'; body: ReturnType<typeof compileBody> }
    | { kind: 'layout'; journey: Journey; version: string; operationId: string }
    | null
  >(null);
  const editRole = mode === 'edit' && ['MANAGER', 'COORDINATOR'].includes(session?.role ?? '');
  const query = useQuery({
    queryKey: [...planKeys.all(session?.generation ?? '', orderId), 'graph', planId, recordVersion],
    queryFn: ({ signal }) => graphApi.get(orderId, planId!, signal),
    enabled: !!planId,
    refetchInterval: mode === 'edit' ? false : 30_000,
  });
  const detail = useQuery({
    queryKey: planKeys.detail(session?.generation ?? '', orderId, planId ?? 0),
    queryFn: ({ signal }) => plansApi.get(orderId, planId!, signal),
    enabled: !!planId && editRole,
  });
  const pinned = usePinnedVersion(
    orderId,
    detail.data?.recordVersion ?? query.data?.recordVersion ?? recordVersion,
  );
  const drafting = editRole && (!planId || fork),
    unlocked = !busy && !frozen;
  const writeReady = canCompile && !pinned.changed;
  const editable = drafting && unlocked && writeReady;
  const layoutEditable =
    !!planId && editRole && !!query.data?.editable && !fork && unlocked && writeReady;
  const canFork =
    !!query.data &&
    !!detail.data &&
    detail.data.planId === query.data.planId &&
    (query.data.editable ||
      (detail.data?.planStatus === 'DRAFT' && !query.data.checkpointNodes.length));
  // Adopt new server resources/status without discarding the user's canvas layout.
  if (query.data && query.data !== seenGraph && !fork && unlocked) {
    const next = fromGraph(query.data);
    setSeenGraph(query.data);
    setJourney((current) =>
      seenGraph?.planId === query.data.planId
        ? {
            ...next,
            layout: current.layout,
            nodes: next.nodes.map((n) => {
              const position = current.nodes.find((p) => p.nodeKey === n.nodeKey);
              return position ? { ...n, posX: position.posX, posY: position.posY } : n;
            }),
          }
        : next,
    );
  }
  const node =
    selection?.kind === 'node' ? journey.nodes.find((n) => n.nodeKey === selection.id) : undefined;
  const wire =
    selection?.kind === 'wire' ? journey.wires.find((w) => w.id === selection.id) : undefined;
  function change(next: Journey) {
    if (!unlocked) return;
    if (editable) setJourney(next);
    else
      setJourney((current) => ({
        ...current,
        layout: next.layout,
        nodes: layoutEditable
          ? current.nodes.map((n) => {
              const moved = next.nodes.find((p) => p.nodeKey === n.nodeKey);
              return moved ? { ...n, posX: moved.posX, posY: moved.posY } : n;
            })
          : current.nodes,
      }));
  }
  function semantic(next: Journey) {
    if (!editRole || !unlocked || !writeReady) return;
    setSemanticDirty(true);
    setJourney(cascade(next));
  }
  function updateNode(patch: Partial<Checkpoint>) {
    if (!node || !editable) return;
    semantic({
      ...journey,
      nodes: journey.nodes.map((n) => (n.nodeKey === node.nodeKey ? { ...n, ...patch } : n)),
    });
  }
  function updateWire(patch: Partial<Wire>) {
    if (!wire || !editable) return;
    const next = {
      ...journey,
      wires: journey.wires.map((w) => (w.id === wire.id ? { ...w, ...patch } : w)),
    };
    semantic(next);
  }
  function fit(next = journey) {
    const bounds = workspace.current?.querySelector('.js-canvas')?.getBoundingClientRect();
    const minX = Math.min(0, ...next.nodes.map((n) => n.posX)),
      minY = Math.min(0, ...next.nodes.map((n) => n.posY));
    const maxX = Math.max(800, ...next.nodes.map((n) => n.posX + 290)),
      maxY = Math.max(500, ...next.nodes.map((n) => n.posY + 180));
    const zoom = Math.max(
      0.5,
      Math.min(
        1.1,
        ((bounds?.width || 960) - 60) / (maxX - minX),
        ((bounds?.height || 670) - 90) / (maxY - minY),
      ),
    );
    change({
      ...next,
      layout: { zoom, panX: 30 - minX * zoom, panY: 45 - minY * zoom },
    });
  }
  async function save(layoutOnly = false) {
    if (!editRole || busy) return;
    setError(null);
    setMessage('');
    const version = pinned.version ?? recordVersion,
      rev = query.data?.revisionId ?? revisionId;
    let pending = frozen;
    if (!pending) {
      if (!version || !rev) {
        setError(new Error('Chưa có phiên bản hồ sơ để lưu. Tải lại case.'));
        return;
      }
      if (pinned.changed || !canCompile) {
        setError(new Error('Hồ sơ đã thay đổi. Tải lại và xem xét trước khi lưu.'));
        return;
      }
      if (layoutOnly && planId)
        pending = {
          kind: 'layout',
          journey: structuredClone(journey),
          version,
          operationId: crypto.randomUUID(),
        };
      else {
        const errors = graphErrors(journey);
        setProblems(errors);
        if (errors.length) return;
        pending = {
          kind: 'compile',
          body: compileBody(cascade(journey), rev, version, crypto.randomUUID()),
        };
      }
      setFrozen(pending);
    }
    setBusy(true);
    try {
      const receipt =
        pending.kind === 'compile'
          ? await graphApi.compile(orderId, pending.body)
          : await graphApi.positions(
              orderId,
              planId!,
              pending.journey,
              pending.version,
              pending.operationId,
            );
      setFrozen(null);
      setFork(false);
      setSemanticDirty(false);
      setSeenGraph(receipt);
      setJourney(fromGraph(receipt));
      pinned.adopt(receipt.recordVersion);
      setMessage('Đã lưu trên hệ thống. Tài nguyên cần được gán và xác nhận riêng.');
      await pinned.refreshAll();
      onSaved?.(receipt.planId);
    } catch (e) {
      setError(e);
      if (!(e instanceof ApiError) || !e.uncertain) setFrozen(null);
    } finally {
      setBusy(false);
    }
  }
  const leg = detail.data?.legs.find((l) => l.legId === wire?.legId);
  const progress = latestRecordedProgress(journey);
  const observedNode = journey.nodes.find((n) => n.nodeKey === progress?.nodeKey);
  const resourcesEditable =
    editRole && query.data?.editable && !fork && !semanticDirty && writeReady && unlocked;
  const executionPath = wire?.legId
    ? `/driver/orders/${orderId}/execution?legId=${wire.legId}`
    : '';
  return (
    <section className="journey-studio" aria-label="EquiTransit Creative Journey Studio">
      <header className="js-toolbar">
        <div className="js-brand">
          <span>✦</span>
          <div>
            <strong>Journey Studio</strong>
            <small>
              EQUITRANSIT ·{' '}
              {mode === 'edit'
                ? 'DESIGN & DISPATCH'
                : mode === 'driver'
                  ? 'FIELD EXECUTION'
                  : 'JOURNEY TRACKING'}
            </small>
          </div>
        </div>
        <span className="js-timezone">🌐 Múi giờ điều hành chuẩn: GMT+07:00</span>
        <div className="js-toolbar-actions">
          <button type="button" onClick={() => fit()}>
            Fit
          </button>
          <button
            type="button"
            disabled={!editable}
            onClick={() => {
              const chain = ordered(journey);
              const nodes = chain?.nodes ?? journey.nodes;
              fit({
                ...journey,
                nodes: nodes.map((n, i) => ({
                  ...n,
                  posX: 60 + (i % 4) * 390,
                  posY: 100 + Math.floor(i / 4) * 300,
                })),
              });
            }}
          >
            Auto-align
          </button>
          {editRole && !drafting && query.data?.editable && (
            <button
              type="button"
              onClick={() => void save(true)}
              disabled={busy || (!frozen && !writeReady)}
            >
              {frozen ? 'Thử lại cùng yêu cầu' : 'Lưu bố cục'}
            </button>
          )}
          {editRole && !drafting && canFork && (
            <button
              type="button"
              disabled={!unlocked || !writeReady}
              onClick={() => {
                setFork(true);
                semantic({
                  ...journey,
                  wires: journey.wires.map((w) => ({
                    ...w,
                    // The public graph omits suppliers. Preserve only the already
                    // authorized internal detail when forking a staff draft.
                    supplierId:
                      detail.data?.legs.find((l) => l.legId === w.legId)?.supplierId ?? null,
                    legId: undefined,
                    vehicleId: null,
                    driverStaffId: null,
                    stallEquipmentId: null,
                    flightNumber: null,
                    legStatus: 'PLANNED',
                  })),
                });
              }}
            >
              Soạn phiên bản mới
            </button>
          )}
          {drafting && (
            <button
              type="button"
              className="js-save"
              onClick={() => void save()}
              disabled={busy || (!frozen && !writeReady)}
            >
              {busy ? 'Đang lưu…' : frozen ? 'Thử lại cùng yêu cầu' : '💾 Compile & lưu sơ đồ'}
            </button>
          )}
        </div>
      </header>
      {(query.isLoading || detail.isLoading) && (
        <p className="js-banner" role="status">
          Đang tải hành trình…
        </p>
      )}
      <ErrorNotice error={query.error ?? detail.error ?? error} />
      {message && (
        <p className="js-banner" role="status">
          {message}
        </p>
      )}
      {!editRole && progress && observedNode && (
        <p className="js-banner" role="status">
          Ghi nhận thực tế gần nhất: {progress.kind === 'ARRIVED' ? 'đã đến' : 'đã rời'}{' '}
          {observedNode.locationName} · {showTime(progress.at)} (+07).{' '}
          <button type="button" onClick={() => select({ kind: 'node', id: observedNode.nodeKey })}>
            Xem điểm mốc
          </button>
        </p>
      )}
      {editRole && pinned.changed && (
        <p className="js-banner error" role="alert">
          Hồ sơ có thay đổi mới. Tải lại trang để xem xét; sơ đồ đang sửa được giữ trên màn hình.
        </p>
      )}
      {problems.length > 0 && (
        <ul className="js-validation" role="alert">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
      {query.data && !query.data.checkpointNodes.length && (
        <p className="js-banner">
          Kế hoạch này chưa có sơ đồ điểm mốc.{' '}
          {editRole
            ? 'Chọn soạn phiên bản mới để thiết kế; dữ liệu kế hoạch cũ vẫn được giữ.'
            : 'Theo dõi các chặng và nhật ký đã ghi ở phần bên dưới.'}
        </p>
      )}
      <div className="js-body">
        <div className="js-workspace" ref={workspace}>
          <JourneyStudioCanvas
            journey={journey}
            onChange={change}
            editable={editable || layoutEditable}
            canConnect={editable}
            selection={selection}
            select={select}
            driverMode={mode === 'driver'}
            resourceDetailsVisible={mode === 'edit'}
            onAutoFix={editable ? () => semantic(cascade(journey)) : undefined}
          />
          <div className="js-statusbar">
            <span>
              {journey.nodes.length} điểm · {journey.wires.length} chặng ·{' '}
              {journey.wires
                .reduce((s, w) => s + (Number(w.distanceKm) || 0), 0)
                .toLocaleString('vi-VN')}{' '}
              km
            </span>
            <div>
              <button
                type="button"
                aria-label="Zoom out"
                onClick={() =>
                  change({
                    ...journey,
                    layout: { ...journey.layout, zoom: Math.max(0.5, journey.layout.zoom - 0.1) },
                  })
                }
              >
                −
              </button>
              <span>{Math.round(journey.layout.zoom * 100)}%</span>
              <button
                type="button"
                aria-label="Zoom in"
                onClick={() =>
                  change({
                    ...journey,
                    layout: { ...journey.layout, zoom: Math.min(1.5, journey.layout.zoom + 0.1) },
                  })
                }
              >
                +
              </button>
            </div>
          </div>
          {drafting && (
            <nav className="js-dock" aria-label="Checkpoint palette">
              {nodeKinds.map((k) => (
                <button
                  key={k}
                  type="button"
                  disabled={
                    !editable ||
                    journey.nodes.length >= 21 ||
                    (['ORIGIN', 'DESTINATION'].includes(k) &&
                      journey.nodes.some((n) => n.nodeType === k))
                  }
                  onClick={() =>
                    semantic({
                      ...journey,
                      nodes: [...journey.nodes, newNode(k, journey.nodes.length)],
                    })
                  }
                >
                  <span style={{ color: nodeDesign[k].color }}>{nodeDesign[k].icon}</span>
                  <small>+ {nodeDesign[k].name}</small>
                </button>
              ))}
              <button
                className="js-template"
                type="button"
                disabled={!editable || journey.nodes.length > 0}
                onClick={() => {
                  const template = internationalTemplate();
                  setSemanticDirty(true);
                  fit(template);
                  setMessage(
                    'Đã thêm cấu trúc tuyến mẫu. Điền quốc gia, thời gian và khoảng cách thực tế trước khi lưu.',
                  );
                }}
              >
                ✦<small>Tuyến quốc tế</small>
              </button>
            </nav>
          )}
        </div>
        <aside className="js-inspector" aria-label="Journey inspector">
          <div className="js-inspector-title">
            <span>INSPECTOR</span>
            <button type="button" aria-label="Close inspector" onClick={() => select(null)}>
              ×
            </button>
          </div>
          {!selection && (
            <div className="js-inspector-empty">
              <span>◎</span>
              <h3>Chọn một điểm hoặc dây</h3>
              <p>Thông tin hành trình và thao tác phù hợp sẽ hiện ở đây.</p>
              <small>
                Mọi mốc giờ hiển thị theo GMT+07:00. Tiến trình dựa trên dữ liệu đã ghi nhận, không
                phải GPS trực tiếp.
              </small>
            </div>
          )}
          {node && (
            <>
              <NodeInspector
                node={node}
                update={updateNode}
                remove={() => {
                  semantic({
                    ...journey,
                    nodes: journey.nodes.filter((n) => n.nodeKey !== node.nodeKey),
                    wires: journey.wires.filter(
                      (w) => w.fromNodeKey !== node.nodeKey && w.toNodeKey !== node.nodeKey,
                    ),
                  });
                  select(null);
                }}
                editable={editable}
                publicView={!editRole}
                reservations={detail.data?.quarantineReservations ?? []}
              />
              {resourcesEditable && detail.data && node.nodeType === 'QUARANTINE' && (
                <>
                  <QuarantineForm plan={detail.data} pinned={pinned} />
                </>
              )}
              {resourcesEditable && detail.data && node.nodeType === 'DESTINATION' && (
                <InsuranceForm plan={detail.data} pinned={pinned} />
              )}
              {mode === 'customer' && (
                <a href="#journey-welfare-log">Xem nhật ký sức khỏe được chia sẻ bên dưới</a>
              )}
            </>
          )}
          {wire && (
            <>
              <div className="js-inspector-type">
                {wire.transportMode === 'ROAD' ? '🚛' : '✈'} Chặng {wire.sequenceNo} ·{' '}
                <StatusBadge status={wire.legStatus} />
              </div>
              <fieldset disabled={!editable}>
                <label className="js-field">
                  Phương thức
                  <select
                    value={wire.transportMode}
                    onChange={(e) =>
                      updateWire({ transportMode: e.target.value as Wire['transportMode'] })
                    }
                  >
                    <option>ROAD</option>
                    <option>AIR</option>
                  </select>
                </label>
                <Field
                  label="Khoảng cách (km)"
                  value={wire.distanceKm}
                  onChange={(distanceKm) => updateWire({ distanceKm })}
                />
                {mode === 'edit' && (
                  <label className="js-field">
                    Nguồn khoảng cách
                    <select
                      value={wire.distanceSource}
                      onChange={(e) => updateWire({ distanceSource: e.target.value })}
                    >
                      <option>MANUAL_VERIFIED</option>
                      <option>ROUTE_MATRIX</option>
                      <option>SUPPLIER_DECLARATION</option>
                    </select>
                  </label>
                )}
                {editRole && (
                  <SupplierPicker
                    key={wire.id}
                    label="Hãng vận chuyển"
                    disabled={!editable}
                    value={wire.supplierId ?? leg?.supplierId ?? null}
                    onChange={(supplierId) => updateWire({ supplierId })}
                  />
                )}
                <DateField
                  label="Khởi hành"
                  value={wire.plannedDeparture}
                  change={(v) => updateWire({ plannedDeparture: v ?? '' })}
                />
                <DateField
                  label="Đến nơi"
                  value={wire.plannedArrival}
                  change={(v) => updateWire({ plannedArrival: v ?? '' })}
                />
                {wire.transportMode === 'AIR' && (
                  <Field
                    label="Số chuyến bay dự kiến"
                    max={50}
                    value={wire.flightNumber ?? ''}
                    onChange={(flightNumber) => updateWire({ flightNumber })}
                  />
                )}
                <button
                  type="button"
                  onClick={() => {
                    semantic(cascade(journey));
                  }}
                >
                  ⚡ Khớp giờ toàn tuyến
                </button>
                <button
                  type="button"
                  className="js-danger"
                  onClick={() => {
                    semantic({ ...journey, wires: journey.wires.filter((w) => w.id !== wire.id) });
                    select(null);
                  }}
                >
                  Gỡ dây nối
                </button>
              </fieldset>
              <p className="js-muted">
                Thực tế: {showTime(wire.actualDeparture)} → {showTime(wire.actualArrival)}
              </p>
              {resourcesEditable && detail.data && leg && (
                <ResourceAttachment
                  key={`${detail.data.planId}:${leg.legId}`}
                  plan={detail.data}
                  leg={leg}
                  pinned={pinned}
                />
              )}
              {mode === 'driver' &&
                wire.assignedToCurrentDriver &&
                wire.transportMode === 'ROAD' && (
                  <div className="js-driver-actions">
                    <Link to={`/driver/orders/${orderId}/departure`}>
                      Nhận ngựa / kiểm tra danh tính
                    </Link>
                    <Link
                      to={
                        wire.sequenceNo === 1
                          ? `/driver/orders/${orderId}/departure`
                          : `${executionPath}&action=start`
                      }
                    >
                      Bắt đầu chặng
                    </Link>
                    <Link to={`${executionPath}&action=welfare`}>Ghi nhận sức khỏe</Link>
                    <Link to={`${executionPath}&action=milestone`}>Cập nhật vị trí</Link>
                    <Link to={`${executionPath}&action=complete`}>Hoàn tất chặng</Link>
                  </div>
                )}
              {mode === 'customer' && (
                <a href="#journey-welfare-log">Xem nhật ký sức khỏe được chia sẻ</a>
              )}
            </>
          )}
          {resourcesEditable && detail.data && (
            <details className="js-finalize">
              <summary>✅ Chốt kế hoạch</summary>
              <p>Xác nhận chỉ khi các điều kiện BE đạt. Chốt kế hoạch không cấp phép khởi hành.</p>
              <QuarantineForm plan={detail.data} pinned={pinned} />
              <InsuranceForm plan={detail.data} pinned={pinned} />
              <ConfirmForm plan={detail.data} pinned={pinned} />
            </details>
          )}
        </aside>
      </div>
    </section>
  );
}
