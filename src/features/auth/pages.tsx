import { useState, type FormEvent, type ReactNode } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { authApi } from './api';
import { clearSession, startSession, useSession } from '../../shared/api/session';
import { queryKeys } from '../../shared/api/query';
import { ErrorNotice, Field, Loading, Notice, PageHeading } from '../../shared/ui/common';
import { PhoneInput } from '../../shared/ui/PhoneInput';
import {
  optional,
  passwordErrors,
  safeReturnTo,
  type FieldErrors,
} from '../../shared/lib/validation';
import { getCapturedToken, clearCapturedToken } from '../../shared/lib/token';
import { useAction } from '../../shared/lib/useAction';
import { apiPatterns } from '../../shared/api/patterns';

function AuthCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <section className="auth-card">
      <div className="auth-title">
        <h1>{title}</h1>
        <Link to="/login">Back to Login</Link>
      </div>
      <p>{subtitle}</p>
      {children}
    </section>
  );
}
function EmailField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  // Native type=email can reject international addresses accepted by BE @Email.
  // Keep the email keyboard/autofill; the backend owns email grammar validation.
  return (
    <Field label="Email address">
      {(id) => (
        <input
          id={id}
          type="text"
          inputMode="email"
          autoComplete="email"
          required
          maxLength={255}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </Field>
  );
}
function PasswordFields({
  password,
  confirm,
  setPassword,
  setConfirm,
  errors,
}: {
  password: string;
  confirm: string;
  setPassword: (v: string) => void;
  setConfirm: (v: string) => void;
  errors: FieldErrors;
}) {
  return (
    <>
      <Field
        label="Password"
        error={errors.password}
        hint="12–72 characters, at most 72 UTF-8 bytes."
      >
        {(id) => (
          <input
            id={id}
            type="password"
            autoComplete="new-password"
            required
            minLength={12}
            maxLength={72}
            value={password}
            aria-invalid={!!errors.password}
            aria-describedby={errors.password ? `${id}-error` : undefined}
            onChange={(e) => setPassword(e.target.value)}
          />
        )}
      </Field>
      <Field label="Confirm password" error={errors.confirmPassword}>
        {(id) => (
          <input
            id={id}
            type="password"
            autoComplete="new-password"
            required
            maxLength={72}
            value={confirm}
            aria-invalid={!!errors.confirmPassword}
            aria-describedby={errors.confirmPassword ? `${id}-error` : undefined}
            onChange={(e) => setConfirm(e.target.value)}
          />
        )}
      </Field>
    </>
  );
}
export function RegisterPage() {
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const action = useAction();
  const navigate = useNavigate();
  function submit(e: FormEvent) {
    e.preventDefault();
    const validation = passwordErrors(password, confirm);
    if (!fullName.trim()) validation.fullName = 'Enter your full name.';
    const suppliedPhone = optional(phone);
    if (suppliedPhone && !apiPatterns.phone.test(suppliedPhone))
      validation.phone =
        'Use 8–15 digits, optionally starting with +. The first digit must not be zero.';
    setErrors(validation);
    if (Object.keys(validation).length) return;
    void action.run(async () => {
      await authApi.register({
        email: email.trim(),
        fullName: fullName.trim(),
        phone: suppliedPhone,
        address: optional(address),
        password,
        confirmPassword: confirm,
      });
      setPassword('');
      setConfirm('');
      navigate('/verification-sent', { replace: true });
    });
  }
  return (
    <AuthCard title="Sign Up" subtitle="Create your personal Customer account.">
      <form onSubmit={submit}>
        <ErrorNotice error={action.error} />
        <div className="form-grid">
          <Field label="Full name" error={errors.fullName}>
            {(id) => (
              <input
                id={id}
                required
                maxLength={150}
                autoComplete="name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
              />
            )}
          </Field>
          <EmailField value={email} onChange={setEmail} />
          <Field
            label="Phone number (optional)"
            error={errors.phone}
            hint="Choose the country code, then the number. Leave blank if unknown."
          >
            {(id) => (
              <PhoneInput
                id={id}
                maxLength={30}
                value={phone}
                invalid={!!errors.phone}
                describedBy={errors.phone ? `${id}-error` : undefined}
                onChange={setPhone}
              />
            )}
          </Field>
          <Field label="Address (optional)">
            {(id) => (
              <input
                id={id}
                maxLength={500}
                autoComplete="street-address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />
            )}
          </Field>
          <PasswordFields
            password={password}
            confirm={confirm}
            setPassword={setPassword}
            setConfirm={setConfirm}
            errors={errors}
          />
        </div>
        <button className="primary wide" disabled={action.pending}>
          {action.pending ? 'Creating account…' : 'Create Account'}
        </button>
        <p className="center muted">
          Customer accounts only. Staff access is assigned by the company.
        </p>
      </form>
    </AuthCard>
  );
}
export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const action = useAction();
  const location = useLocation();
  const navigate = useNavigate();
  function submit(e: FormEvent) {
    e.preventDefault();
    void action.run(async () => {
      const response = await authApi.login({ email: email.trim(), password });
      startSession(response);
      setPassword('');
      navigate(
        response.role === 'CUSTOMER'
          ? safeReturnTo(new URLSearchParams(location.search).get('returnTo'))
          : '/staff',
        { replace: true },
      );
    });
  }
  return (
    <div className="login-layout">
      <div className="login-intro">
        <small className="eyebrow">WELCOME TO EQUITRANSIT</small>
        <h1>
          Every journey starts
          <br />
          with thoughtful care.
        </h1>
        <p>One place for your horses and transport requests.</p>
      </div>
      <AuthCard title="Welcome back" subtitle="Sign in to your EquiTransit account.">
        <form onSubmit={submit}>
          <ErrorNotice error={action.error} />
          <EmailField value={email} onChange={setEmail} />
          <Field label="Password">
            {(id) => (
              <input
                id={id}
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            )}
          </Field>
          <button className="primary wide" disabled={action.pending}>
            {action.pending ? 'Signing in…' : 'Log In'}
          </button>
        </form>
        <div className="actions">
          <Link to="/forgot-password">Forgot password?</Link>
          <Link to="/register">Create account</Link>
        </div>
        <p className="muted">Staff use the same login. Permissions determine access.</p>
      </AuthCard>
    </div>
  );
}
export function EmailRequestPage({
  action: emailAction = 'forgot-password',
}: {
  action?: 'forgot-password' | 'resend-verification';
}) {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const action = useAction();
  function submit(e: FormEvent) {
    e.preventDefault();
    void action.run(async () => {
      await authApi.email(emailAction, email.trim());
      setSent(true);
    });
  }
  return (
    <AuthCard
      title={emailAction === 'forgot-password' ? 'Forgot Password' : 'Resend Verification'}
      subtitle="Enter your email to request a new link."
    >
      {sent && (
        <Notice>
          If an eligible account exists, an email will be sent. Check your email or the development
          outbox.
        </Notice>
      )}
      <form onSubmit={submit}>
        <ErrorNotice error={action.error} />
        <EmailField value={email} onChange={setEmail} />
        <button className="primary wide" disabled={action.pending}>
          {action.pending ? 'Requesting…' : 'Request Email Link'}
        </button>
      </form>
    </AuthCard>
  );
}
export function VerificationSentPage() {
  return (
    <AuthCard
      title="Verify your email"
      subtitle="Your account was created. Verify your email before signing in."
    >
      <Notice>
        Follow the verification link in your email. In backend local mode, email is written to the
        development outbox.
      </Notice>
      <Link className="button" to="/resend-verification">
        Request a new verification link
      </Link>
    </AuthCard>
  );
}
export function VerifyPage() {
  const [token, setToken] = useState(() => getCapturedToken('/verify-email'));
  const [verified, setVerified] = useState(false);
  const action = useAction();
  return (
    <AuthCard title="Email Verification" subtitle="Confirm your email using the link you received.">
      <ErrorNotice error={action.error} />
      {verified ? (
        <Notice>
          Email verified. You can now <Link to="/login">sign in</Link>.
        </Notice>
      ) : token ? (
        <button
          className="primary"
          disabled={action.pending}
          onClick={() =>
            void action.run(async () => {
              await authApi.verify(token);
              clearCapturedToken();
              setToken(null);
              setVerified(true);
            })
          }
        >
          {action.pending ? 'Verifying…' : 'Verify Email'}
        </button>
      ) : (
        <Notice>No verification token is available. Request a new link.</Notice>
      )}
      <p>
        <Link to="/resend-verification">Request a new link</Link>
      </p>
    </AuthCard>
  );
}
export function ResetPage() {
  const [token, setToken] = useState(() => getCapturedToken('/reset-password'));
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [done, setDone] = useState(false);
  const action = useAction();
  function submit(e: FormEvent) {
    e.preventDefault();
    const validation = passwordErrors(password, confirm);
    setErrors(validation);
    if (!token || Object.keys(validation).length) return;
    void action.run(async () => {
      await authApi.reset({ token, password, confirmPassword: confirm });
      clearSession();
      clearCapturedToken();
      setToken(null);
      setPassword('');
      setConfirm('');
      setDone(true);
    });
  }
  return (
    <AuthCard title="Reset Password" subtitle="Choose a new password for your account.">
      {done ? (
        <Notice>
          Password reset. <Link to="/login">Sign in with your new password.</Link>
        </Notice>
      ) : !token ? (
        <Notice>
          No reset token is available. <Link to="/forgot-password">Request a new link.</Link>
        </Notice>
      ) : (
        <form onSubmit={submit}>
          <ErrorNotice error={action.error} />
          <PasswordFields
            password={password}
            confirm={confirm}
            setPassword={setPassword}
            setConfirm={setConfirm}
            errors={errors}
          />
          <button className="primary wide" disabled={action.pending}>
            {action.pending ? 'Resetting…' : 'Reset Password'}
          </button>
        </form>
      )}
    </AuthCard>
  );
}
export function AccountPage() {
  const session = useSession();
  const query = useQuery({
    queryKey: [...queryKeys.session(session!.generation), 'account'],
    queryFn: ({ signal }) => authApi.me(signal),
  });
  return (
    <>
      <PageHeading title="My Account" description="Your personal contact information." />
      {query.isPending ? (
        <Loading />
      ) : query.error ? (
        <ErrorNotice error={query.error}>
          <button onClick={() => void query.refetch()}>Try again</button>
        </ErrorNotice>
      ) : (
        <section className="card">
          <h2>Account details</h2>
          <dl className="details">
            {[
              ['Full name', query.data.fullName],
              ['Email', query.data.email],
              ['Phone', query.data.phone],
              ['Address', query.data.address],
            ].map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value || 'Not recorded'}</dd>
              </div>
            ))}
          </dl>
          <p className="muted">Contact information is read-only in this release.</p>
        </section>
      )}
    </>
  );
}
