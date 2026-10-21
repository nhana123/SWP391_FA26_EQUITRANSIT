import type { ReactNode } from 'react';
import { WorkspaceShell } from '../../components/ui/WorkspaceShell';
import './assessment.css';

// Same shell classes as FE1's customer workspace; kept in FE2's module so the
// shared app shell stays untouched.
const links = [
  { to: '/manager/dashboard', label: 'Overview' },
  { to: '/manager/requests', label: 'Requests' },
  { to: '/manager/staff', label: 'Case Staff' },
  { to: '/manager/staff-administration', label: 'Staff Administration' },
  { to: '/manager/service-prices', label: 'Service Prices' },
  { to: '/manager/resources', label: 'Transport Resources' },
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
