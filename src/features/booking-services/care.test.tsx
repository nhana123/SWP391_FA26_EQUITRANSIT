import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { BookingServices } from './BookingServices';
import { bookingApi } from './api';
import type { Disclosure } from './contracts';
import { testDisclosure, testOrder } from './testing';
import { queryClient } from '../../shared/api/query';
import { startSession } from '../../shared/api/session';

vi.mock('./api', () => ({
  bookingApi: { get: vi.fn(), confirm: vi.fn(), preview: vi.fn(() => new Promise(() => {})) },
}));
vi.mock('./rates-api', () => ({ ratesApi: { get: vi.fn().mockResolvedValue([]) } }));

beforeEach(() => {
  vi.clearAllMocks();
  queryClient.clear();
  startSession({ accessToken: 'test-only', tokenType: 'Bearer', expiresIn: 60, role: 'CUSTOMER' });
});
async function open(section: string, disclosure: Disclosure = testDisclosure()) {
  vi.mocked(bookingApi.get).mockResolvedValue(disclosure);
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <BookingServices order={testOrder()} preferences={null} onSaved={vi.fn()} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: section }));
  return user;
}

describe('horse care (FE-22)', () => {
  it('states basic care is included and only accepts whole non-negative counts', async () => {
    const user = await open('Horse Care');
    expect(screen.getByRole('note')).toHaveTextContent('included and is not charged again');
    const grooming = screen.getByLabelText('Grooming days');
    await user.type(grooming, '-2.5');
    expect(grooming).toHaveValue('25');
    await user.clear(grooming);
    expect(grooming).toHaveValue('');
    expect(screen.getByLabelText('Extra boarding nights')).toBeInTheDocument();
    expect(screen.getByText(/quarantine days are counted separately/)).toBeInTheDocument();
  });
});

describe('veterinary (FE-22)', () => {
  it('lets the customer choose an arrangement without reducing required checks', async () => {
    const user = await open('Veterinary');
    expect(screen.getByText(/does not reduce them/)).toBeInTheDocument();
    await user.click(screen.getByLabelText('I will arrange my own veterinarian'));
    expect(screen.getByLabelText('Provider name')).toBeInTheDocument();
  });
});

describe('quarantine (FE-22)', () => {
  it('shows required days read-only from assessment', async () => {
    await open(
      'Quarantine Packages',
      testDisclosure({
        quarantine: { applicability: 'REQUIRED', requiredDays: 14, assessmentId: 3 },
      }),
    );
    expect(screen.getByRole('note')).toHaveTextContent('Required days: 14');
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('spinbutton')).toBeNull();
  });

  it('treats UNKNOWN as pending, not an exemption', async () => {
    await open('Quarantine Packages');
    expect(screen.getByRole('note')).toHaveTextContent('not an exemption');
    expect(screen.getByLabelText('Standard package')).toBeInTheDocument();
  });

  it('offers no active package when not required and flags a stale one', async () => {
    const user = await open(
      'Quarantine Packages',
      testDisclosure({
        selected: { quarantinePackage: 'STANDARD' },
        quarantine: { applicability: 'NOT_REQUIRED', requiredDays: null, assessmentId: 3 },
      }),
    );
    expect(screen.queryByLabelText('Standard package')).toBeNull();
    expect(screen.getByText(/not required, so no package can be requested/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Remove package' }));
    expect(screen.queryByText(/so no package can be requested/)).toBeNull();
  });
});
