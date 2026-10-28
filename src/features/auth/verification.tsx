import { useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { authApi } from './api';
import { ApiError } from '../../shared/api/client';
import { useAction } from '../../shared/lib/useAction';
import { clearCapturedToken, getCapturedToken } from '../../shared/lib/token';
import { ErrorNotice, Field, Notice } from '../../shared/ui/common';

const cooldownKey = 'equitransit.verification.cooldown';
function savedDeadline() {
  try {
    return Number(sessionStorage.getItem(cooldownKey)) || 0;
  } catch {
    return 0;
  }
}
export function EmailVerification() {
  const location = useLocation();
  const state = location.state as { email?: string; sent?: boolean } | null;
  const [email, setEmail] = useState(state?.email || '');
  const [token, setToken] = useState(() => getCapturedToken('/verify-email'));
  const [verified, setVerified] = useState(false);
  const [sent, setSent] = useState(!!state?.sent);
  const [deadline, setDeadline] = useState(() =>
    Math.max(savedDeadline(), state?.sent ? Date.now() + 60000 : 0),
  );
  const [now, setNow] = useState(Date.now);
  const action = useAction();
  const seconds = Math.max(0, Math.ceil((deadline - now) / 1000));
  useEffect(() => {
    try {
      sessionStorage.setItem(cooldownKey, String(deadline));
    } catch {
      /* Storage may be disabled. */
    }
    if (deadline <= Date.now()) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [deadline]);
  function handleRateLimit(error: unknown) {
    if (error instanceof ApiError && error.status === 429) {
      setDeadline(Date.now() + (error.retryAfterSeconds || 60) * 1000);
    }
    throw error;
  }
  function verify(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    void action.run(async () => {
      try {
        await authApi.verify(token);
        clearCapturedToken();
        setToken(null);
        setVerified(true);
      } catch (error) {
        handleRateLimit(error);
      }
    });
  }
  function resend(e: FormEvent) {
    e.preventDefault();
    if (seconds || action.pending) return;
    void action.run(async () => {
      try {
        await authApi.email('resend-verification', email.trim());
        clearCapturedToken();
        setToken(null);
        setSent(true);
        setNow(Date.now());
        setDeadline(Date.now() + 60000);
      } catch (error) {
        handleRateLimit(error);
      }
    });
  }
  const emailControl = (
    <Field label="Email address">
      {(id) => (
        <input
          id={id}
          type="text"
          inputMode="email"
          autoComplete="email"
          required
          maxLength={255}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      )}
    </Field>
  );
  return (
    <section className="auth-card">
      <div className="auth-title">
        <h1>Verify your email</h1>
        <Link to="/login" className="auth-action-link">
          Back to Login
        </Link>
      </div>
      <p>Confirm your email to activate your account.</p>
      {verified ? (
        <Notice>
          Email verified. You can now <Link to="/login">sign in</Link>.
        </Notice>
      ) : (
        <>
          {action.error instanceof ApiError && action.error.code === 'AUTH_CHALLENGE_INVALID' ? (
            <div className="notice error" role="alert">
              This link is invalid, expired or already used. Request a new verification email.
            </div>
          ) : (
            <ErrorNotice error={action.error} />
          )}
          {sent && (
            <Notice>
              If your account is eligible, a verification email has been requested. Check Inbox and
              Spam. Delivery may take a moment.
            </Notice>
          )}
          {token ? (
            <form onSubmit={verify}>
              <button className="primary wide" disabled={action.pending}>
                {action.pending ? 'Verifying…' : 'Verify now'}
              </button>
            </form>
          ) : (
            <p>
              Open your email and click <strong>VERIFY NOW</strong>. The link is valid for 24 hours.
            </p>
          )}
          {(!token || !!action.error) && (
            <form onSubmit={resend}>
              {emailControl}
              <p className="muted">
                Didn't receive it, or has it expired? Request another email for this account.
              </p>
              <button type="submit" disabled={action.pending || seconds > 0 || !email.trim()}>
                {seconds > 0 ? `Resend link in ${seconds}s` : 'Resend verification email'}
              </button>
            </form>
          )}
        </>
      )}
    </section>
  );
}
