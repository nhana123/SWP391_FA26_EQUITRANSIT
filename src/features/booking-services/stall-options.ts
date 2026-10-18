import type { Disclosure } from './contracts';

/** A view recommendation is never a saved preference or a physical assignment. */
export function recommendsWide(disclosure: Disclosure) {
  const offered =
    disclosure.sections.find((section) => section.code === 'AIR_STALL')?.options ?? [];
  return (
    offered.includes('WIDE') &&
    disclosure.airStalls.some(
      (stall) => stall.option === 'SHARED_ONE' && stall.status === 'UNSUITABLE',
    ) &&
    disclosure.airStalls.some((stall) => stall.option === 'WIDE' && stall.status !== 'UNSUITABLE')
  );
}
