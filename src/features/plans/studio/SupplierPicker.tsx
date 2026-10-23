import { useEffect, useId, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSession } from '../../../shared/api/session';
import { queryKeys } from '../../../shared/api/query';
import { resourcesApi } from '../../resources/api';
import type { CatalogView } from '../../resources/contracts';

type Kind = 'suppliers' | 'vehicles' | 'stalls';
/** Readable name and whether the entry can be chosen, per catalogue. */
function describe(kind: Kind, item: CatalogView[Kind]) {
  if (kind === 'suppliers') {
    const s = item as CatalogView['suppliers'];
    return { name: s.data.name, active: s.data.active };
  }
  if (kind === 'vehicles') {
    const v = item as CatalogView['vehicles'];
    return {
      name: `${v.data.vehicleCode} · ${v.data.plateNumber} · ${v.data.horseCapacity} ngựa`,
      active: v.data.status === 'ACTIVE',
    };
  }
  const st = item as CatalogView['stalls'];
  return {
    name: `${st.data.stallCode} · ${st.data.capacitySlots} slot`,
    active: st.data.status === 'ACTIVE',
  };
}
const noun: Record<Kind, string> = {
  suppliers: 'nhà cung cấp',
  vehicles: 'xe',
  stalls: 'chuồng bay',
};

/**
 * A dropdown over the resource catalogue, readable by the Manager and the
 * Coordinator. A verified ID can still be typed when an entry is missing.
 * `autoPick` fills the first active entry while nothing is chosen.
 */
export function CatalogPicker({
  kind,
  label,
  value,
  onChange,
  disabled = false,
  autoPick = false,
}: {
  kind: Kind;
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  disabled?: boolean;
  autoPick?: boolean;
}) {
  const id = useId();
  const session = useSession();
  const reader = session?.role === 'MANAGER' || session?.role === 'COORDINATOR';
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
    queryKey: [...queryKeys.session(session?.generation ?? ''), 'studio-catalog', kind, page],
    queryFn: ({ signal }) => resourcesApi.list(kind, page, signal),
    enabled: reader && !disabled,
    staleTime: 30_000,
    retry: false,
  });
  const items = (query.data?.items ?? []) as CatalogView[Kind][];
  const firstActive = items.find((item) => describe(kind, item).active)?.id;
  useEffect(() => {
    if (autoPick && !disabled && value === null && firstActive !== undefined) onChange(firstActive);
  }, [autoPick, disabled, value, firstActive, onChange]);
  const selected = items.find((item) => item.id === value);
  const options = items.filter(
    (item) =>
      describe(kind, item).name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()) ||
      String(item.id).includes(search.trim()),
  );
  const fallbackMode = !reader || manual;
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
            {invalid ? 'ID phải là số nguyên dương.' : `Nhập ID ${noun[kind]} đã xác minh.`}
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
            <option value="">
              {query.isLoading ? 'Đang tải danh mục…' : `Chọn ${noun[kind]}`}
            </option>
            {value !== null && !options.some((item) => item.id === value) && (
              <option value={value}>
                {selected
                  ? `${describe(kind, selected).name} · #${value}`
                  : `${noun[kind]} #${value} · đã chọn`}
              </option>
            )}
            {options.map((item) => {
              const d = describe(kind, item);
              return (
                <option key={item.id} value={item.id} disabled={!d.active}>
                  {d.name} · #{item.id}
                  {d.active ? '' : ' · Ngừng hoạt động'}
                </option>
              );
            })}
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
                      Trang {page + 1} · {query.data.totalElements} {noun[kind]}
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
      {reader && !disabled && (
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

export function SupplierPicker(props: Omit<Parameters<typeof CatalogPicker>[0], 'kind'>) {
  return <CatalogPicker kind="suppliers" {...props} />;
}
