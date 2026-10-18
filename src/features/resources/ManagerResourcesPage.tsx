import { useState, type FormEvent } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { ApiError } from '../../shared/api/client';
import { queryClient, queryKeys } from '../../shared/api/query';
import { useSession } from '../../shared/api/session';
import { displayDate, type FieldErrors } from '../../shared/lib/validation';
import { ErrorNotice, Field, Loading, Notice, Pagination } from '../../shared/ui/common';
import { useCaseCommand } from '../assessment/command';
import { ManagerHeading } from '../assessment/layout';
import { RESOURCE_PAGE_SIZE, resourcesApi } from './api';
import {
  catalogKeys,
  catalogLabels,
  type AnyView,
  type CatalogCommand,
  type CatalogKey,
  type CatalogView,
  type ResourceWindow,
} from './contracts';
import { fieldSpecs, fromValues, toValues, type FieldSpec, type FormValues } from './forms';
import './resources.css';

export const resourceKeys = {
  all: (generation: string) => [...queryKeys.session(generation), 'resources'] as const,
  list: (generation: string, key: CatalogKey, page: number) =>
    [...resourceKeys.all(generation), key, 'list', { page }] as const,
  detail: (generation: string, key: CatalogKey, id: number) =>
    [...resourceKeys.all(generation), key, 'detail', id] as const,
};

const errorHelp: Record<string, string> = {
  RESOURCE_VERSION_CONFLICT:
    'Someone changed this record after you opened it. Reload, review the current values, then save again.',
  RESOURCE_RETRY_CONFLICT:
    'This operation was already used with different input. Reload and start a new change.',
  RESOURCE_POLICY_IMMUTABLE:
    'Approved or inactive policy content cannot be edited. Create a new version with the same code.',
  RESOURCE_DATA_UNSUPPORTED:
    'This record holds legacy data the system cannot rewrite safely. Ask the project team to review it.',
  RESOURCE_LEGACY_DATA:
    'This record holds legacy data the system cannot rewrite safely. Ask the project team to review it.',
  RESOURCE_INPUT_INVALID: 'Some values were not accepted. Check the highlighted fields.',
  RESOURCE_WINDOW_INVALID: 'The maintenance or document window is not valid.',
  RESOURCE_BUSY: 'The resource catalogue is busy. Retry sends exactly the same change.',
  RESOURCE_LOCK_BUSY: 'The resource catalogue is busy. Retry sends exactly the same change.',
  RESOURCE_NOT_FOUND: 'This record no longer exists or is not accessible.',
};
const retryCodes = ['RESOURCE_BUSY', 'RESOURCE_LOCK_BUSY'];

export const schemaPending = (error: unknown) => error instanceof ApiError && error.status === 503;
export function DeploymentNotice({ retry }: { retry?: () => void }) {
  return (
    <div className="notice" role="status">
      <p>
        Resource management is not deployed on this server yet (database migration 010 is pending).
        This is not an empty catalogue.
      </p>
      {retry && (
        <button type="button" onClick={retry}>
          Try again
        </button>
      )}
    </div>
  );
}

const pending = (label: string) => (
  <span className="badge warn">{label} not recorded — pending</span>
);
function WindowCells({ w }: { w: ResourceWindow }) {
  return (
    <>
      <td>
        {w.maintenanceFrom
          ? `${displayDate(w.maintenanceFrom)} → ${w.maintenanceTo ? displayDate(w.maintenanceTo) : 'ongoing'}`
          : 'None scheduled'}
      </td>
      <td>{w.documentExpiresAt ? displayDate(w.documentExpiresAt) : pending('Expiry')}</td>
      <td>{w.bufferMinutes === null ? pending('Buffer') : `${w.bufferMinutes} min`}</td>
    </>
  );
}
const windowHeads = ['Maintenance', 'Document expiry', 'Buffer'];

/** Summary columns per catalogue: real values only, unknown evidence marked pending. */
const columns: {
  [K in CatalogKey]: { heads: string[]; cells: (v: CatalogView[K]) => React.ReactNode };
} = {
  vehicles: {
    heads: ['Code', 'Plate', 'Horses', 'Climate', 'Status', ...windowHeads],
    cells: ({ data: d }) => (
      <>
        <td>{d.vehicleCode}</td>
        <td>{d.plateNumber}</td>
        <td>{d.horseCapacity}</td>
        <td>{d.climateSystemType}</td>
        <td>
          <span className="badge">{d.status}</span>
        </td>
        <WindowCells w={d.window} />
      </>
    ),
  },
  stalls: {
    heads: ['Code', 'Slots', 'Height × width (cm)', 'Weight limit', 'Status', ...windowHeads],
    cells: ({ data: d }) => (
      <>
        <td>{d.stallCode}</td>
        <td>{d.capacitySlots}</td>
        <td>
          {d.internalHeightCm} × {d.internalWidthCm}
        </td>
        <td>{d.weightLimitKg === null ? pending('Limit') : `${d.weightLimitKg} kg`}</td>
        <td>
          <span className="badge">{d.status}</span>
        </td>
        <WindowCells w={d.window} />
      </>
    ),
  },
  suppliers: {
    heads: ['Name', 'Contact', 'Services', 'Active'],
    cells: ({ data: d }) => (
      <>
        <td>{d.name}</td>
        <td>{[d.contactName, d.email, d.phone].filter(Boolean).join(' · ') || '—'}</td>
        <td>{d.services.join(', ') || '—'}</td>
        <td>
          <span className="badge">{d.active ? 'Active' : 'Archived'}</span>
        </td>
      </>
    ),
  },
  'fit-policies': {
    heads: [
      'Code',
      'Version',
      'Status',
      'Scope',
      'Slots',
      'Max W / H / W',
      'Effective',
      'Source',
      'Reviewed',
    ],
    cells: (p) => (
      <>
        <td>{p.data.policyCode}</td>
        <td>{p.version}</td>
        <td>
          <span className="badge">{p.data.status}</span>
        </td>
        <td>{policyScope(p.data.stallId, p.data.carrierSupplierId)}</td>
        <td>{p.data.slotQuantity}</td>
        <td>
          {[
            p.data.maxWeightKg && `${p.data.maxWeightKg} kg`,
            p.data.maxHeightCm && `${p.data.maxHeightCm} cm`,
            p.data.maxWidthCm && `${p.data.maxWidthCm} cm`,
          ]
            .map((v) => v || 'pending')
            .join(' / ')}
        </td>
        <td>
          {displayDate(p.data.effectiveFrom)} →{' '}
          {p.data.effectiveTo ? displayDate(p.data.effectiveTo) : 'open-ended'}
        </td>
        <td className="resource-source">
          {p.data.sourceUrl ?? p.data.sourceFileKey ?? pending('Source')}
        </td>
        <td>
          {p.reviewedBy !== null
            ? `Staff ${p.reviewedBy}, ${displayDate(p.reviewedAt)}`
            : 'Not reviewed'}
        </td>
      </>
    ),
  },
};
function policyScope(stallId: number | null, carrierId: number | null) {
  if (stallId === null && carrierId === null) return 'Global';
  return [stallId !== null && `Stall ${stallId}`, carrierId !== null && `Carrier ${carrierId}`]
    .filter(Boolean)
    .join(', ');
}
const recordName = (key: CatalogKey, v: AnyView) => {
  const d = v.data as Record<string, unknown>;
  const name = d.vehicleCode ?? d.stallCode ?? d.name ?? d.policyCode;
  return `${catalogLabels[key].one} ${String(name)} (ID ${v.id})`;
};

/** Approved/inactive policy content is immutable; only an approved one can be archived intact. */
export const policyLocked = (key: CatalogKey, v: AnyView | null) =>
  key === 'fit-policies' && !!v && (v.data as { status: string }).status !== 'DRAFT';

type Target =
  | { mode: 'create'; key: CatalogKey; prefill?: FormValues }
  | { mode: 'edit'; key: CatalogKey; id: number };

function FieldInput({
  spec,
  value,
  onChange,
  error,
}: {
  spec: FieldSpec;
  value: string;
  onChange: (value: string) => void;
  error?: string;
}) {
  if (spec.type === 'checkbox')
    return (
      <label className="horse-choice">
        <input
          type="checkbox"
          checked={value === 'true'}
          onChange={(e) => onChange(String(e.target.checked))}
        />
        <span>{spec.label}</span>
      </label>
    );
  return (
    <Field label={spec.label} hint={spec.hint} error={error}>
      {(id) =>
        spec.type === 'select' ? (
          <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
            {spec.options!.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        ) : spec.type === 'textarea' ? (
          <textarea
            id={id}
            maxLength={spec.maxLength}
            value={value}
            aria-invalid={!!error}
            onChange={(e) => onChange(e.target.value)}
          />
        ) : (
          <input
            id={id}
            maxLength={spec.maxLength}
            inputMode={spec.decimal ? 'decimal' : undefined}
            value={value}
            aria-invalid={!!error}
            onChange={(e) => onChange(e.target.value)}
          />
        )
      }
    </Field>
  );
}

/** BE validation `fields` may use nested paths such as data.window.bufferMinutes. */
function serverFields(fields: Record<string, string>): FieldErrors {
  return Object.fromEntries(Object.entries(fields).map(([k, v]) => [k.split('.').pop()!, v]));
}

function Editor({
  target,
  onDone,
  onClose,
  onNewVersion,
}: {
  target: Target;
  onDone: (receipt: AnyView, verb: string) => Promise<void>;
  onClose: () => void;
  onNewVersion: (prefill: FormValues) => void;
}) {
  const session = useSession()!;
  const { key } = target;
  const editing = target.mode === 'edit';
  const id = editing ? target.id : 0;
  const detail = useQuery({
    queryKey: resourceKeys.detail(session.generation, key, id),
    queryFn: ({ signal }) => resourcesApi.get(key, id, signal),
    enabled: editing,
    staleTime: 0,
    retry: false,
  });
  // The version the Manager is reviewing. A background refetch never replaces it.
  const [reviewed, setReviewed] = useState<AnyView | null>(null);
  if (editing && detail.data && reviewed === null) setReviewed(detail.data);
  const changed =
    editing && !!reviewed && !!detail.data && detail.data.recordVersion !== reviewed.recordVersion;
  const label = catalogLabels[key].one;
  const locked = policyLocked(key, reviewed);

  if (editing && detail.isPending) return <Loading />;
  if (editing && detail.error && !reviewed)
    return (
      <section className="card">
        {schemaPending(detail.error) ? (
          <DeploymentNotice retry={() => void detail.refetch()} />
        ) : (
          <ErrorNotice error={detail.error}>
            {detail.error instanceof ApiError && detail.error.status === 404 && (
              <p>This {label} no longer exists or is not accessible.</p>
            )}
          </ErrorNotice>
        )}
        <button type="button" onClick={onClose}>
          Back to the list
        </button>
      </section>
    );
  async function reload() {
    const fresh = await detail.refetch();
    if (fresh.data) setReviewed(fresh.data);
  }
  return (
    <RecordForm
      // Reloading starts a fresh review of the current server values.
      key={reviewed?.recordVersion ?? 'new'}
      target={target}
      reviewed={reviewed}
      changed={changed}
      locked={locked}
      onDone={onDone}
      onClose={onClose}
      onReload={reload}
      onNewVersion={onNewVersion}
    />
  );
}

function RecordForm({
  target,
  reviewed,
  changed,
  locked,
  onDone,
  onClose,
  onReload,
  onNewVersion,
}: {
  target: Target;
  reviewed: AnyView | null;
  changed: boolean;
  locked: boolean;
  onDone: (receipt: AnyView, verb: string) => Promise<void>;
  onClose: () => void;
  onReload: () => Promise<void>;
  onNewVersion: (prefill: FormValues) => void;
}) {
  const { key } = target;
  const editing = target.mode === 'edit';
  const label = catalogLabels[key].one;
  const [values, setValues] = useState<FormValues>(() =>
    target.mode === 'create' && target.prefill
      ? target.prefill
      : toValues(key, reviewed?.data ?? null),
  );
  const [errors, setErrors] = useState<FieldErrors>({});
  const [action, setAction] = useState<'save' | 'archive'>('save');
  const command = useCaseCommand(
    (body: CatalogCommand) =>
      editing ? resourcesApi.replace(key, target.id, body) : resourcesApi.create(key, body),
    retryCodes,
  );
  const code = command.error instanceof ApiError ? command.error.code : undefined;
  const fieldErrors = { ...serverFields(command.fields), ...errors };
  const canArchive =
    editing &&
    !!reviewed &&
    (key === 'suppliers'
      ? (reviewed.data as { active: boolean }).active
      : key === 'fit-policies'
        ? (reviewed.data as { status: string }).status === 'APPROVED'
        : (reviewed.data as { status: string }).status !== 'INACTIVE');

  function send(next: 'save' | 'archive', input: FormValues) {
    setAction(next);
    command.submit(
      () => {
        const result = fromValues(key, input);
        const blocked: FieldErrors = { ...result.errors };
        if (changed) blocked.form = 'This record changed on the server. Reload and review first.';
        setErrors(blocked);
        if (!result.data || Object.keys(blocked).length) return null;
        return { recordVersion: editing ? reviewed!.recordVersion : null, data: result.data };
      },
      (receipt) => onDone(receipt, next === 'archive' ? 'archived' : editing ? 'saved' : 'created'),
    );
  }
  function submit(e: FormEvent) {
    e.preventDefault();
    if (!locked) send('save', values);
  }
  function archive() {
    // A frozen archive resends its pending command; build is not called again.
    // Archive sends the reviewed server values intact with only the state changed.
    const base = toValues(key, reviewed!.data);
    send(
      'archive',
      key === 'suppliers' ? { ...base, active: 'false' } : { ...base, status: 'INACTIVE' },
    );
  }
  const busyLabel = action === 'archive' ? 'Archiving…' : 'Saving…';
  return (
    <form
      className="card"
      onSubmit={submit}
      noValidate
      aria-label={editing ? `Edit ${label}` : `New ${label}`}
    >
      <h2>
        {editing ? `Edit ${recordName(key, reviewed!)}` : `New ${label}`}
        {key === 'fit-policies' &&
          editing &&
          ` — version ${(reviewed as CatalogView['fit-policies']).version}`}
      </h2>
      {editing && (
        <p className="muted">
          Reviewing server version {reviewed!.recordVersion}. Saving replaces the whole record;
          nothing is deleted.
        </p>
      )}
      {changed && !command.frozen && (
        <div className="notice error" role="alert">
          <p>This record changed on the server since you opened it.</p>
          <button type="button" onClick={() => void onReload()} disabled={command.locked}>
            Reload and review
          </button>
        </div>
      )}
      {locked && (
        <Notice>
          This policy is {(reviewed!.data as { status: string }).status.toLowerCase()} and its
          content cannot be edited. Create a new version with the same code to change limits or
          sources.
        </Notice>
      )}
      {schemaPending(command.error) ? (
        <DeploymentNotice />
      ) : (
        <ErrorNotice error={command.error}>
          {code && errorHelp[code] && <p>{errorHelp[code]}</p>}
          {command.frozen && !command.pending && (
            <p>
              The result is uncertain. Retry sends the same change with the same identifier and
              version, so it cannot be applied twice.
            </p>
          )}
          {code === 'RESOURCE_VERSION_CONFLICT' && editing && (
            <button type="button" onClick={() => void onReload()}>
              Reload and review
            </button>
          )}
        </ErrorNotice>
      )}
      {fieldErrors.form && (
        <p className="field-error" role="alert">
          {fieldErrors.form}
        </p>
      )}
      <fieldset className="form-grid" disabled={command.locked || locked}>
        {fieldSpecs[key].map((spec) => (
          <FieldInput
            key={spec.name}
            spec={spec}
            value={values[spec.name] ?? ''}
            error={fieldErrors[spec.name]}
            onChange={(v) => setValues((current) => ({ ...current, [spec.name]: v }))}
          />
        ))}
      </fieldset>
      {key === 'fit-policies' && (
        <p className="muted">
          Reviewer and review time are recorded by the server from your account. Approving a version
          retires older approved versions of the same code. Fit is not carrier acceptance.
        </p>
      )}
      <div className="actions">
        {!locked && (
          <button
            className="primary"
            type="submit"
            disabled={command.pending || (changed && !command.frozen)}
          >
            {command.pending && action === 'save'
              ? busyLabel
              : command.frozen && action === 'save'
                ? 'Retry the same change'
                : editing
                  ? 'Save changes'
                  : `Create ${label}`}
          </button>
        )}
        {canArchive && (
          <button
            type="button"
            disabled={command.pending || (command.frozen && action !== 'archive') || changed}
            onClick={archive}
          >
            {command.pending && action === 'archive'
              ? busyLabel
              : command.frozen && action === 'archive'
                ? 'Retry the same archive'
                : `Archive ${label}`}
          </button>
        )}
        {locked && (
          <button
            type="button"
            disabled={command.locked}
            onClick={() =>
              // Same policy code creates the next family version as a DRAFT.
              onNewVersion({ ...toValues(key, reviewed!.data), status: 'DRAFT' })
            }
          >
            New version from this policy
          </button>
        )}
        <button type="button" disabled={command.locked} onClick={onClose}>
          Close
        </button>
      </div>
    </form>
  );
}

function CatalogTable<K extends CatalogKey>({
  catalog,
  page,
  onPage,
  onOpen,
}: {
  catalog: K;
  page: number;
  onPage: (page: number) => void;
  onOpen: (id: number) => void;
}) {
  const session = useSession()!;
  const list = useQuery({
    queryKey: resourceKeys.list(session.generation, catalog, page),
    queryFn: ({ signal }) => resourcesApi.list(catalog, page, signal),
    placeholderData: keepPreviousData,
    retry: false,
  });
  const spec = columns[catalog];
  if (list.isPending) return <Loading />;
  if (schemaPending(list.error)) return <DeploymentNotice retry={() => void list.refetch()} />;
  if (list.error)
    return (
      <ErrorNotice error={list.error}>
        <button type="button" onClick={() => void list.refetch()}>
          Try again
        </button>
      </ErrorNotice>
    );
  const pages = Math.ceil(list.data.totalElements / RESOURCE_PAGE_SIZE);
  return (
    <>
      {!list.data.items.length ? (
        <p>No {catalogLabels[catalog].title.toLowerCase()} recorded yet.</p>
      ) : (
        <div className="table-scroll" aria-busy={list.isPlaceholderData}>
          <table aria-label={catalogLabels[catalog].title}>
            <thead>
              <tr>
                <th scope="col">ID</th>
                {spec.heads.map((h) => (
                  <th scope="col" key={h}>
                    {h}
                  </th>
                ))}
                <th scope="col">Action</th>
              </tr>
            </thead>
            <tbody>
              {list.data.items.map((item) => (
                <tr key={item.id}>
                  <td>{item.id}</td>
                  {spec.cells(item)}
                  <td>
                    <button
                      type="button"
                      onClick={() => onOpen(item.id)}
                      aria-label={`Open ${recordName(catalog, item)}`}
                    >
                      Open
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {(pages > 1 || page > 0) && (
        <Pagination page={page} pages={pages} onChange={onPage} pending={list.isFetching} />
      )}
    </>
  );
}

export function ManagerResourcesPage() {
  const session = useSession()!;
  const [params, setParams] = useSearchParams();
  const tab = (catalogKeys as string[]).includes(params.get('tab') ?? '')
    ? (params.get('tab') as CatalogKey)
    : 'vehicles';
  const page = Math.max(0, Number.parseInt(params.get('page') ?? '0', 10) || 0);
  const [target, setTarget] = useState<Target | null>(null);
  const [notice, setNotice] = useState('');

  function open(next: Target | null) {
    setNotice('');
    setTarget(next);
  }
  async function done(receipt: AnyView, verb: string) {
    setTarget(null);
    setNotice(`${recordName(tab, receipt)} ${verb}. The list shows the current server data.`);
    // A receipt may be an older replay: always re-read current versions.
    await queryClient.invalidateQueries({ queryKey: resourceKeys.all(session.generation) });
  }
  return (
    <>
      <ManagerHeading
        title="Transport Resources"
        description="Road vehicles, air stall equipment, suppliers and sourced stall fit policies. Records are archived, never deleted."
      />
      <nav className="actions resource-tabs" aria-label="Resource catalogues">
        {catalogKeys.map((key) => (
          <button
            key={key}
            type="button"
            aria-pressed={tab === key}
            onClick={() => {
              open(null);
              setParams({ tab: key });
            }}
          >
            {catalogLabels[key].title}
          </button>
        ))}
      </nav>
      {notice && <Notice>{notice}</Notice>}
      {target && (
        <Editor
          key={JSON.stringify(target)}
          target={target}
          onDone={done}
          onClose={() => setTarget(null)}
          onNewVersion={(prefill) => open({ mode: 'create', key: 'fit-policies', prefill })}
        />
      )}
      <section className="card" aria-labelledby="resource-list-heading">
        <div className="resource-list-head">
          <h2 id="resource-list-heading">{catalogLabels[tab].title}</h2>
          <button type="button" onClick={() => open({ mode: 'create', key: tab })}>
            Add {catalogLabels[tab].one}
          </button>
        </div>
        {tab === 'vehicles' && (
          <p className="muted">ROAD fleet only. Vehicle count never changes service prices.</p>
        )}
        {tab === 'stalls' && <p className="muted">Physical AIR stall equipment only.</p>}
        <CatalogTable
          key={tab}
          catalog={tab}
          page={page}
          onPage={(next) => setParams({ tab, page: String(next) })}
          onOpen={(id) => open({ mode: 'edit', key: tab, id })}
        />
      </section>
    </>
  );
}
