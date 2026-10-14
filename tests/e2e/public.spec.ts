import { test, expect } from '@playwright/test';
test('registration accepts international email for API validation and blocks invalid phone locally', async ({
  page,
}) => {
  const bodies: unknown[] = [];
  await page.route('**/api/auth/register', async (route) => {
    bodies.push(route.request().postDataJSON());
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'Account created' }),
    });
  });
  await page.goto('/register');
  await page.getByLabel('Full name').fill('Test Customer');
  await page.getByLabel('Email address').fill('khách@example.invalid');
  await page.getByLabel('Password', { exact: true }).fill('TestPassword123!');
  await page.getByLabel('Confirm password').fill('TestPassword123!');
  await page.getByLabel('Phone number (optional)').fill('090 123 4567');
  await page.getByRole('button', { name: 'Create Account' }).click();
  await expect(page.getByText(/Use 8–15 digits/)).toBeVisible();
  expect(bodies).toHaveLength(0);
  await page.getByLabel('Phone number (optional)').fill('+84901234567');
  await page.getByRole('button', { name: 'Create Account' }).click();
  await expect(page.getByRole('heading', { name: 'Verify your email' })).toBeVisible();
  expect(bodies).toEqual([
    expect.objectContaining({
      email: 'khách@example.invalid',
      phone: '+84901234567',
      address: null,
    }),
  ]);
});
test('registration and token links work without making a false booking', async ({ page }) => {
  await page.route('**/api/auth/register', (route) =>
    route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'Account created' }),
    }),
  );
  await page.goto('/register');
  await page.getByLabel('Full name').fill('Test Customer');
  await page.getByLabel('Email address').fill('test@example.invalid');
  await page.getByLabel('Password', { exact: true }).fill('TestPassword123!');
  await page.getByLabel('Confirm password').fill('TestPassword123!');
  await page.getByRole('button', { name: 'Create Account' }).click();
  await expect(page.getByRole('heading', { name: 'Verify your email' })).toBeVisible();
  const requests: string[] = [];
  page.on('request', (r) => {
    if (r.url().includes('/api/auth/verify-email')) requests.push(r.url());
  });
  await page.route('**/api/auth/verify-email', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'Verified' }),
    }),
  );
  await page.goto('/verify-email?token=test-token');
  await expect(page).toHaveURL(/\/verify-email$/);
  expect(requests).toHaveLength(0);
  await page.getByRole('button', { name: 'Verify Email' }).click();
  await expect(page.getByText('Email verified.')).toBeVisible();
  expect(requests).toHaveLength(1);
});
test('mobile registration remains usable and protected routes require login', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/register');
  await expect(page.getByLabel('Full name')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.goto('/customer/requests/new');
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
});
