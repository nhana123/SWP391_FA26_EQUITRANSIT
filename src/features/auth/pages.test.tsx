import { StrictMode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { VerifyPage, RegisterPage } from './pages';
import { authApi } from './api';
import { captureTokenLink } from '../../shared/lib/token';
import { getSession } from '../../shared/api/session';
vi.mock('./api', () => ({ authApi: { verify: vi.fn(), register: vi.fn() } }));
beforeEach(() => vi.clearAllMocks());

async function fillRegistration(email = 'test@example.invalid') {
  const user = userEvent.setup({ delay: null });
  await user.type(screen.getByLabelText('Full name'), 'Test Customer');
  await user.type(screen.getByLabelText('Email address'), email);
  await user.type(screen.getByLabelText('Password'), 'TestPassword123!');
  await user.type(screen.getByLabelText('Confirm password'), 'TestPassword123!');
  return user;
}
describe('account flows', () => {
  it('passes international email to backend validation without an ASCII-only browser gate', async () => {
    vi.mocked(authApi.register).mockResolvedValue({ message: 'created' });
    render(
      <MemoryRouter>
        <RegisterPage />
      </MemoryRouter>,
    );
    const user = await fillRegistration('khách@example.invalid');
    expect(screen.getByLabelText('Email address')).toHaveAttribute('inputmode', 'email');
    await user.click(screen.getByRole('button', { name: 'Create Account' }));
    expect(authApi.register).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'khách@example.invalid' }),
    );
  });
  it('retains the form and rejects invalid optional phone before dispatching registration', async () => {
    render(
      <MemoryRouter>
        <RegisterPage />
      </MemoryRouter>,
    );
    const user = await fillRegistration();
    await user.type(screen.getByLabelText('Phone number (optional)'), '090 123 4567');
    await user.click(screen.getByRole('button', { name: 'Create Account' }));
    expect(authApi.register).not.toHaveBeenCalled();
    expect(await screen.findByText(/Use 8–15 digits/)).toBeInTheDocument();
    expect(screen.getByLabelText('Phone number (optional)')).toHaveValue('090 123 4567');
    expect(screen.getByLabelText('Phone number (optional)')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
  });
  it('sends a valid optional phone and null for a whitespace-only optional address', async () => {
    vi.mocked(authApi.register).mockResolvedValue({ message: 'created' });
    render(
      <MemoryRouter>
        <RegisterPage />
      </MemoryRouter>,
    );
    const user = await fillRegistration();
    await user.type(screen.getByLabelText('Phone number (optional)'), '+84901234567');
    await user.type(screen.getByLabelText('Address (optional)'), '   ');
    await user.click(screen.getByRole('button', { name: 'Create Account' }));
    expect(authApi.register).toHaveBeenCalledWith(
      expect.objectContaining({ phone: '+84901234567', address: null }),
    );
  });
  it('never consumes verification token from an effect or StrictMode mount', async () => {
    history.replaceState(null, '', '/verify-email?token=test-token');
    captureTokenLink();
    vi.mocked(authApi.verify).mockResolvedValue({ message: 'verified' });
    render(
      <StrictMode>
        <MemoryRouter>
          <VerifyPage />
        </MemoryRouter>
      </StrictMode>,
    );
    expect(authApi.verify).not.toHaveBeenCalled();
    expect(location.search).not.toContain('token');
    await userEvent.click(screen.getByRole('button', { name: 'Verify Email' }));
    expect(authApi.verify).toHaveBeenCalledTimes(1);
    expect(getSession()).toBeNull();
  });
  it('registers an individual without a role or organization and never auto logs in', async () => {
    vi.mocked(authApi.register).mockResolvedValue({ message: 'created' });
    render(
      <MemoryRouter>
        <RegisterPage />
      </MemoryRouter>,
    );
    const user = userEvent.setup({ delay: null });
    await user.type(screen.getByLabelText('Full name'), 'Test Customer');
    await user.type(screen.getByLabelText('Email address'), 'test@example.invalid');
    await user.type(screen.getByLabelText('Password'), 'TestPassword123!');
    await user.type(screen.getByLabelText('Confirm password'), 'TestPassword123!');
    await user.click(screen.getByRole('button', { name: 'Create Account' }));
    expect(authApi.register).toHaveBeenCalledWith({
      fullName: 'Test Customer',
      email: 'test@example.invalid',
      password: 'TestPassword123!',
      confirmPassword: 'TestPassword123!',
      phone: null,
      address: null,
    });
    expect(getSession()).toBeNull();
  });
});
