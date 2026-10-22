import type { ReactNode } from 'react';
import { WorkspaceShell } from '../../components/ui/WorkspaceShell';
import './assessment.css';

// Same shell classes as FE1's customer workspace; kept in FE2's module so the
// shared app shell stays untouched.
const links = [
  { to: '/manager/dashboard', label: 'Overview & Approvals' },
  { to: '/manager/requests', label: 'Requests Management' },
  { to: '/manager/resources', label: 'Fleet & Resources' },
  { to: '/manager/service-prices', label: 'Tariffs & Pricing' },
  { to: '/manager/staff-administration', label: 'Staff Management' },
  { to: '/manager/staff', label: 'Case Staff' },
  { to: '/manager/reports/financial', label: 'Financial Report' },
  { to: '/manager/audit-events', label: 'Audit Events' },
];

export function ManagerLayout() {
  return (
    <WorkspaceShell home="/manager/requests" navigationLabel="Manager navigation" links={links} />
  );
}

export function ManagerHeading({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <header className="page-heading">
      <div>
        <small className="eyebrow">REQUEST ASSESSMENT · MANAGER</small>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {children}
    </header>
  );
}
