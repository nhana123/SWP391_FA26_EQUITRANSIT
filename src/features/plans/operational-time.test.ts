import { describe, expect, it } from 'vitest';
import { canonicalTime, gapMinutes, shiftOperationalTime } from './operational-time';
describe('canonical operational scheduling time', () => {
  it('interprets wall time in HCM independent of the machine timezone', () => {
    expect(canonicalTime('2026-10-20T08:00')).toBe('2026-10-20T08:00:00+07:00');
    expect(canonicalTime('2026-10-20T01:00:00Z')).toBe('2026-10-20T08:00:00+07:00');
    expect(canonicalTime('2026-10-20T09:00:00+08:00')).toBe('2026-10-20T08:00:00+07:00');
    expect(canonicalTime('2026-02-30T08:00')).toBeNull();
  });
  it('compares instants and shifts across midnight without changing duration', () => {
    expect(gapMinutes('2026-10-20T23:00:00+07:00', '2026-10-20T17:00:00Z')).toBe(60);
    expect(shiftOperationalTime('2026-10-20T23:00', 120)).toBe('2026-10-21T01:00:00');
  });
});
