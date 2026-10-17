import {
  test,
  expect,
  randomUUID,
  quoteFrom,
  requireStatus,
  errorCode,
  assertSnapshot,
} from './fixtures';

test('F06-12 Preparation replay is identical; changing input with the same UUID conflicts', async ({
  live,
}) => {
  const command = {
    recordVersion: (await live.current()).recordVersion,
    operationId: randomUUID(),
  };
  const body = { ...live.scenario.prepare, command };
  const first = quoteFrom(await live.call('manager', 'POST', `${live.base()}/quotes`, body));
  const afterFirst = await live.observe();
  const replay = quoteFrom(await live.call('manager', 'POST', `${live.base()}/quotes`, body));
  expect(replay).toEqual(first);
  expect((await live.observe()).scheduleRows).toBe(afterFirst.scheduleRows);
  const changed = await live.call('manager', 'POST', `${live.base()}/quotes`, {
    ...body,
    terms:
      body.terms === 'Controlled changed retry'
        ? 'Another controlled retry'
        : 'Controlled changed retry',
  });
  requireStatus(changed, 409);
  expect(errorCode(changed)).toBe('QUOTE_RETRY_CONFLICT');
});

test('F06-13 Concurrent identical ACCEPT UUID returns one receipt and no extra schedule', async ({
  live,
}) => {
  const quote = await live.publish();
  const before = await live.observe();
  const command = {
    recordVersion: (await live.current()).recordVersion,
    operationId: randomUUID(),
  };
  const replies = await Promise.all([
    live.act(quote.quote.quoteId, 'ACCEPT', 'customer', command),
    live.act(quote.quote.quoteId, 'ACCEPT', 'customer', command),
  ]);
  expect(quoteFrom(replies[0])).toEqual(quoteFrom(replies[1]));
  const after = await live.observe();
  expect(after.acceptedQuotes - before.acceptedQuotes).toBe(1);
  expect(after.scheduleRows).toBe(before.scheduleRows);
  for (const key of ['moneyReceipts', 'reservations', 'departures'] as const)
    expect(after[key]).toBe(before[key]);
  const changed = await live.act(quote.quote.quoteId, 'REJECT', 'customer', command);
  requireStatus(changed, 409);
  expect(errorCode(changed)).toBe('QUOTE_RETRY_CONFLICT');
});

test('F06-14 Competing preparations with one parent version have one winner', async ({ live }) => {
  const recordVersion = (await live.current()).recordVersion;
  const replies = await Promise.all(
    [1, 2].map(() =>
      live.call('manager', 'POST', `${live.base()}/quotes`, {
        ...live.scenario.prepare,
        command: { recordVersion, operationId: randomUUID() },
      }),
    ),
  );
  expect(replies.map((r) => r.status).sort()).toEqual([200, 409]);
  expect(errorCode(replies.find((r) => r.status === 409)!)).toBe('ORDER_VERSION_CONFLICT');
  const quote = quoteFrom(replies.find((r) => r.status === 200)!);
  expect((await live.read(quote.quote.quoteId)).quote.status).toBe('DRAFT');
});

test('F06-15 Competing ACCEPT and direct revision cannot both commit', async ({ live }) => {
  const quote = await live.publish();
  const before = await live.observe();
  const recordVersion = (await live.current()).recordVersion;
  const [accept, revise] = await Promise.all([
    live.act(quote.quote.quoteId, 'ACCEPT', 'customer', {
      recordVersion,
      operationId: randomUUID(),
    }),
    live.call('customer', 'POST', `${live.base()}/revisions`, {
      ...live.scenario.revisionDraft,
      recordVersion,
      operationId: randomUUID(),
      changeReason: 'Controlled acceptance test revision',
    }),
  ]);
  expect([accept.status, revise.status].sort()).toEqual([200, 409]);
  const current = await live.current();
  const saved = await live.read(quote.quote.quoteId);
  if (accept.status === 200) {
    expect(current.currentRevisionId).toBe(quote.quote.revisionId);
    expect(saved.quote.status).toBe('ACCEPTED');
  } else {
    expect(current.currentRevisionId).not.toBe(quote.quote.revisionId);
    expect(saved.quote.status).toBe('SUPERSEDED');
  }
  const after = await live.observe();
  expect(after.acceptedQuotes - before.acceptedQuotes).toBeLessThanOrEqual(1);
  expect(after.scheduleRows).toBe(before.scheduleRows);
});

test('F06-16 Stale parent action is rejected without adopting a new version', async ({ live }) => {
  const quote = await live.prepare();
  const stale = quote.recordVersion;
  const page = await live.openRequest('manager');
  await page.getByRole('link', { name: quote.quote.quoteNumber, exact: true }).click();
  await page.getByRole('button', { name: 'Approve', exact: true }).click();
  quoteFrom(await live.act(quote.quote.quoteId, 'APPROVE'));
  const actionResponse = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname.endsWith('/actions'),
  );
  await page
    .getByRole('dialog', { name: 'Confirm Approve', exact: true })
    .getByRole('button', { name: 'Confirm approve', exact: true })
    .click();
  expect((await actionResponse).status()).toBe(409);
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Confirm Approve', exact: true })).toBeVisible();
  const reply = await live.act(quote.quote.quoteId, 'ISSUE', 'manager', {
    recordVersion: stale,
    operationId: randomUUID(),
  });
  requireStatus(reply, 409);
  expect(errorCode(reply)).toBe('ORDER_VERSION_CONFLICT');
  expect((await live.read(quote.quote.quoteId)).quote.status).toBe('APPROVED');
});

for (const [id, operation] of [
  ['F06-17', 'replacement'],
  ['F06-18', 'revision'],
  ['F06-19', 'services'],
] as const) {
  test(`${id} ${operation} supersedes unaccepted issued snapshot`, async ({ live }) => {
    const quote = await live.publish();
    if (operation === 'replacement') {
      const replacement = await live.prepare();
      expect(replacement.quote.version).toBeGreaterThan(quote.quote.version);
    } else {
      const current = await live.current();
      const body =
        operation === 'revision'
          ? {
              ...live.scenario.revisionDraft,
              recordVersion: current.recordVersion,
              operationId: randomUUID(),
              changeReason: 'Controlled test revision',
            }
          : {
              recordVersion: current.recordVersion,
              operationId: randomUUID(),
              horseRecordVersion: live.scenario.horseRecordVersion,
              services: live.scenario.services,
              changeReason: 'Controlled service confirmation',
            };
      requireStatus(
        await live.call(
          'customer',
          'POST',
          `${live.base()}/${operation === 'revision' ? 'revisions' : 'services/confirm'}`,
          body,
        ),
        200,
      );
    }
    expect((await live.read(quote.quote.quoteId)).quote.status).toBe('SUPERSEDED');
    requireStatus(
      await live.call('customer', 'GET', `${live.base()}/quotes/${quote.quote.quoteId}`),
      404,
    );
    const current = await live.current();
    const reply = await live.act(quote.quote.quoteId, 'ACCEPT', 'customer', {
      recordVersion: current.recordVersion,
      operationId: randomUUID(),
    });
    requireStatus(reply, 409);
    expect(['QUOTE_REVISION_CONFLICT', 'QUOTE_STATE_CONFLICT']).toContain(errorCode(reply));
  });
}

test('F06-20 Accepted quote protects direct revision, service rewrite and new preparation', async ({
  live,
}) => {
  const quote = await live.publish();
  quoteFrom(await live.act(quote.quote.quoteId, 'ACCEPT', 'customer'));
  const current = await live.current();
  const revision = await live.call('customer', 'POST', `${live.base()}/revisions`, {
    ...live.scenario.revisionDraft,
    recordVersion: current.recordVersion,
    operationId: randomUUID(),
    changeReason: 'Controlled protected revision',
  });
  requireStatus(revision, 409);
  const services = await live.call('customer', 'POST', `${live.base()}/services/confirm`, {
    recordVersion: current.recordVersion,
    operationId: randomUUID(),
    horseRecordVersion: live.scenario.horseRecordVersion,
    services: live.scenario.services,
    changeReason: 'Controlled protected service change',
  });
  requireStatus(services, 409);
  const prepare = await live.call('manager', 'POST', `${live.base()}/quotes`, {
    ...live.scenario.prepare,
    command: { recordVersion: current.recordVersion, operationId: randomUUID() },
  });
  requireStatus(prepare, 409);
  expect((await live.current()).currentRevisionId).toBe(current.currentRevisionId);
  expect((await live.read(quote.quote.quoteId)).quote.status).toBe('ACCEPTED');
});

for (const [id, accepted] of [
  ['F06-21', false],
  ['F06-22', true],
] as const) {
  test(`${id} Catalog replacement cannot rewrite ${accepted ? 'accepted' : 'issued'} snapshot`, async ({
    live,
  }) => {
    if (!live.readiness.inspection.migrations.includes(6))
      throw new Error('CATALOG_TEST_REQUIRES_APPROVED_MIGRATION_006');
    const tariff = live.scenario.tariff;
    if (!tariff) throw new Error('SHARED_CATALOG_FIXTURE_REQUIRED');
    let quote = await live.publish();
    if (accepted) quote = quoteFrom(await live.act(quote.quote.quoteId, 'ACCEPT', 'customer'));
    const path = `/api/manager/service-tariffs/${tariff.id}`;
    const read = await live.call('manager', 'GET', path);
    requireStatus(read, 200);
    const row = read.data as { recordVersion: string };
    requireStatus(
      await live.call('manager', 'PUT', path, {
        ...tariff.replacement,
        recordVersion: row.recordVersion,
        operationId: randomUUID(),
      }),
      200,
    );
    const after = await live.read(quote.quote.quoteId, 'customer');
    expect(after.items).toEqual(quote.items);
    expect(after.paymentSchedule).toEqual(quote.paymentSchedule);
    expect(after.quote.total).toBe(quote.quote.total);
    expect(after.terms).toBe(quote.terms);
    assertSnapshot(after, live.scenario);
  });
}
