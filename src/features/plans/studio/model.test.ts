import { describe, expect, it } from 'vitest';
import {
  cascade,
  connect,
  emptyJourney,
  newNode,
  ordered,
  latestRecordedProgress,
  localTime,
  offsetTime,
  type Journey,
} from './model';
import { compileBody } from './graphApi';

function route(): Journey {
  let j = emptyJourney();
  j.nodes = [newNode('ORIGIN', 0), newNode('REST_STOP', 1), newNode('DESTINATION', 2)];
  j.nodes.forEach((n, i) => {
    n.locationName = `Stop ${i}`;
    n.countryCode = 'VN';
  });
  j = connect(j, j.nodes[0].nodeKey, j.nodes[1].nodeKey);
  j = connect(j, j.nodes[1].nodeKey, j.nodes[2].nodeKey);
  j.wires[0] = {
    ...j.wires[0],
    distanceKm: '12.345',
    plannedDeparture: '2027-02-01T08:00:00+07:00',
    plannedArrival: '2027-02-01T09:00:00+07:00',
  };
  j.wires[1] = {
    ...j.wires[1],
    distanceKm: '20',
    plannedDeparture: '2027-02-01T09:00:00+07:00',
    plannedArrival: '2027-02-01T11:00:00+07:00',
  };
  return j;
}
describe('Journey compilation and scheduling', () => {
  it('pushes downstream wires by dwell without changing travel duration', () => {
    const j = route();
    j.nodes[1].dwellMinutes = 120;
    const next = cascade(j);
    expect(next.wires[1].plannedDeparture).toBe('2027-02-01T11:00:00+07:00');
    expect(next.wires[1].plannedArrival).toBe('2027-02-01T13:00:00+07:00');
    expect(j.wires[1].plannedArrival).toBe('2027-02-01T11:00:00+07:00');
  });
  it('orders by topology rather than canvas position or collection order', () => {
    const j = route();
    j.nodes.reverse();
    j.wires.reverse();
    expect(ordered(j)?.nodes[0].nodeType).toBe('ORIGIN');
    expect(ordered(j)?.wires[0].toNodeKey).toBe(j.nodes[1].nodeKey);
  });
  it('rejects branches, self links and cycles before persistence', () => {
    const j = route();
    expect(() => connect(j, j.nodes[0].nodeKey, j.nodes[2].nodeKey)).toThrow();
    expect(() => connect(j, j.nodes[1].nodeKey, j.nodes[1].nodeKey)).toThrow();
    expect(ordered({ ...j, nodes: [...j.nodes, newNode('REST_STOP', 3)] })).toBeNull();
  });
  it('normalizes payloads to +07 and preserves command IDs and decimal km', () => {
    const body = compileBody(cascade(route()), 21, '0123456789abcdef', 'operation-1');
    expect(body.draft.command).toEqual({
      recordVersion: '0123456789abcdef',
      operationId: 'operation-1',
    });
    expect(body.draft.legs[0].distanceKm).toBe(12.345);
    expect(
      body.draft.legs.every(
        (l) => l.startTimezone === 'Asia/Ho_Chi_Minh' && l.plannedDeparture?.endsWith('+07:00'),
      ),
    ).toBe(true);
    expect(body.checkpointNodes[1].plannedArrivalAt).toBe(body.draft.legs[0].plannedArrival);
    expect(body.checkpointNodes[1].plannedDepartureAt).toBe(body.draft.legs[1].plannedDeparture);
  });
  it('displays offset instants independently of the browser local timezone', () => {
    expect(localTime('2027-02-01T01:00:00Z')).toBe('2027-02-01T08:00');
    expect(offsetTime('2027-02-01T08:00')).toBe('2027-02-01T08:00:00+07:00');
  });
  it('uses only actual observations to identify the last recorded checkpoint', () => {
    const j = cascade(route());
    j.wires[0].legStatus = 'COMPLETED';
    expect(latestRecordedProgress(j)).toBeNull();
    j.wires[0].actualArrival = '2027-02-01T09:15:00+07:00';
    expect(latestRecordedProgress(j)).toMatchObject({
      kind: 'ARRIVED',
      nodeKey: j.nodes[1].nodeKey,
    });
    j.wires[1].actualDeparture = '2027-02-01T11:20:00+07:00';
    expect(latestRecordedProgress(j)).toMatchObject({
      kind: 'DEPARTED',
      nodeKey: j.nodes[1].nodeKey,
    });
    // Consecutive completion/start commands may share DATETIME2(0) seconds.
    j.wires[1].actualDeparture = j.wires[0].actualArrival;
    expect(latestRecordedProgress(j)?.kind).toBe('DEPARTED');
    j.wires[1].actualArrival = j.wires[1].actualDeparture;
    expect(latestRecordedProgress(j)).toMatchObject({
      kind: 'ARRIVED',
      nodeKey: j.nodes[2].nodeKey,
    });
  });
});
