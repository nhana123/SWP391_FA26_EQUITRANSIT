import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { clearSession } from '../../shared/api/session';
import { NotificationBell } from '../activity-customer/notifications';
import './assessment.css';

// Same shell classes as FE1's customer workspace; kept in FE2's module so the
// shared app shell stays untouched.
const links = [
  { to: '/manager/requests', label: 'Requests' },
  { to: '/manager/staff', label: 'Case Staff' },
  { to: '/manager/staff-administration', label: 'Staff Administration' },
  { to: '/manager/service-prices', label: 'Service Prices' },
  { to: '/manager/resources', label: 'Transport Resources' },
  { to: '/manager/reports/financial', label: 'Financial Report' },
  { to: '/manager/audit-events', label: 'Audit Events' },
];

export function ManagerLayout() {
  const [menu, setMenu] = useState(false);
  const location = useLocation();
  const focusRef = useRef<HTMLElement>(null);
  useEffect(() => {
    focusRef.current?.focus({ preventScroll: true });
  }, [location.pathname]);
  return (
    <div className="workspace">
      <a className="skip" href="#main">
        Skip to content
      </a>
      <aside className={menu ? 'sidebar open' : 'sidebar'}>
        <Link className="brand" to="/manager/requests">
          EquiTransit
        </Link>
        <small>Manager PORTAL</small>
        <nav aria-label="Manager navigation">
          {links.map((link) => (
            <NavLink key={link.to} to={link.to} onClick={() => setMenu(false)}>
              {link.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className="workspace-main">
        <header className="workspace-header">
          <button
            className="menu-button"
            type="button"
            aria-expanded={menu}
            aria-label="Toggle navigation"
            onClick={() => setMenu((v) => !v)}
          >
            Menu
          </button>
          <span>Request assessment</span>
          <NotificationBell />
          <button type="button" onClick={clearSession}>
            Log Out
          </button>
        </header>
        <main id="main" ref={focusRef} tabIndex={-1} className="content">
          <Outlet />
        </main>
      </div>
    </div>
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
