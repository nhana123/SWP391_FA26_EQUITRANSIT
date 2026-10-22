import type { Role } from '../../shared/api/contracts';
import { Icon } from '../../components/ui/Icons';
import './workflow.css';

/**
 * Who the request is waiting on, derived from its status only. Each step names
 * the roles that act in it, so every viewer sees whether it is their turn.
 */
type Step = {
  key: string;
  label: string;
  actors: Role[];
  statuses: string[];
  waiting: string;
  parts: Partial<Record<Role, string>>;
};
const roleNames: Record<Role, string> = {
  CUSTOMER: 'Customer',
  MANAGER: 'Manager',
  SPECIALIST: 'Specialist',
  COORDINATOR: 'Coordinator',
  DRIVER: 'Driver',
};
export const workflowSteps: Step[] = [
  {
    key: 'REQUEST',
    label: 'Request',
    actors: ['CUSTOMER'],
    statuses: ['DRAFT', 'CHANGES_REQUESTED'],
    waiting: 'The customer completes and submits the request.',
    parts: { CUSTOMER: 'Complete the request and submit it.' },
  },
  {
    key: 'REVIEW',
    label: 'Review & assign',
    actors: ['MANAGER'],
    statuses: ['SUBMITTED'],
    waiting: 'The Manager reviews the request and assigns a Specialist and a Coordinator.',
    parts: { MANAGER: 'Decide on the request and assign the case team.' },
  },
  {
    key: 'PREPARE',
    label: 'Preparation',
    actors: ['SPECIALIST', 'COORDINATOR', 'MANAGER', 'CUSTOMER'],
    statuses: ['APPROVED', 'IN_PREPARATION'],
    waiting:
      'The Specialist clears the legal file, the Coordinator designs the journey, the Manager issues the quotation and confirms payment.',
    parts: {
      SPECIALIST: 'Assess the horse and clear the three legal phases.',
      COORDINATOR: 'Design the journey, assign resources and confirm the plan.',
      MANAGER: 'Issue the quotation and reconcile the payments.',
      CUSTOMER: 'Accept the quotation, pay when requested and upload documents.',
    },
  },
  {
    key: 'AUTHORIZE',
    label: 'Gates & departure',
    actors: ['COORDINATOR', 'MANAGER', 'DRIVER'],
    statuses: ['CONFIRMED'],
    waiting:
      'The Coordinator evaluates the three gates; the Manager authorizes departure once all pass; the driver receives the horse.',
    parts: {
      COORDINATOR: 'Evaluate the financial, legal and operational gates.',
      MANAGER: 'Authorize departure once all three gates pass.',
      DRIVER: 'Receive the horse and depart once departure is authorized.',
    },
  },
  {
    key: 'TRANSIT',
    label: 'Transport',
    actors: ['DRIVER', 'COORDINATOR'],
    statuses: ['IN_TRANSIT'],
    waiting: 'The driver runs the road legs and the Coordinator the air legs, recording updates.',
    parts: {
      DRIVER: 'Run your road leg, record updates and hand the horse over.',
      COORDINATOR: 'Run the air legs and coordinate the handovers.',
    },
  },
  {
    key: 'DELIVERY',
    label: 'Delivery & costs',
    actors: ['CUSTOMER', 'MANAGER', 'COORDINATOR'],
    statuses: ['DELIVERED'],
    waiting:
      'The customer confirms the delivery; the Coordinator records actual costs and the Manager reviews them.',
    parts: {
      CUSTOMER: 'Confirm the delivery handover.',
      COORDINATOR: 'Record the actual costs of the trip.',
      MANAGER: 'Review actual costs and profitability.',
    },
  },
  {
    key: 'DONE',
    label: 'Completed',
    actors: [],
    statuses: ['COMPLETED', 'CLOSED'],
    waiting: 'Nothing is waiting: the request is complete.',
    parts: {},
  },
];

export function currentStep(status: string) {
  const index = workflowSteps.findIndex((s) => s.statuses.includes(status));
  return index;
}

export function OrderWorkflowBanner({ status, role }: { status: string; role: Role }) {
  const index = currentStep(status);
  const stopped = index < 0;
  const step = stopped ? null : workflowSteps[index];
  const mine = !!step && step.actors.includes(role);
  return (
    <section
      className={`workflow-banner ${mine ? 'mine' : ''} ${stopped ? 'stopped' : ''}`}
      aria-label="Order workflow"
    >
      <div className="workflow-now">
        <span className="workflow-icon" aria-hidden="true">
          <Icon name={mine ? 'check' : 'clock'} size={20} />
        </span>
        <div>
          <small className="eyebrow">CURRENT STEP</small>
          <strong>
            {step ? step.label : `Stopped — ${status.toLowerCase().replaceAll('_', ' ')}`}
          </strong>
          <p>
            {step
              ? step.actors.length
                ? `Waiting for ${step.actors.map((a) => roleNames[a]).join(', ')}. ${step.waiting}`
                : step.waiting
              : 'This request will not progress further.'}
          </p>
          {step && (
            <p className={`workflow-part ${mine ? '' : 'muted'}`}>
              {mine
                ? `Your turn: ${step.parts[role] ?? 'act on your part of this step.'}`
                : 'Nothing is waiting on you in this step.'}
            </p>
          )}
        </div>
      </div>
      <ol className="workflow-steps" aria-label="Workflow steps">
        {workflowSteps.map((s, i) => (
          <li
            key={s.key}
            className={stopped ? '' : i < index ? 'done' : i === index ? 'current' : ''}
            aria-current={i === index ? 'step' : undefined}
          >
            <span className="workflow-dot" aria-hidden="true">
              {!stopped && i < index ? <Icon name="check" size={12} /> : i + 1}
            </span>
            <span>{s.label}</span>
            <small>{s.actors.map((a) => roleNames[a]).join(' · ') || '—'}</small>
          </li>
        ))}
      </ol>
      <small className="workflow-note">Based on the request status.</small>
    </section>
  );
}
