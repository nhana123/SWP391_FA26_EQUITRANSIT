import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import { clearSession } from '../shared/api/session';

// Unit tests never reach a real server. Without this, a backend running on
// the developer's machine answers unmocked requests (e.g. 401 for the test
// token), which clears the session and makes results depend on the machine.
// Tests that need fetch stub it with vi.stubGlobal, which restores this one.
globalThis.fetch = () => Promise.reject(new TypeError('Network is disabled in unit tests.'));

afterEach(() => {
  cleanup();
  clearSession();
});
