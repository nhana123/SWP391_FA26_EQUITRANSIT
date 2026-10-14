import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import { clearSession } from '../shared/api/session';
afterEach(() => {
  cleanup();
  clearSession();
});
