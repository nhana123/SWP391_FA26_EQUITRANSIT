import { DateTimeInput } from '../../shared/ui/DateTimeInput';
import { useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { queryClient, queryKeys } from '../../shared/api/query';
import { useSession } from '../../shared/api/session';
import { displayDate, validOffsetDate, type FieldErrors } from '../../shared/lib/validation';
import { ErrorNotice, Field, Loading, Notice } from '../../shared/ui/common';
import { useWrite } from '../incidents/panels';
import { handoverApi } from './api';
import {
  conditionLabels,
  conditions,
  costCodes,
  costLabels,
  decisionLabels,
  decisions,
  errorHelp,
  intermediateTypes,
  label,
  outcomeLabels,
  outcomes,
  typeLabels,
  type ActualCost,
  type Completion,
  type Condition,
  type CostCode,
  type CustomerHandover,
  type Decision,
  type Handover,
  type Outcome,
} from './contracts';
import { HandoverFileField, HandoverFileView } from './files';
import './handover.css';

export const handoverKeys = {
  all: (generation: string) => [...queryKeys.session(generation), 'handover'] as const,
  leg: (generation: string, legId: number) =>
    [...handoverKeys.all(generation), 'leg', legId] as const,
  customer: (generation: string, orderId: number) =>
    [...handoverKeys.all(generation), 'customer', orderId] as const,
  costs: (generation: string, planId: number) =>
    [...handoverKeys.all(generation), 'costs', planId] as const,
  profit: (generation: string, planId: number) =>
    [...handoverKeys.all(generation), 'profit', planId] as const,
};
const dateHint = 'Cannot be in the future.';
/** The BE allows five minutes of clock skew for "not in the future". */
const future = (value: string) => Date.parse(value) > Date.now() + 5 * 60_000;
const text = (v: string) => v.trim();
const orNull = (v: string) => v.trim() || null;

function Input({
  label: name,
  value,
  onChange,
  error,
  hint,
  max,
  area,
  date,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  hint?: string;
  max: number;
  area?: boolean;
  date?: boolean;
}) {
  return (
    <Field label={name} hint={hint} error={error}>
      {(id) =>
        date ? (
          <DateTimeInput id={id} value={value} onChange={onChange} />
        ) : area ? (
          <textarea
            id={id}
            maxLength={max}
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
        ) : (
          <input id={id} maxLength={max} value={value} onChange={(e) => onChange(e.target.value)} />
        )
      }
    </Field>
  );
}
function Select<T extends string>({
  label: name,
  value,
  options,
  labels,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly T[];
  labels: Record<string, string>;
  onChange: (v: T) => void;
}) {
  return (
    <Field label={name}>
      {(id) => (
        <select id={id} value={value} onChange={(e) => onChange(e.target.value as T)}>
          {options.map((o) => (
            <option key={o} value={o}>
              {labels[o] ?? o}
            </option>
          ))}
        </select>
      )}
    </Field>
  );
}

type HandoverKind = (typeof intermediateTypes)[number] | 'FINAL_RECEIVER';
interface HandoverForm {
  kind: HandoverKind;
  handoverTime: string;
  receivedByName: string;
  receiverAuthority: string;
  receiverSignatureFileKey: string;
  photoFileKey: string;
  horseConditionStatus: Condition;
  outcome: Outcome;
  exceptionNotes: string;
  locationDescription: string;
}
export function validateHandover(
  f: HandoverForm,
  context: { departedAt?: string | null; receiverName?: string | null } = {},
): FieldErrors {
  const e: FieldErrors = {};
  const final = f.kind === 'FINAL_RECEIVER';
  if (!validOffsetDate(f.handoverTime)) e.handoverTime = 'Choose a date and time.';
  else if (future(f.handoverTime)) e.handoverTime = 'The handover time cannot be in the future.';
  else if (context.departedAt && Date.parse(f.handoverTime) < Date.parse(context.departedAt))
    e.handoverTime = "The handover time cannot be earlier than the leg's actual departure.";
  if (!text(f.receivedByName)) e.receivedByName = 'Enter who received the horse.';
  // Someone other than the request's receiver needs a stated authority.
  else if (
    final &&
    context.receiverName &&
    text(f.receivedByName).toLowerCase() !== context.receiverName.trim().toLowerCase() &&
    !text(f.receiverAuthority)
  )
    e.receiverAuthority = 'Enter their authority, e.g. STABLE_MANAGER, TRAINER or GROOM.';
  if (final && !text(f.receiverSignatureFileKey))
    e.receiverSignatureFileKey = 'Final delivery needs the receiver’s signature.';
  if (final && !text(f.photoFileKey))
    e.photoFileKey = 'Final delivery needs a photo of the horse at the destination.';
  if (f.outcome !== 'SUCCESSFUL' && !text(f.exceptionNotes))
    e.exceptionNotes = 'Describe what went wrong.';
  return e;
}

/** Handovers on one leg plus the form to record one. Recording completes the leg. */
export function LegHandovers({
  orderId,
  legId,
  asDriver,
  finalLeg,
  departedAt = null,
  receiverName = null,
  receiverAuthority = null,
  onRecorded,
}: {
  orderId: number;
  legId: number;
  asDriver: boolean;
  finalLeg: boolean;
  /** The leg's actual departure; a handover cannot be earlier. */
  departedAt?: string | null;
  /** The consignee the customer named on the request. */
  receiverName?: string | null;
  receiverAuthority?: string | null;
  onRecorded: (message: string) => Promise<unknown>;
}) {
  const { generation } = useSession()!;
  const key = handoverKeys.leg(generation, legId);
  const list = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => handoverApi.forLeg(asDriver, legId, signal),
    retry: false,
  });
  const reload = () => queryClient.invalidateQueries({ queryKey: key });
  const write = useWrite(reload, errorHelp);
  const [f, setF] = useState<HandoverForm>({
    kind: finalLeg ? 'FINAL_RECEIVER' : 'INTERMEDIATE_AIRPORT',
    handoverTime: '',
    // The final receiver comes from the request; a proxy is entered explicitly.
    receivedByName: finalLeg ? (receiverName ?? '') : '',
    receiverAuthority: finalLeg ? (receiverAuthority ?? '') : '',
    receiverSignatureFileKey: '',
    photoFileKey: '',
    horseConditionStatus: 'GOOD',
    outcome: 'SUCCESSFUL',
    exceptionNotes: '',
    locationDescription: '',
  });
  const [fields, setFields] = useState<FieldErrors>({});
  const set = (patch: Partial<HandoverForm>) => setF((v) => ({ ...v, ...patch }));
  const kinds: HandoverKind[] = finalLeg
    ? ['FINAL_RECEIVER', ...intermediateTypes]
    : [...intermediateTypes];
  const final = f.kind === 'FINAL_RECEIVER';
  const [proxy, setProxy] = useState(false);
  // The request's receiver is shown, not retyped, unless someone else receives.
  const fixedReceiver = final && !!receiverName && !proxy;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const errors = validateHandover(f, { departedAt, receiverName });
    setFields(errors);
    if (Object.keys(errors).length) return;
    const body = {
      handoverTime: f.handoverTime,
      receivedByName: text(f.receivedByName),
      receiverAuthority: orNull(f.receiverAuthority),
      receiverSignatureFileKey: orNull(f.receiverSignatureFileKey),
      horseConditionStatus: f.horseConditionStatus,
      outcome: f.outcome,
      exceptionNotes: orNull(f.exceptionNotes),
      photoFileKey: orNull(f.photoFileKey),
      locationDescription: orNull(f.locationDescription),
    };
    write.run(async () => {
      if (f.kind === 'FINAL_RECEIVER') {
        const receipt: Completion = await handoverApi.finalDelivery(asDriver, legId, body);
        await reload();
        await onRecorded(
          `Delivered to ${receipt.receivedByName}. The order is now ${receipt.orderStatus}; this does not settle payments.`,
        );
      } else {
        const kind = f.kind;
        await handoverApi.intermediate(asDriver, legId, { ...body, handoverType: kind });
        await reload();
        await onRecorded(`${typeLabels[kind]} recorded. This leg is complete.`);
      }
    });
  };
  return (
    <section aria-label="Handovers" className="handover-panel">
      <h3>Handovers</h3>
      {list.isPending ? (
        <Loading />
      ) : list.error ? (
        <ErrorNotice error={list.error} />
      ) : !list.data.length ? (
        <p>No handover recorded on this leg.</p>
      ) : (
        <ul className="handover-list">
          {list.data.map((h) => (
            <StaffHandover key={h.handoverId} h={h} orderId={orderId} />
          ))}
        </ul>
      )}
      <form aria-label="Record handover" onSubmit={submit} noValidate>
        <Notice>
          {final
            ? 'Final delivery completes this leg, the plan and marks the order Delivered. It needs the receiver’s signature and a photo. It does not settle payments.'
            : 'An intermediate handover completes this leg; the order stays in transit.'}
        </Notice>
        {final && (
          <p className="handover-gate" role="note">
            🛂 Quarantine release must be cleared by the legal Specialist before the final handover;
            the server checks it when you record.
          </p>
        )}
        <Select
          label="Handover type"
          value={f.kind}
          options={kinds}
          labels={typeLabels}
          onChange={(kind) => set({ kind })}
        />
        <Input
          label="Handover time"
          date
          hint={dateHint}
          max={40}
          value={f.handoverTime}
          onChange={(handoverTime) => set({ handoverTime })}
          error={fields.handoverTime}
        />
        {fixedReceiver ? (
          <div className="handover-receiver">
            <span>
              Received by <strong>{receiverName}</strong>
              <small> · the receiver named on the request</small>
            </span>
            <button
              type="button"
              onClick={() => {
                setProxy(true);
                set({ receivedByName: '', receiverAuthority: '' });
              }}
            >
              Someone else receives
            </button>
          </div>
        ) : (
          <Input
            label="Received by"
            max={300}
            value={f.receivedByName}
            onChange={(receivedByName) => set({ receivedByName })}
            error={fields.receivedByName}
          />
        )}
        {!fixedReceiver && (
          <Input
            label="Receiver authority (optional)"
            hint={
              final
                ? 'Needed when the receiver is not the order receiver, e.g. STABLE_MANAGER, TRAINER, GROOM, VETERINARIAN.'
                : 'E.g. AIRPORT_RAMP_SUPERVISOR or the carrier.'
            }
            max={50}
            value={f.receiverAuthority}
            onChange={(receiverAuthority) => set({ receiverAuthority })}
            error={fields.receiverAuthority}
          />
        )}
        <HandoverFileField
          orderId={orderId}
          purpose="HANDOVER_SIGNATURE"
          label={final ? 'Receiver signature' : 'Receiver signature (optional)'}
          fileKey={f.receiverSignatureFileKey}
          onChange={(receiverSignatureFileKey) => set({ receiverSignatureFileKey })}
          error={fields.receiverSignatureFileKey}
          disabled={write.locked}
        />
        <HandoverFileField
          orderId={orderId}
          purpose="HANDOVER_PHOTO"
          label={final ? 'Handover photo' : 'Handover photo (optional)'}
          fileKey={f.photoFileKey}
          onChange={(photoFileKey) => set({ photoFileKey })}
          error={fields.photoFileKey}
          disabled={write.locked}
        />
        <Select
          label="Horse condition"
          value={f.horseConditionStatus}
          options={conditions}
          labels={conditionLabels}
          onChange={(horseConditionStatus) => set({ horseConditionStatus })}
        />
        <Select
          label="Outcome"
          value={f.outcome}
          options={outcomes}
          labels={outcomeLabels}
          onChange={(outcome) => set({ outcome })}
        />
        <Input
          label={f.outcome === 'SUCCESSFUL' ? 'Notes (optional)' : 'What went wrong'}
          area
          max={2000}
          value={f.exceptionNotes}
          onChange={(exceptionNotes) => set({ exceptionNotes })}
          error={fields.exceptionNotes}
        />
        <Input
          label="Location (optional)"
          max={500}
          value={f.locationDescription}
          onChange={(locationDescription) => set({ locationDescription })}
        />
        {write.notice}
        <button className="primary" type="submit" disabled={write.locked}>
          {write.pending ? 'Recording…' : final ? 'Record final delivery' : 'Record handover'}
        </button>
      </form>
    </section>
  );
}

function HandoverEvidence({
  orderId,
  signature,
  photo,
}: {
  orderId: number;
  signature: string | null;
  photo: string | null;
}) {
  if (!signature && !photo) return null;
  return (
    <div className="handover-evidence">
      {signature && (
        <HandoverFileView orderId={orderId} fileKey={signature} label="Receiver signature" />
      )}
      {photo && <HandoverFileView orderId={orderId} fileKey={photo} label="Handover photo" />}
    </div>
  );
}

function StaffHandover({ h, orderId }: { h: Handover; orderId: number }) {
  return (
    <li>
      <strong>{label(typeLabels, h.handoverType)}</strong> · {displayDate(h.handoverTime)} · to{' '}
      {h.receivedByName}
      {h.receiverAuthority && ` (${h.receiverAuthority})`}
      <br />
      Horse: {label(conditionLabels, h.horseConditionStatus)} · Outcome:{' '}
      {label(outcomeLabels, h.outcome)}
      {h.recordedByName && ` · recorded by ${h.recordedByName}`}
      {h.exceptionNotes && <p>{h.exceptionNotes}</p>}
      <HandoverEvidence
        orderId={orderId}
        signature={h.receiverSignatureFileKey}
        photo={h.photoFileKey}
      />
      {h.customerDecision && (
        <p>
          Customer answer: {label(decisionLabels, h.customerDecision)}
          {h.customerFeedback && ` — ${h.customerFeedback}`}
        </p>
      )}
    </li>
  );
}

/** Customer review of delivery records; only the customer can answer, once. */
export function CustomerHandovers({ orderId }: { orderId: number }) {
  const { generation } = useSession()!;
  const key = handoverKeys.customer(generation, orderId);
  const list = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => handoverApi.customerList(orderId, signal),
    retry: false,
  });
  if (list.isPending) return <Loading />;
  if (list.error) return <ErrorNotice error={list.error} />;
  if (!list.data.length)
    return (
      <section className="card">
        <h2>Delivery records</h2>
        <p>No handover has been recorded for this request yet.</p>
      </section>
    );
  return (
    <>
      {list.data.map((h) => (
        <CustomerHandoverCard key={h.handoverId} h={h} orderId={orderId} />
      ))}
    </>
  );
}

function CustomerHandoverCard({ h, orderId }: { h: CustomerHandover; orderId: number }) {
  const { generation } = useSession()!;
  const reload = () =>
    queryClient.invalidateQueries({ queryKey: handoverKeys.customer(generation, orderId) });
  const write = useWrite(reload, errorHelp);
  const [decision, setDecision] = useState<Decision | ''>('');
  const [feedback, setFeedback] = useState('');
  const [fields, setFields] = useState<FieldErrors>({});
  const final = h.handoverType === 'FINAL_RECEIVER';
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const errors: FieldErrors = {};
    if (!decision) errors.decision = 'Choose an answer.';
    if (decision && decision !== 'ACCEPTED' && !text(feedback))
      errors.feedback = 'Describe the problem so staff can follow up.';
    setFields(errors);
    if (Object.keys(errors).length || !decision) return;
    write.run(async () => {
      await handoverApi.decide(orderId, h.handoverId, decision, orNull(feedback));
      await reload();
    });
  };
  return (
    <section className="card" aria-label={`Handover ${h.handoverId}`}>
      <h2>{label(typeLabels, h.handoverType)}</h2>
      <dl className="handover-facts">
        <div>
          <dt>Time</dt>
          <dd>{displayDate(h.handoverTime)}</dd>
        </div>
        <div>
          <dt>Received by</dt>
          <dd>{h.receivedByName}</dd>
        </div>
        <div>
          <dt>Horse condition</dt>
          <dd>{label(conditionLabels, h.horseConditionStatus)}</dd>
        </div>
        <div>
          <dt>Outcome</dt>
          <dd>{label(outcomeLabels, h.outcome)}</dd>
        </div>
        {h.locationDescription && (
          <div>
            <dt>Location</dt>
            <dd>{h.locationDescription}</dd>
          </div>
        )}
      </dl>
      <HandoverEvidence
        orderId={orderId}
        signature={h.receiverSignatureFileKey}
        photo={h.photoFileKey}
      />
      {h.customerDecision ? (
        <p>
          Your answer: <strong>{label(decisionLabels, h.customerDecision)}</strong>
          {h.customerRespondedAt && ` on ${displayDate(h.customerRespondedAt)}`}
          {h.customerFeedback && ` — ${h.customerFeedback}`}
        </p>
      ) : !final ? (
        <p className="muted">A transfer between legs; no answer is needed from you.</p>
      ) : (
        <form aria-label="Delivery answer" onSubmit={submit} noValidate>
          <fieldset>
            <legend>Did you receive your horse as described?</legend>
            {decisions.map((d) => (
              <label key={d} className="handover-choice">
                <input
                  type="radio"
                  name={`decision-${h.handoverId}`}
                  value={d}
                  checked={decision === d}
                  onChange={() => setDecision(d)}
                />{' '}
                {decisionLabels[d]}
              </label>
            ))}
            {fields.decision && (
              <span className="field-error" role="alert">
                {fields.decision}
              </span>
            )}
          </fieldset>
          <Input
            label={decision && decision !== 'ACCEPTED' ? 'What is wrong' : 'Comments (optional)'}
            area
            max={2000}
            value={feedback}
            onChange={setFeedback}
            error={fields.feedback}
          />
          <p className="muted">Your answer is final and cannot be changed later.</p>
          {write.notice}
          <button className="primary" type="submit" disabled={write.locked}>
            {write.pending ? 'Sending…' : 'Send answer'}
          </button>
        </form>
      )}
    </section>
  );
}

interface CostForm {
  legId: string;
  costCode: CostCode;
  amount: string;
  currency: string;
  incurredAt: string;
  description: string;
  evidenceFileKey: string;
}
export function validateCost(f: CostForm): FieldErrors {
  const e: FieldErrors = {};
  if (!/^\d{1,13}(\.\d{1,2})?$/.test(f.amount.trim()))
    e.amount = 'Enter a non-negative amount with at most 2 decimals.';
  if (!/^[A-Z]{3}$/.test(f.currency.trim())) e.currency = 'Use a 3-letter code such as USD.';
  if (!validOffsetDate(f.incurredAt)) e.incurredAt = 'Choose a date and time.';
  else if (future(f.incurredAt)) e.incurredAt = 'The cost date cannot be in the future.';
  return e;
}

/** Internal supplier costs on one plan. Never shown to customers. */
export function ActualCosts({
  orderId,
  planId,
  legs,
  canWrite,
}: {
  orderId: number;
  planId: number;
  legs: { legId: number; sequenceNo: number }[];
  canWrite: boolean;
}) {
  const { generation } = useSession()!;
  const key = handoverKeys.costs(generation, planId);
  const list = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => handoverApi.costs(planId, signal),
    retry: false,
  });
  const reload = () => queryClient.invalidateQueries({ queryKey: handoverKeys.all(generation) });
  const write = useWrite(reload, errorHelp);
  const blank: CostForm = {
    legId: '',
    costCode: 'AIR_FREIGHT',
    amount: '',
    currency: 'USD',
    incurredAt: '',
    description: '',
    evidenceFileKey: '',
  };
  const [f, setF] = useState<CostForm>(blank);
  const [fields, setFields] = useState<FieldErrors>({});
  const [saved, setSaved] = useState('');
  const set = (patch: Partial<CostForm>) => setF((v) => ({ ...v, ...patch }));
  const legNo = (legId: number | null) =>
    legId === null
      ? 'Whole plan'
      : `Leg ${legs.find((l) => l.legId === legId)?.sequenceNo ?? legId}`;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    setSaved('');
    const errors = validateCost(f);
    setFields(errors);
    if (Object.keys(errors).length) return;
    write.run(async () => {
      const cost = await handoverApi.addCost(planId, {
        legId: f.legId ? Number(f.legId) : null,
        costCode: f.costCode,
        amount: Number(f.amount.trim()),
        currency: f.currency.trim(),
        incurredAt: f.incurredAt,
        description: orNull(f.description),
        evidenceFileKey: orNull(f.evidenceFileKey),
      });
      setF(blank);
      setSaved(`Cost ${cost.costId} recorded.`);
      await reload();
    });
  };
  return (
    <section className="card" aria-labelledby="costs-heading">
      <h2 id="costs-heading">Actual costs</h2>
      <p className="muted">Internal supplier costs. Customers never see these.</p>
      {list.isPending ? (
        <Loading />
      ) : list.error ? (
        <ErrorNotice error={list.error} />
      ) : !list.data.length ? (
        <p>No actual cost recorded for this plan.</p>
      ) : (
        <div className="table-scroll">
          <table aria-label="Actual costs">
            <thead>
              <tr>
                <th scope="col">Type</th>
                <th scope="col">Amount</th>
                <th scope="col">Leg</th>
                <th scope="col">Incurred</th>
                <th scope="col">Details</th>
              </tr>
            </thead>
            <tbody>
              {list.data.map((c: ActualCost) => (
                <tr key={c.costId}>
                  <td>{label(costLabels, c.costCode)}</td>
                  <td>
                    {c.currency} {c.amount}
                  </td>
                  <td>{legNo(c.legId)}</td>
                  <td>{displayDate(c.incurredAt)}</td>
                  <td>
                    {c.description}
                    {c.recordedByName && <small> · by {c.recordedByName}</small>}
                    {c.evidenceFileKey && (
                      <HandoverFileView
                        orderId={orderId}
                        fileKey={c.evidenceFileKey}
                        label="Receipt"
                      />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {canWrite && (
        <form aria-label="Record actual cost" onSubmit={submit} noValidate>
          <h3>Record a cost</h3>
          <Field label="Leg">
            {(id) => (
              <select id={id} value={f.legId} onChange={(e) => set({ legId: e.target.value })}>
                <option value="">Whole plan</option>
                {legs.map((l) => (
                  <option key={l.legId} value={l.legId}>
                    Leg {l.sequenceNo}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Select
            label="Cost type"
            value={f.costCode}
            options={costCodes}
            labels={costLabels}
            onChange={(costCode) => set({ costCode })}
          />
          <Input
            label="Amount"
            max={16}
            value={f.amount}
            onChange={(amount) => set({ amount })}
            error={fields.amount}
          />
          <Input
            label="Currency"
            max={3}
            value={f.currency}
            onChange={(currency) => set({ currency: currency.toUpperCase() })}
            error={fields.currency}
          />
          <Input
            label="Incurred at"
            date
            hint={dateHint}
            max={40}
            value={f.incurredAt}
            onChange={(incurredAt) => set({ incurredAt })}
            error={fields.incurredAt}
          />
          <Input
            label="Invoice or description (optional)"
            max={1000}
            value={f.description}
            onChange={(description) => set({ description })}
          />
          <HandoverFileField
            // A fresh field after each saved cost.
            key={saved}
            orderId={orderId}
            purpose="ACTUAL_COST_EVIDENCE"
            label="Invoice or receipt (optional)"
            fileKey={f.evidenceFileKey}
            onChange={(evidenceFileKey) => set({ evidenceFileKey })}
            disabled={write.locked}
          />
          {write.notice}
          {saved && <p role="status">{saved}</p>}
          <button className="primary" type="submit" disabled={write.locked}>
            {write.pending ? 'Recording…' : 'Record cost'}
          </button>
        </form>
      )}
    </section>
  );
}

/** Manager-only margin view: quoted total vs recorded actual costs. */
export function Profitability({ planId }: { planId: number }) {
  const { generation } = useSession()!;
  const q = useQuery({
    queryKey: handoverKeys.profit(generation, planId),
    queryFn: ({ signal }) => handoverApi.profitability(planId, signal),
    retry: false,
  });
  return (
    <section className="card" aria-labelledby="profit-heading">
      <h2 id="profit-heading">Profitability</h2>
      {q.isPending ? (
        <Loading />
      ) : q.error ? (
        <ErrorNotice error={q.error} />
      ) : (
        <>
          <dl className="activity-metrics">
            <div>
              <dt>Quoted total</dt>
              <dd>
                {q.data.currency} {q.data.totalQuotedAmount}
              </dd>
            </div>
            <div>
              <dt>Actual cost ({q.data.costCount})</dt>
              <dd>
                {q.data.currency} {q.data.totalActualCost}
              </dd>
            </div>
            <div>
              <dt>Gross profit</dt>
              <dd>
                {q.data.currency} {q.data.grossProfit}
              </dd>
            </div>
            <div>
              <dt>Margin</dt>
              <dd>{q.data.profitMarginPercent}%</dd>
            </div>
          </dl>
          <p className="muted">
            Based only on the costs recorded so far. This is not a payment or settlement status.
          </p>
        </>
      )}
    </section>
  );
}
