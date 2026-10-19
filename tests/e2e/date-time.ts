import type { Locator } from '@playwright/test';

/** Picks date, time and zone in a DateTimeInput, as a user would. */
export async function fillDateTime(input: Locator, iso: string) {
  const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})(?::\d{2})?(Z|[+-]\d{2}:\d{2})$/.exec(iso);
  if (!match) throw new Error(`Not an ISO date with offset: ${iso}`);
  await input.fill(match[1]);
  await input
    .locator('xpath=following-sibling::select[1]')
    .selectOption(match[2] === '+00:00' ? 'Z' : match[2]);
}
