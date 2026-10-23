/** Journey graph editing is local until compiled into a new versioned plan. */
export const TIMEZONE = 'Asia/Ho_Chi_Minh';
export const nodeKinds = [
  'ORIGIN',
  'REST_STOP',
  'AIRPORT_HANDOVER',
  'TRANSIT_HUB',
  'QUARANTINE',
  'DESTINATION',
] as const;
export type NodeKind = (typeof nodeKinds)[number];
export const nodeDesign: Record<NodeKind, { name: string; icon: string; color: string }> = {
  ORIGIN: { name: 'Nhận ngựa', icon: '📍', color: '#10B981' },
  REST_STOP: { name: 'Nghỉ & chăm sóc', icon: '🌿', color: '#06B6D4' },
  AIRPORT_HANDOVER: { name: 'Bàn giao sân bay', icon: '⇄', color: '#3B82F6' },
  TRANSIT_HUB: { name: 'Quá cảnh', icon: '🌐', color: '#8B5CF6' },
  QUARANTINE: { name: 'Cách ly', icon: '🏥', color: '#F59E0B' },
  DESTINATION: { name: 'Giao đích', icon: '🏁', color: '#F43F5E' },
};
export type NodeDetails = {
  contactPerson?: string | null;
  requireMicrochipCheck?: boolean | null;
  preDepartureVetNote?: string | null;
  feedingAndWateringPlan?: string | null;
  mandatoryVetCheck?: boolean | null;
  facilitySupplierId?: number | null;
  quarantineType?: 'PRE_EXPORT' | 'POST_ARRIVAL' | null;
  reservedStallCount?: number | null;
  biosecurityLevel?: 'STANDARD' | 'HIGH_ISOLATION' | null;
  groundHandlerSupplierId?: number | null;
  receiverName?: string | null;
  receiverPhone?: string | null;
  insurerSupplierId?: number | null;
  policyNumber?: string | null;
  coverageAmount?: string | null;
};
export type Checkpoint = {
  nodeKey: string;
  nodeType: NodeKind;
  sequenceOrder: number;
  locationName: string;
  countryCode: string;
  plannedArrivalAt: string | null;
  plannedDepartureAt: string | null;
  dwellMinutes: number;
  transitCustomsMode: 'STAY_ON_AIRCRAFT' | 'AIRSIDE_TRANSFER' | 'TERMINAL_HOLDING' | null;
  transitPermitRef: string | null;
  welfareCareNotes: string | null;
  quarantineReservationId: number | null;
  posX: number;
  posY: number;
  details: NodeDetails | null;
};
export type Wire = {
  id: string;
  legId?: number;
  sequenceNo: number;
  fromNodeKey: string;
  toNodeKey: string;
  transportMode: 'ROAD' | 'AIR';
  /** Staff-only draft value; the public graph projection intentionally omits it. */
  supplierId?: number | null;
  distanceKm: string;
  distanceSource: string;
  plannedDeparture: string;
  plannedArrival: string;
  legStatus: string;
  vehicleId?: number | null;
  driverStaffId?: number | null;
  flightNumber?: string | null;
  /** AIR only: surveyed fare in USD as typed; sent with the graph draft. */
  estimatedAirfare?: string | null;
  stallEquipmentId?: number | null;
  assignedToCurrentDriver?: boolean;
  actualDeparture?: string | null;
  actualArrival?: string | null;
};
export type Layout = { zoom: number; panX: number; panY: number };
export type Journey = { nodes: Checkpoint[]; wires: Wire[]; layout: Layout };
/** Last recorded observation; planned times never establish physical presence. */
export function latestRecordedProgress(journey: Journey) {
  const events = journey.wires.flatMap((wire) => [
    {
      kind: 'DEPARTED' as const,
      nodeKey: wire.fromNodeKey,
      at: wire.actualDeparture,
      sequenceNo: wire.sequenceNo,
    },
    {
      kind: 'ARRIVED' as const,
      nodeKey: wire.toNodeKey,
      at: wire.actualArrival,
      sequenceNo: wire.sequenceNo,
    },
  ]);
  return (
    events
      .filter(
        (event): event is typeof event & { at: string } =>
          !!event.at &&
          Number.isFinite(Date.parse(event.at)) &&
          journey.nodes.some((node) => node.nodeKey === event.nodeKey),
      )
      .sort(
        (a, b) =>
          Date.parse(b.at) - Date.parse(a.at) ||
          b.sequenceNo - a.sequenceNo ||
          (a.kind === 'ARRIVED' ? -1 : 1),
      )[0] ?? null
  );
}
export const emptyJourney = (): Journey => ({
  nodes: [],
  wires: [],
  layout: { zoom: 0.75, panX: 45, panY: 80 },
});
export function newNode(kind: NodeKind, index: number): Checkpoint {
  return {
    nodeKey: crypto.randomUUID(),
    nodeType: kind,
    sequenceOrder: index + 1,
    locationName: '',
    countryCode: '',
    plannedArrivalAt: null,
    plannedDepartureAt: null,
    dwellMinutes:
      kind === 'AIRPORT_HANDOVER' || kind === 'TRANSIT_HUB' ? 180 : kind === 'REST_STOP' ? 60 : 0,
    transitCustomsMode: null,
    transitPermitRef: null,
    welfareCareNotes: null,
    quarantineReservationId: null,
    posX: 80 + (index % 4) * 370,
    posY: 120 + Math.floor(index / 4) * 280,
    details: kind === 'ORIGIN' ? { requireMicrochipCheck: true } : {},
  };
}
/** Native datetime-local fields always represent the same explicit GMT+07 zone. */
export function localTime(value: string | null | undefined) {
  if (!value || !Number.isFinite(Date.parse(value))) return '';
  return new Date(Date.parse(value) + 7 * 3_600_000).toISOString().slice(0, 16);
}
export function offsetTime(local: string) {
  return local ? `${local}:00+07:00` : '';
}
export function atOffset(ms: number) {
  return `${new Date(ms + 7 * 3_600_000).toISOString().slice(0, 19)}+07:00`;
}
export function showTime(value: string | null | undefined) {
  if (!value || !Number.isFinite(Date.parse(value))) return 'Chưa đặt giờ';
  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: TIMEZONE,
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}
/** A valid journey is one connected acyclic chain, never a route fan-out. */
export function ordered(j: Journey): { nodes: Checkpoint[]; wires: Wire[] } | null {
  const origin = j.nodes.filter((n) => n.nodeType === 'ORIGIN');
  if (origin.length !== 1 || j.nodes.filter((n) => n.nodeType === 'DESTINATION').length !== 1)
    return null;
  const nodes = [origin[0]],
    wires: Wire[] = [],
    seen = new Set([origin[0].nodeKey]);
  while (nodes.at(-1)?.nodeType !== 'DESTINATION') {
    const next = j.wires.filter((w) => w.fromNodeKey === nodes.at(-1)!.nodeKey);
    if (next.length !== 1 || seen.has(next[0].toNodeKey)) return null;
    const node = j.nodes.find((n) => n.nodeKey === next[0].toNodeKey);
    if (!node || j.wires.filter((w) => w.toNodeKey === node.nodeKey).length !== 1) return null;
    nodes.push(node);
    wires.push(next[0]);
    seen.add(node.nodeKey);
  }
  return nodes.length === j.nodes.length && wires.length === j.wires.length
    ? { nodes, wires }
    : null;
}
export function connect(j: Journey, from: string, to: string): Journey {
  const a = j.nodes.find((n) => n.nodeKey === from),
    b = j.nodes.find((n) => n.nodeKey === to);
  if (!a || !b || from === to || a.nodeType === 'DESTINATION' || b.nodeType === 'ORIGIN')
    throw new Error('Cổng nối không hợp lệ.');
  if (j.wires.some((w) => w.fromNodeKey === from || w.toNodeKey === to))
    throw new Error('Mỗi điểm chỉ có một dây vào và một dây ra.');
  let cursor: string | undefined = to;
  const seen = new Set<string>();
  while (cursor && !seen.has(cursor)) {
    if (cursor === from) throw new Error('Không thể tạo vòng lặp trong hành trình.');
    seen.add(cursor);
    cursor = j.wires.find((w) => w.fromNodeKey === cursor)?.toNodeKey;
  }
  const start = a.plannedDepartureAt ?? '';
  return {
    ...j,
    wires: [
      ...j.wires,
      {
        id: crypto.randomUUID(),
        sequenceNo: j.wires.length + 1,
        fromNodeKey: from,
        toNodeKey: to,
        transportMode: 'ROAD',
        distanceKm: '',
        distanceSource: 'MANUAL_VERIFIED',
        plannedDeparture: start,
        plannedArrival: start ? atOffset(Date.parse(start) + 3_600_000) : '',
        legStatus: 'PLANNED',
      },
    ],
  };
}
/** Preserve travel duration, only push schedules later; never invent observed progress. */
export function cascade(j: Journey): Journey {
  const chain = ordered(j);
  if (!chain) return j;
  const nodes = j.nodes.map((n) => ({ ...n })),
    wires = j.wires.map((w) => ({ ...w }));
  let earliest = Date.parse(chain.nodes[0].plannedDepartureAt ?? '');
  for (const w of chain.wires) {
    const wire = wires.find((x) => x.id === w.id)!;
    const start = Date.parse(wire.plannedDeparture),
      end = Date.parse(wire.plannedArrival);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) break;
    const departure = Number.isFinite(earliest) ? Math.max(start, earliest) : start;
    wire.plannedDeparture = atOffset(departure);
    wire.plannedArrival = atOffset(departure + end - start);
    const target = nodes.find((n) => n.nodeKey === wire.toNodeKey)!;
    const explicitEnd =
      target.nodeType === 'QUARANTINE' ? Date.parse(target.plannedDepartureAt ?? '') : NaN;
    target.plannedArrivalAt = wire.plannedArrival;
    earliest = departure + end - start + target.dwellMinutes * 60_000;
    if (Number.isFinite(explicitEnd)) earliest = Math.max(earliest, explicitEnd);
    target.plannedDepartureAt = atOffset(earliest);
  }
  return { ...j, nodes, wires };
}
export function graphErrors(j: Journey) {
  const errors: string[] = [],
    chain = ordered(j);
  if (!chain || !j.wires.length)
    return [
      'Nối toàn bộ điểm thành một tuyến từ Nhận ngựa đến Giao đích, không nhánh hoặc vòng lặp.',
    ];
  if (j.nodes.length > 21) errors.push('Tối đa 21 điểm trên một kế hoạch.');
  chain.nodes.forEach((n, i) => {
    if (!n.locationName.trim() || !/^[A-Z]{2}$/.test(n.countryCode))
      errors.push(`Điểm ${i + 1}: nhập tên và mã quốc gia 2 chữ cái.`);
  });
  chain.wires.forEach((w, i) => {
    const start = Date.parse(w.plannedDeparture),
      end = Date.parse(w.plannedArrival);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start)
      errors.push(`Chặng ${i + 1}: giờ đến phải sau giờ đi.`);
    if (!/^\d+(\.\d{1,3})?$/.test(w.distanceKm) || Number(w.distanceKm) <= 0)
      errors.push(`Chặng ${i + 1}: nhập số km dương, tối đa 3 số thập phân.`);
    if (
      i > 0 &&
      start < Date.parse(chain.wires[i - 1].plannedArrival) + chain.nodes[i].dwellMinutes * 60_000
    )
      errors.push(`Chặng ${i + 1}: chưa đủ thời gian chuyển tiếp.`);
  });
  return errors;
}
export function internationalTemplate(): Journey {
  const kinds: NodeKind[] = [
    'ORIGIN',
    'REST_STOP',
    'AIRPORT_HANDOVER',
    'TRANSIT_HUB',
    'AIRPORT_HANDOVER',
    'QUARANTINE',
    'DESTINATION',
  ];
  const names = [
    'Điểm đón',
    'Trạm nghỉ',
    'Sân bay xuất phát',
    'Sân bay quá cảnh',
    'Sân bay đến',
    'Cơ sở cách ly',
    'Điểm giao',
  ];
  let j = emptyJourney();
  j.nodes = kinds.map((k, i) => ({
    ...newNode(k, i),
    locationName: names[i],
    posX: 60 + (i % 4) * 390,
    posY: 100 + Math.floor(i / 4) * 300,
  }));
  for (let i = 0; i < j.nodes.length - 1; i++) {
    j = connect(j, j.nodes[i].nodeKey, j.nodes[i + 1].nodeKey);
    j.wires[i].transportMode = i === 2 || i === 3 ? 'AIR' : 'ROAD';
  }
  return j;
}
