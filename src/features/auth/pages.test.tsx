import { StrictMode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { VerifyPage, RegisterPage, LoginPage } from './pages';
import { authApi } from './api';
import { ApiError } from '../../shared/api/client';
import { captureTokenLink, clearCapturedToken } from '../../shared/lib/token';
import { getSession } from '../../shared/api/session';
vi.mock('./api', () => ({
  authApi: { verify: vi.fn(), register: vi.fn(), email: vi.fn(), login: vi.fn() },
}));
beforeEach(() => {
  vi.clearAllMocks();
  clearCapturedToken();
  sessionStorage.clear();
});

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
    await user.type(screen.getByLabelText('Phone number (optional)'), '12');
    await user.click(screen.getByRole('button', { name: 'Create Account' }));
    expect(authApi.register).not.toHaveBeenCalled();
    expect(await screen.findByText(/Use 8–15 digits/)).toBeInTheDocument();
    expect(screen.getByLabelText('Phone number (optional)')).toHaveValue('12');
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
    await userEvent.click(screen.getByRole('button', { name: 'Verify now' }));
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

describe('verification recovery entry points', () => {
  it.each(['login', 'register'])(
    'offers resend for unverified %s and carries email to the form',
    async (mode) => {
      const failure = new ApiError(
        mode === 'login' ? 401 : 409,
        'Rejected',
        'EMAIL_VERIFICATION_REQUIRED',
      );
      vi.mocked(authApi.login).mockRejectedValue(failure);
      vi.mocked(authApi.register).mockRejectedValue(failure);
      render(
        <MemoryRouter initialEntries={['/start']}>
          <Routes>
            <Route path="/start" element={mode === 'login' ? <LoginPage /> : <RegisterPage />} />
            <Route path="/resend-verification" element={<VerifyPage />} />
          </Routes>
        </MemoryRouter>,
      );
      const user = mode === 'register' ? await fillRegistration() : userEvent.setup();
      if (mode === 'login') {
        await user.type(screen.getByLabelText('Email address'), 'test@example.invalid');
        await user.type(screen.getByLabelText('Password'), 'TestPassword123!');
      }
      await user.click(
        screen.getByRole('button', { name: mode === 'login' ? 'Log In' : 'Create Account' }),
      );
      expect(await screen.findByText(/Your account is not activated yet/)).toBeInTheDocument();
      await user.click(screen.getByRole('link', { name: 'Resend verification email' }));
      expect(screen.getByLabelText('Email address')).toHaveValue('test@example.invalid');
      expect(authApi.email).not.toHaveBeenCalled();
    },
  );
  it('sends email only on click and keeps a resend cooldown after remount', async () => {
    vi.mocked(authApi.email).mockResolvedValue({ message: 'requested' });
    const view = render(
      <MemoryRouter>
        <VerifyPage />
      </MemoryRouter>,
    );
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Email address'), 'test@example.invalid');
    await user.click(screen.getByRole('button', { name: 'Resend verification email' }));
    expect(authApi.email).toHaveBeenCalledWith('resend-verification', 'test@example.invalid');
    expect(await screen.findByRole('button', { name: /Resend link in/ })).toBeDisabled();
    view.unmount();
    render(
      <MemoryRouter>
        <VerifyPage />
      </MemoryRouter>,
    );
    expect(screen.getByRole('button', { name: /Resend link in/ })).toBeDisabled();
    expect(authApi.email).toHaveBeenCalledTimes(1);
  });
  it('has no OTP field or verification action without an emailed link', () => {
    render(
      <MemoryRouter>
        <VerifyPage />
      </MemoryRouter>,
    );
    expect(screen.queryByLabelText('Verification code')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Verify now' })).not.toBeInTheDocument();
    expect(authApi.verify).not.toHaveBeenCalled();
  });
  it('keeps resend available after expired link and respects server throttling', async () => {
    vi.mocked(authApi.verify).mockRejectedValue(
      new ApiError(400, 'Rejected', 'AUTH_CHALLENGE_INVALID'),
    );
    vi.mocked(authApi.email).mockRejectedValue(
      new ApiError(429, 'Too many requests', 'AUTH_RATE_LIMITED', {}, 120),
    );
    history.replaceState(null, '', '/verify-email?token=expired-link');
    captureTokenLink();
    render(
      <MemoryRouter>
        <VerifyPage />
      </MemoryRouter>,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Verify now' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/expired/);
    await user.type(screen.getByLabelText('Email address'), 'test@example.invalid');
    await user.click(screen.getByRole('button', { name: 'Resend verification email' }));
    expect(
      await screen.findByRole('button', { name: /Resend link in 1[12][0-9]s/ }),
    ).toBeDisabled();
  });
});

it('shows only one friendly line for rejected login credentials', async () => {
  vi.mocked(authApi.login).mockRejectedValue(
    new ApiError(401, 'Sign-in failed or your session has expired.', 'LOGIN_FAILED'),
  );
  render(
    <MemoryRouter>
      <LoginPage />
    </MemoryRouter>,
  );
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Email address'), 'test@example.invalid');
  await user.type(screen.getByLabelText('Password'), 'IncorrectPassword');
  await user.click(screen.getByRole('button', { name: 'Log In' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(/^Sai mật khẩu, vui lòng nhập lại\.$/);
  expect(screen.getAllByRole('alert')).toHaveLength(1);
  expect(screen.queryByText('LOGIN_FAILED')).not.toBeInTheDocument();
  expect(screen.queryByText(/your session has expired/)).not.toBeInTheDocument();
});
