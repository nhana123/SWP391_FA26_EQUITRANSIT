import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { QuotationDetail } from './pages';
import { quotation } from './testing';

afterEach(() => vi.useRealTimers());
describe('quotation validity clock', () => {
  it('marks an ISSUED quote expired at its deadline without a server status mutation', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2030-02-01T11:59:59Z'));
    render(<QuotationDetail quotation={quotation} />);
    expect(screen.getByText('Issued')).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(1002);
    });
    expect(screen.getByText('Issued — expired')).toBeInTheDocument();
    expect(quotation.quote.status).toBe('ISSUED');
  });
});
