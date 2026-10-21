import { useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { cascade, connect, nodeDesign, showTime, type Journey } from './model';
export type Selection = { kind: 'node' | 'wire'; id: string } | null;
const WIDTH = 264,
  HEIGHT = 152;
export function wireCurve(ax: number, ay: number, bx: number, by: number) {
  const bend = Math.max(90, Math.abs(bx - ax) * 0.45);
  return `M ${ax} ${ay} C ${ax + bend} ${ay}, ${bx - bend} ${by}, ${bx} ${by}`;
}
export type WireState = 'bad' | 'road' | 'air' | 'pending';
/** Grey = resources missing, green/blue = ready, red = timing does not chain. */
export function wireState(journey: Journey, w: Journey['wires'][number]): WireState {
  const a = journey.nodes.find((n) => n.nodeKey === w.fromNodeKey);
  const previous = journey.wires.find((x) => x.toNodeKey === w.fromNodeKey);
  const bad =
    Date.parse(w.plannedArrival) <= Date.parse(w.plannedDeparture) ||
    (!!a &&
      !!previous &&
      Date.parse(w.plannedDeparture) <
        Date.parse(previous.plannedArrival) + a.dwellMinutes * 60000);
  if (bad) return 'bad';
  const ready =
    w.transportMode === 'ROAD'
      ? !!w.vehicleId && !!w.driverStaffId
      : !!w.flightNumber && !!w.stallEquipmentId;
  return ready ? (w.transportMode === 'ROAD' ? 'road' : 'air') : 'pending';
}
export function JourneyStudioCanvas({
  journey,
  onChange,
  editable,
  selection,
  select,
  driverMode = false,
  canConnect = editable,
  onAutoFix,
}: {
  journey: Journey;
  onChange: (j: Journey) => void;
  editable: boolean;
  selection: Selection;
  select: (s: Selection) => void;
  driverMode?: boolean;
  canConnect?: boolean;
  /** Present only when the schedule may be edited; pushes later legs to fit. */
  onAutoFix?: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    kind: 'node' | 'pan' | 'wire';
    id?: string;
    x: number;
    y: number;
    sx: number;
    sy: number;
  } | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [point, setPoint] = useState<{ x: number; y: number } | null>(null);
  const [snap, setSnap] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [error, setError] = useState('');
  function world(e: { clientX: number; clientY: number }) {
    const r = ref.current!.getBoundingClientRect();
    return {
      x: (e.clientX - r.left - journey.layout.panX) / journey.layout.zoom,
      y: (e.clientY - r.top - journey.layout.panY) / journey.layout.zoom,
    };
  }
  async function finishConnection(to: string) {
    if (!pending || !canConnect) return;
    try {
      onChange(cascade(connect(journey, pending, to)));
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không nối được.');
    }
    setPending(null);
    setPoint(null);
    setSnap(null);
  }
  function move(e: PointerEvent) {
    const d = drag.current;
    if (!d) return;
    if (d.kind === 'pan')
      onChange({
        ...journey,
        layout: { ...journey.layout, panX: d.sx + e.clientX - d.x, panY: d.sy + e.clientY - d.y },
      });
    if (d.kind === 'node' && editable)
      onChange({
        ...journey,
        nodes: journey.nodes.map((n) =>
          n.nodeKey === d.id
            ? {
                ...n,
                posX: Math.max(
                  -2000,
                  Math.min(12000, d.sx + (e.clientX - d.x) / journey.layout.zoom),
                ),
                posY: Math.max(
                  -2000,
                  Math.min(8000, d.sy + (e.clientY - d.y) / journey.layout.zoom),
                ),
              }
            : n,
        ),
      });
    if (d.kind === 'wire') {
      const p = world(e);
      setPoint(p);
      const target = journey.nodes.find(
        (n) =>
          n.nodeType !== 'ORIGIN' &&
          n.nodeKey !== d.id &&
          Math.hypot(n.posX - p.x, n.posY + 73 - p.y) < 38,
      );
      setSnap(target?.nodeKey ?? null);
    }
  }
  return (
    <div
      ref={ref}
      className="js-canvas"
      aria-label="Journey canvas"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          setPending(null);
          select(null);
        }
      }}
      onPointerDown={(e) => {
        if ((e.target as HTMLElement).closest('button, .js-node, .js-wire-path')) return;
        drag.current = {
          kind: 'pan',
          x: e.clientX,
          y: e.clientY,
          sx: journey.layout.panX,
          sy: journey.layout.panY,
        };
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={move}
      onPointerUp={() => {
        if (drag.current?.kind === 'wire' && snap) void finishConnection(snap);
        drag.current = null;
        setPoint(null);
        setSnap(null);
      }}
      onWheel={(e) => {
        if (e.ctrlKey || e.metaKey) {
          onChange({
            ...journey,
            layout: {
              ...journey.layout,
              zoom: Math.max(
                0.5,
                Math.min(1.5, journey.layout.zoom + (e.deltaY < 0 ? 0.05 : -0.05)),
              ),
            },
          });
        }
      }}
    >
      <div className="js-canvas-tip">
        Kéo nền để di chuyển · Ctrl + cuộn để zoom · Kéo cổng hoặc bấm hai cổng để nối
      </div>
      {error && (
        <div className="js-canvas-error" role="alert">
          {error}
        </div>
      )}
      <div
        className="js-world"
        style={{
          transform: `translate(${journey.layout.panX}px, ${journey.layout.panY}px) scale(${journey.layout.zoom})`,
        }}
      >
        <svg className="js-wires" width="16000" height="12000" aria-label="Transit wires">
          {journey.wires.map((w) => {
            const a = journey.nodes.find((n) => n.nodeKey === w.fromNodeKey),
              b = journey.nodes.find((n) => n.nodeKey === w.toNodeKey);
            if (!a || !b) return null;
            const active =
              w.legStatus === 'IN_TRANSIT' || (driverMode && w.assignedToCurrentDriver);
            return (
              <path
                key={w.id}
                d={wireCurve(a.posX + WIDTH, a.posY + 73, b.posX, b.posY + 73)}
                className={`js-wire-path ${wireState(journey, w)} ${selection?.id === w.id || active ? 'active' : ''} ${w.legStatus === 'COMPLETED' ? 'completed' : ''}`}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => select({ kind: 'wire', id: w.id })}
                onMouseEnter={() => setHover(w.id)}
                onMouseLeave={() => setHover(null)}
              />
            );
          })}
          {pending &&
            point &&
            (() => {
              const a = journey.nodes.find((n) => n.nodeKey === pending);
              const b = journey.nodes.find((n) => n.nodeKey === snap);
              return (
                a && (
                  <path
                    className="js-pending-wire"
                    d={wireCurve(
                      a.posX + WIDTH,
                      a.posY + 73,
                      b ? b.posX : point.x,
                      b ? b.posY + 73 : point.y,
                    )}
                  />
                )
              );
            })()}
        </svg>
        {journey.wires.map((w) => {
          const a = journey.nodes.find((n) => n.nodeKey === w.fromNodeKey),
            b = journey.nodes.find((n) => n.nodeKey === w.toNodeKey);
          if (!a || !b) return null;
          const state = wireState(journey, w);
          return (
            <div
              key={w.id}
              className="js-wire-label"
              style={{ left: (a.posX + WIDTH + b.posX) / 2 - 85, top: (a.posY + b.posY) / 2 + 40 }}
              onMouseEnter={() => setHover(w.id)}
              onMouseLeave={() => setHover(null)}
            >
              <button
                type="button"
                className={`js-capsule ${state} ${selection?.id === w.id ? 'selected' : ''}`}
                aria-label={`Chặng ${w.sequenceNo} ${w.transportMode} – chỉnh sửa`}
                onClick={() => select({ kind: 'wire', id: w.id })}
              >
                {w.transportMode === 'ROAD' ? '🚛' : '✈'} {w.transportMode} · {w.distanceKm || '?'}{' '}
                km <em aria-hidden="true">✎</em>
                <span>
                  {w.transportMode === 'ROAD'
                    ? w.vehicleId
                      ? `Xe #${w.vehicleId}`
                      : 'Chưa gán xe'
                    : [
                        w.flightNumber || 'Chưa đặt chuyến',
                        w.stallEquipmentId ? `Stall #${w.stallEquipmentId}` : '',
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                </span>
              </button>
              {state === 'bad' && onAutoFix && (
                <button type="button" className="js-autofix" onClick={onAutoFix}>
                  ⚡ Tự động đẩy khớp giờ toàn tuyến
                </button>
              )}
              {hover === w.id && (
                <div className="js-preview" role="tooltip">
                  <strong>
                    {a.locationName || 'Điểm đi'} ({a.countryCode || '??'}) →{' '}
                    {b.locationName || 'Điểm đến'} ({b.countryCode || '??'})
                  </strong>
                  <p>
                    🕒 {showTime(w.plannedDeparture)} → {showTime(w.plannedArrival)} (GMT+07)
                  </p>
                  <p>
                    📏 {w.distanceKm || '?'} km · {w.transportMode}
                  </p>
                  <p>
                    {w.transportMode === 'ROAD'
                      ? `🚛 Xe ${w.vehicleId ? `#${w.vehicleId}` : '—'} · Tài xế ${w.driverStaffId ? `#${w.driverStaffId}` : '—'}`
                      : `✈ Chuyến ${w.flightNumber || '—'} · Air stall ${w.stallEquipmentId ? `#${w.stallEquipmentId}` : '—'}`}
                  </p>
                  <p>
                    ⚙ Trạng thái: {w.legStatus}
                    {state === 'bad'
                      ? ' · ⚠ Lệch giờ chuyển tiếp'
                      : state === 'pending'
                        ? ' · Chưa đủ tài nguyên'
                        : ' · Sẵn sàng'}
                  </p>
                </div>
              )}
            </div>
          );
        })}
        {journey.nodes.map((n) => (
          <article
            key={n.nodeKey}
            className={`js-node ${selection?.id === n.nodeKey ? 'selected' : ''}`}
            style={
              {
                left: n.posX,
                top: n.posY,
                width: WIDTH,
                minHeight: HEIGHT,
                '--node-color': nodeDesign[n.nodeType].color,
              } as CSSProperties
            }
          >
            <button
              className="js-node-header"
              type="button"
              onClick={() => select({ kind: 'node', id: n.nodeKey })}
              onPointerDown={(e) => {
                e.stopPropagation();
                select({ kind: 'node', id: n.nodeKey });
                if (!editable) return;
                drag.current = {
                  kind: 'node',
                  id: n.nodeKey,
                  x: e.clientX,
                  y: e.clientY,
                  sx: n.posX,
                  sy: n.posY,
                };
                ref.current!.setPointerCapture(e.pointerId);
              }}
            >
              <span>{nodeDesign[n.nodeType].icon}</span> {nodeDesign[n.nodeType].name}
              <small>⋮⋮</small>
            </button>
            {n.nodeType !== 'ORIGIN' && (
              <button
                type="button"
                title="Cổng vào"
                aria-label={`Nối vào ${n.locationName || nodeDesign[n.nodeType].name}`}
                className={`js-pin input ${snap === n.nodeKey ? 'snap' : ''}`}
                disabled={!canConnect}
                onClick={() => void finishConnection(n.nodeKey)}
              />
            )}
            <div className="js-node-body">
              <strong>{n.locationName || 'Đặt tên điểm dừng'}</strong>
              <div className="js-chips">
                <span>{n.countryCode || 'Quốc gia?'}</span>
                {n.dwellMinutes > 0 && <span>⏱ {n.dwellMinutes} phút</span>}
              </div>
              <p>{showTime(n.nodeType === 'ORIGIN' ? n.plannedDepartureAt : n.plannedArrivalAt)}</p>
            </div>
            {n.nodeType !== 'DESTINATION' && (
              <button
                type="button"
                aria-label={`Nối từ ${n.locationName || nodeDesign[n.nodeType].name}`}
                title="Kéo dây hoặc bấm để bắt đầu nối"
                className={`js-pin output ${pending === n.nodeKey ? 'snap' : ''}`}
                disabled={!canConnect}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  setPending(n.nodeKey);
                  setPoint(world(e));
                  drag.current = {
                    kind: 'wire',
                    id: n.nodeKey,
                    x: e.clientX,
                    y: e.clientY,
                    sx: 0,
                    sy: 0,
                  };
                  ref.current!.setPointerCapture(e.pointerId);
                }}
                onClick={() => {
                  setPending(n.nodeKey);
                  setError('');
                }}
              />
            )}
          </article>
        ))}
      </div>
      {!journey.nodes.length && (
        <div className="js-empty">
          <div>✦</div>
          <h3>Thiết kế một hành trình có chủ đích</h3>
          <p>Thêm điểm dừng từ Dock, rồi nối các cổng để tạo chặng ROAD hoặc AIR.</p>
          <small>Địa điểm là điểm mốc. Dây nối là chuyến đi.</small>
        </div>
      )}
    </div>
  );
}
