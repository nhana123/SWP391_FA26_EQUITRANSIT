import { expect, type Page } from '@playwright/test';
import { chargeLabels } from '../../src/features/quotations/mutation-contracts';
import type { QuoteResponse } from '../../src/features/quotations/contracts';
import { LiveCase } from './fixtures';

export async function prepareThroughUI(live: LiveCase, actor: 'manager' | 'coordinator') {
  const page = await live.openRequest(actor);
  await page.getByRole('link', { name: 'Prepare quotation', exact: true }).click();
  const offer = live.scenario.offer;
  const form = page.getByRole('form', { name: 'Record supplier offer' });
  await form.getByLabel('Service', { exact: true }).selectOption(offer.serviceCode);
  for (const [label, value] of [
    ['Provider name', offer.providerName],
    ['Offer reference', offer.offerReference],
    ['Quantity', offer.quantity],
    ['Purchase unit price (USD, internal cost)', offer.purchaseUnitPrice],
    ['Retail unit price (USD, customer price)', offer.retailUnitPrice],
    ['Offer valid until', offer.validUntil],
    ['Evidence reference', offer.evidenceFileKey],
  ])
    await form.getByLabel(label, { exact: true }).fill(value);
  if (offer.serviceCode === 'AIRFARE') {
    await form
      .getByRole('checkbox', { name: 'Air stall', exact: true })
      .setChecked(offer.includesStall);
    for (const code of offer.includedCharges)
      await form.getByRole('checkbox', { name: chargeLabels[code], exact: true }).check();
  }
  const offerResult = page.waitForResponse(
    (r) =>
      r.request().method() === 'POST' &&
      new URL(r.url()).pathname === `${live.base()}/supplier-offers`,
  );
  await form.getByRole('button', { name: 'Record offer', exact: true }).click();
  const saved = await offerResult;
  if (saved.status() !== 200) throw new Error('UI_OFFER_NOT_RECORDED');
  const receipt = (await saved.json()) as { offerId: number };
  live.track('offerIds', receipt.offerId);
  const input = live.scenario.prepare;
  await page.getByLabel('Quotation valid until', { exact: true }).fill(input.validUntil);
  for (let i = 0; i < input.assessments.length; i++) {
    const row = input.assessments[i];
    await page.getByRole('button', { name: 'Add evidence', exact: true }).click();
    const fields = page.locator('.evidence-row').nth(i);
    await fields.getByLabel('Charge', { exact: true }).selectOption(row.code);
    await fields.getByLabel('Outcome', { exact: true }).selectOption(row.status);
    if (row.status === 'PRICED') {
      await fields.getByLabel('Quantity', { exact: true }).fill(row.quantity ?? '');
      const offerId = row.code === offer.serviceCode ? receipt.offerId : row.offerId;
      if (offerId !== null) await fields.getByLabel('Offer', { exact: true }).fill(String(offerId));
      else if (row.tariffId !== null)
        await fields.getByLabel('Tariff ID', { exact: true }).fill(String(row.tariffId));
    }
    await fields.getByLabel('Evidence reference', { exact: true }).fill(row.sourceReference);
    await fields.getByLabel('Reason', { exact: true }).fill(row.reason);
    await fields.getByLabel('Evidence valid until', { exact: true }).fill(row.validUntil);
  }
  const quoteForm = page.getByRole('form', { name: 'Prepare quotation version' });
  await quoteForm.getByLabel('Terms version', { exact: true }).fill(input.termsVersion);
  await quoteForm.getByLabel('Terms', { exact: true }).fill(input.terms);
  await quoteForm.getByLabel('Cancellation terms', { exact: true }).fill(input.cancellationTerms);
  for (let i = 0; i < input.paymentSchedule.length; i++) {
    if (i) await quoteForm.getByRole('button', { name: 'Add payment stage', exact: true }).click();
    const row = input.paymentSchedule[i];
    await quoteForm.getByLabel(`Stage ${i + 1} name`, { exact: true }).fill(row.paymentStage);
    await quoteForm.getByLabel(`Stage ${i + 1} amount (USD)`, { exact: true }).fill(row.amountDue);
    await quoteForm.getByLabel(`Stage ${i + 1} due at`, { exact: true }).fill(row.dueAt);
  }
  await quoteForm.getByRole('checkbox', { name: /I understand that earlier/ }).check();
  const result = page.waitForResponse(
    (r) => r.request().method() === 'POST' && new URL(r.url()).pathname === `${live.base()}/quotes`,
  );
  await quoteForm
    .getByRole('button', { name: 'Prepare new quotation version', exact: true })
    .click();
  const response = await result;
  if (response.status() !== 200) throw new Error('UI_PREPARATION_FAILED');
  const quote = (await response.json()) as QuoteResponse;
  live.track('quoteIds', quote.quote.quoteId);
  await expect(page).toHaveURL(new RegExp(`/quotes/${quote.quote.quoteId}$`));
  return { page, quote };
}

export async function managerAction(page: Page, action: 'APPROVE' | 'ISSUE' | 'REJECT' | 'EXPIRE') {
  const labels = {
    APPROVE: 'Approve',
    ISSUE: 'Issue to customer',
    REJECT: 'Reject',
    EXPIRE: 'Mark as expired',
  };
  await page.getByRole('button', { name: labels[action], exact: true }).click();
  const dialog = page.getByRole('dialog', { name: `Confirm ${labels[action]}`, exact: true });
  const response = page.waitForResponse(
    (r) => r.request().method() === 'POST' && new URL(r.url()).pathname.endsWith('/actions'),
  );
  await dialog
    .getByRole('button', { name: `Confirm ${labels[action].toLowerCase()}`, exact: true })
    .click();
  if ((await response).status() !== 200) throw new Error(`UI_${action}_FAILED`);
  await expect(dialog).toHaveCount(0);
}

export async function openCustomerQuote(live: LiveCase, quote: QuoteResponse) {
  const page = await live.openRequest('customer');
  await page.getByRole('link', { name: quote.quote.quoteNumber, exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Quotation details', exact: true })).toBeVisible();
  return page;
}

export async function customerAction(page: Page, action: 'accept' | 'reject', doubleClick = false) {
  await page
    .getByRole('button', {
      name: action === 'accept' ? 'Accept quotation' : 'Reject quotation',
      exact: true,
    })
    .click();
  const dialog = page.getByRole('dialog', { name: `Confirm ${action} quotation`, exact: true });
  await expect(dialog.getByRole('checkbox')).not.toBeChecked();
  const confirm = dialog.getByRole('button', { name: `Confirm ${action}`, exact: true });
  await expect(confirm).toBeDisabled();
  await dialog.getByRole('checkbox').check();
  const response = page.waitForResponse(
    (r) => r.request().method() === 'POST' && new URL(r.url()).pathname.endsWith('/actions'),
  );
  if (doubleClick) await confirm.dblclick();
  else await confirm.click();
  if ((await response).status() !== 200) throw new Error('UI_CUSTOMER_RESPONSE_FAILED');
}
