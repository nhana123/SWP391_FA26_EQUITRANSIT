import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '../../../shared/api/query';
import { startSession } from '../../../shared/api/session';
import type { Role } from '../../../shared/api/contracts';
import { resourcesApi } from '../../resources/api';
import { catalogs } from '../../resources/contracts';
import { SupplierPicker } from './SupplierPicker';

vi.mock('../../resources/api', () => ({ resourcesApi: { list: vi.fn() } }));
const supplier = (id: number, name: string, active = true) =>
  catalogs.suppliers.view.parse({
    id,
    recordVersion: '0000000000000001',
    data: { name, active, services: ['Air transport'] },
  });
beforeEach(() => {
  vi.clearAllMocks();
  queryClient.clear();
  vi.mocked(resourcesApi.list).mockResolvedValue({
    items: [supplier(21, 'Green Air'), supplier(22, 'Retired Partner', false)],
    page: 0,
    size: 20,
    totalElements: 22,
  });
});
function mount(role: Role, disabled = false) {
  startSession({ accessToken: 'unit-test', tokenType: 'Bearer', expiresIn: 60, role });
  function Harness() {
    const [value, setValue] = useState<number | null>(null);
    return (
      <>
        <SupplierPicker
          label="Hãng vận chuyển"
          value={value}
          onChange={setValue}
          disabled={disabled}
        />
        <output aria-label="Selected ID">{value ?? 'none'}</output>
      </>
    );
  }
  render(
    <QueryClientProvider client={queryClient}>
      <Harness />
    </QueryClientProvider>,
  );
  return userEvent.setup({ delay: null });
}
describe('Studio supplier picker', () => {
  it('shows real names and IDs, disables inactive choices and preserves selection across bounded pages', async () => {
    const user = mount('MANAGER');
    await screen.findByRole('option', { name: 'Green Air · #21' });
    expect(screen.getByRole('option', { name: /Retired Partner/ })).toBeDisabled();
    await user.selectOptions(screen.getByLabelText('Hãng vận chuyển'), '21');
    expect(screen.getByLabelText('Selected ID')).toHaveTextContent('21');
    vi.mocked(resourcesApi.list).mockResolvedValue({
      items: [supplier(23, 'Next Carrier')],
      page: 1,
      size: 20,
      totalElements: 22,
    });
    await user.click(screen.getByRole('button', { name: 'Sau' }));
    await screen.findByRole('option', { name: 'Next Carrier · #23' });
    expect(resourcesApi.list).toHaveBeenLastCalledWith('suppliers', 1, expect.anything());
    expect(screen.getByLabelText('Hãng vận chuyển')).toHaveValue('21');
    expect(screen.getByLabelText('Selected ID')).toHaveTextContent('21');
  });
  it('lets the Coordinator choose a carrier by name from the catalogue', async () => {
    const user = mount('COORDINATOR');
    await screen.findByRole('option', { name: 'Green Air · #21' });
    await user.selectOptions(screen.getByLabelText('Hãng vận chuyển'), '21');
    expect(screen.getByLabelText('Selected ID')).toHaveTextContent('21');
    expect(screen.queryByText(/chỉ dành cho Manager/)).toBeNull();
    expect(resourcesApi.list).toHaveBeenCalledWith('suppliers', 0, expect.anything());
  });

  it('keeps typing an ID for roles without the catalogue', async () => {
    const user = mount('SPECIALIST');
    await user.type(screen.getByRole('textbox', { name: 'Hãng vận chuyển · ID' }), '31');
    expect(screen.getByLabelText('Selected ID')).toHaveTextContent('31');
    expect(resourcesApi.list).not.toHaveBeenCalled();
  });
  it('keeps ID fallback available when the catalogue fails and rejects unsafe IDs', async () => {
    vi.mocked(resourcesApi.list).mockRejectedValue(new Error('Unavailable'));
    const user = mount('MANAGER');
    await screen.findByText('Chưa tải được danh mục.');
    await user.click(screen.getByRole('button', { name: 'Dùng ID nếu chưa có trong danh mục' }));
    const input = screen.getByRole('textbox', { name: 'Hãng vận chuyển · ID' });
    await user.type(input, '43');
    expect(screen.getByLabelText('Selected ID')).toHaveTextContent('43');
    await user.clear(input);
    await user.type(input, '-2');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Selected ID')).toHaveTextContent('none');
  });
  it('does not fetch or enable edits for a saved draft', async () => {
    mount('MANAGER', true);
    expect(screen.getByLabelText('Hãng vận chuyển')).toBeDisabled();
    await waitFor(() => expect(resourcesApi.list).not.toHaveBeenCalled());
  });
});
