import { useId, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSession } from '../../../shared/api/session';
import { queryKeys } from '../../../shared/api/query';
import { resourcesApi } from '../../resources/api';

/** Reuses the existing Manager catalogue; never calls it for another role. */
export function SupplierPicker({
  label,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  disabled?: boolean;
}) {
  const id = useId();
  const session = useSession();
  const manager = session?.role === 'MANAGER';
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [manual, setManual] = useState(false);
  const [draft, setDraft] = useState(value?.toString() ?? '');
  const [seenValue, setSeenValue] = useState(value);
  if (value !== seenValue) {
    setSeenValue(value);
    setDraft(value?.toString() ?? '');
  }
  const query = useQuery({
    queryKey: [...queryKeys.session(session?.generation ?? ''), 'studio-suppliers', page],
    queryFn: ({ signal }) => resourcesApi.list('suppliers', page, signal),
    enabled: manager && !disabled,
    staleTime: 30_000,
    retry: false,
  });
  const items = query.data?.items ?? [];
  const selected = items.find((item) => item.id === value);
  const options = items.filter(
    (item) =>
      item.data.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()) ||
      String(item.id).includes(search.trim()),
  );
  const fallbackMode = !manager || manual;
  const invalid =
    draft !== '' &&
    (!/^\d+$/.test(draft) || !Number.isSafeInteger(Number(draft)) || Number(draft) <= 0);
  return (
    <div className="js-supplier-picker">
      <label className="js-field" htmlFor={id}>
        {label}
      </label>
      {fallbackMode ? (
        <>
          <input
            id={id}
            aria-label={`${label} · ID`}
            inputMode="numeric"
            maxLength={15}
            disabled={disabled}
            value={draft}
            aria-invalid={invalid || undefined}
            aria-describedby={`${id}-hint`}
            onChange={(event) => {
              const next = event.target.value;
              setDraft(next);
              const nextId =
                /^\d+$/.test(next) && Number.isSafeInteger(Number(next)) && Number(next) > 0
                  ? Number(next)
                  : null;
              setSeenValue(nextId);
              onChange(nextId);
            }}
          />
          <small id={`${id}-hint`}>
            {invalid
              ? 'ID phải là số nguyên dương.'
              : manager
                ? 'Nhập ID nhà cung cấp đã xác minh.'
                : 'Danh mục hiện chỉ dành cho Manager. Dùng ID đã xác minh.'}
          </small>
        </>
      ) : (
        <>
          <select
            id={id}
            value={value ?? ''}
            disabled={disabled || query.isLoading}
            onChange={(event) => onChange(event.target.value ? Number(event.target.value) : null)}
          >
            <option value="">{query.isLoading ? 'Đang tải danh mục…' : 'Chọn nhà cung cấp'}</option>
            {value !== null && !options.some((item) => item.id === value) && (
              <option value={value}>
                {selected
                  ? `${selected.data.name} · #${value}`
                  : `Nhà cung cấp #${value} · đã chọn`}
              </option>
            )}
            {options.map((item) => (
              <option key={item.id} value={item.id} disabled={!item.data.active}>
                {item.data.name} · #{item.id}
                {item.data.active ? '' : ' · Ngừng hoạt động'}
              </option>
            ))}
          </select>
          {!disabled && (
            <>
              <input
                aria-label={`Tìm ${label.toLocaleLowerCase()} trong trang này`}
                placeholder="Tìm tên / ID trong trang"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                maxLength={100}
              />
              {query.isError ? (
                <div className="js-supplier-actions" role="status">
                  <small>Chưa tải được danh mục.</small>
                  <button type="button" onClick={() => void query.refetch()}>
                    Tải lại
                  </button>
                </div>
              ) : (
                query.data && (
                  <div className="js-supplier-actions">
                    <button
                      type="button"
                      disabled={page === 0 || query.isFetching}
                      onClick={() => {
                        setSearch('');
                        setPage(page - 1);
                      }}
                    >
                      Trước
                    </button>
                    <small>
                      Trang {page + 1} · {query.data.totalElements} nhà cung cấp
                    </small>
                    <button
                      type="button"
                      disabled={
                        (page + 1) * query.data.size >= query.data.totalElements || query.isFetching
                      }
                      onClick={() => {
                        setSearch('');
                        setPage(page + 1);
                      }}
                    >
                      Sau
                    </button>
                  </div>
                )
              )}
              {query.data && !options.length && <small>Không có kết quả trong trang này.</small>}
            </>
          )}
        </>
      )}
      {manager && !disabled && (
        <button
          type="button"
          className="js-supplier-fallback"
          onClick={() => {
            setDraft(value?.toString() ?? '');
            setManual(!manual);
          }}
        >
          {manual ? 'Chọn từ danh mục' : 'Dùng ID nếu chưa có trong danh mục'}
        </button>
      )}
    </div>
  );
}
