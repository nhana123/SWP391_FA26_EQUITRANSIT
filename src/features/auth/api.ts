import { request } from '../../shared/api/client';
import { customerSchema, loginSchema, messageSchema } from '../../shared/api/contracts';
export type Registration = {
  email: string;
  password: string;
  confirmPassword: string;
  fullName: string;
  phone: string | null;
  address: string | null;
};
export const authApi = {
  register: (body: Registration) =>
    request('/api/auth/register', messageSchema, { method: 'POST', body, public: true }),
  login: (body: { email: string; password: string }) =>
    request('/api/auth/login', loginSchema, {
      method: 'POST',
      body,
      public: true,
      withCookies: true,
    }),
  email: (action: 'forgot-password' | 'resend-verification', email: string) =>
    request(`/api/auth/${action}`, messageSchema, {
      method: 'POST',
      body: { email },
      public: true,
    }),
  verify: (token: string) =>
    request('/api/auth/verify-email', messageSchema, {
      method: 'POST',
      body: { token },
      public: true,
    }),
  reset: (body: { token: string; password: string; confirmPassword: string }) =>
    request('/api/auth/reset-password', messageSchema, { method: 'POST', body, public: true }),
  me: (signal: AbortSignal) => request('/api/customers/me', customerSchema, { signal }),
};
