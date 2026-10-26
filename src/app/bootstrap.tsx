import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router-dom';
import { queryClient } from '../shared/api/query';
import { restoreSession } from '../shared/api/refresh';
import { router } from './router';
import './styles.css';
import './heritage.css';
import './forms.css';
import '../features/booking-services/pricing.css';
import '../features/landing/landing.css';
export async function mount() {
  // A reload keeps a signed-in tab signed in: the access token is renewed from
  // the HttpOnly refresh cookie before any route decides to send the user to login.
  await restoreSession();
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </StrictMode>,
  );
}
