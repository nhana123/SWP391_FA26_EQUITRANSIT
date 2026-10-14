import { useEffect, useRef, useState } from 'react';
import {
  createBrowserRouter,
  Link,
  NavLink,
  Navigate,
  Outlet,
  useLocation,
} from 'react-router-dom';
import {
  AccountPage,
  EmailRequestPage,
  LoginPage,
  RegisterPage,
  ResetPage,
  VerificationSentPage,
  VerifyPage,
} from '../features/auth/pages';
import { ManagerQueuePage } from '../features/assessment/pages';
import { ManagerStaffPage } from '../features/assessment/staff';
import { HorseDetailPage, HorseEditPage, HorseEditor, HorsesPage } from '../features/horses/pages';
import { OpenDraftPage, OrderEditor, OrderPage } from '../features/transport-orders/pages';
import { clearSession, useSession } from '../shared/api/session';
import { clearCapturedToken } from '../shared/lib/token';
import { Notice } from '../shared/ui/common';
import type { Role } from '../shared/api/contracts';

function Brand() {
  return (
    <Link className="brand" to="/">
      EquiTransit
    </Link>
  );
}
function PublicLayout() {
  return (
    <>
      <a className="skip" href="#main">
        Skip to content
      </a>
      <header className="public-header">
        <Brand />
        <nav aria-label="Main navigation">
          <Link to="/">Home</Link>
          <Link to="/login">Login</Link>
          <Link className="button primary" to="/register">
            Sign Up
          </Link>
        </nav>
      </header>
      <main id="main" className="public-main">
        <Outlet />
      </main>
    </>
  );
}
function Home() {
  return (
    <>
      <section className="hero">
        <div>
          <small className="eyebrow">CROSS-BORDER EQUINE LOGISTICS</small>
          <h1>
            Their next chapter.
            <br />A journey you can trust.
          </h1>
          <p>
            International horse transport with coordinated road and air travel, route-specific
            documents and a clear quotation.
          </p>
          <Link className="button primary" to="/customer/requests/new">
            Request Transport
          </Link>
          <p className="muted">A tailored quotation. No instant flight-price promises.</p>
        </div>
        <div className="journey-card">
          <small>FROM STABLE TO STABLE</small>
          <h2>One coordinated journey</h2>
          <p>Stable → Airport → Destination</p>
          <p>Road + Air · Care along the way</p>
        </div>
      </section>
      <section className="home-section">
        <h2>Care throughout the journey</h2>
        <div className="three-cards">
          {[
            [
              'Coordinated transport',
              'Pickup, air transport and onward delivery planned together.',
            ],
            ['Documents for your route', 'A Specialist reviews what your journey needs.'],
            ['Clear, tailored quotations', 'Review services and costs before accepting.'],
          ].map(([title, text]) => (
            <article key={title} className="card">
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
export function RoleGate({ roles }: { roles: Role[] }) {
  const session = useSession();
  const location = useLocation();
  if (!session)
    return <Navigate to={`/login?returnTo=${encodeURIComponent(location.pathname)}`} replace />;
  if (!roles.includes(session.role))
    return (
      <Notice>
        You do not have access to this workspace. <Link to="/staff">View your role</Link>.
      </Notice>
    );
  return <Outlet />;
}
type WorkspaceLink = { to: string; label: string };
const customerLinks: WorkspaceLink[] = [
  { to: '/customer/horses', label: 'My Horses' },
  { to: '/customer/requests', label: 'Requests' },
  { to: '/customer/account', label: 'Account' },
];
const managerLinks: WorkspaceLink[] = [
  { to: '/manager/requests', label: 'Requests' },
  { to: '/manager/staff', label: 'Case Staff' },
];
function CustomerLayout() {
  return <WorkspaceLayout portal="Customer" links={customerLinks} />;
}
function ManagerLayout() {
  return <WorkspaceLayout portal="Manager" links={managerLinks} />;
}
function WorkspaceLayout({ portal, links }: { portal: string; links: WorkspaceLink[] }) {
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
        <Brand />
        <small>{portal} PORTAL</small>
        <nav aria-label={`${portal} navigation`}>
          {links.map((link) => (
            <NavLink key={link.to} to={link.to} onClick={() => setMenu(false)}>
              {link.label}
            </NavLink>
          ))}
        </nav>
        <div className="support">
          <strong>Transit Support</strong>
          <p>Contact your assigned team.</p>
        </div>
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
          <span>International horse transport</span>
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
function StaffLanding() {
  const session = useSession();
  if (!session) return <Navigate to="/login" replace />;
  if (session.role === 'CUSTOMER') return <Navigate to="/customer/horses" replace />;
  if (session.role === 'MANAGER') return <Navigate to="/manager/requests" replace />;
  return (
    <section className="auth-card">
      <h1>{session.role} access</h1>
      <Notice>
        {session.role === 'DRIVER'
          ? 'The driver operations portal is not available in this release.'
          : 'Your account is signed in. This role workspace is not available in this release.'}
      </Notice>
      <button onClick={clearSession}>Log Out</button>
    </section>
  );
}
function NotFound() {
  return (
    <section className="auth-card">
      <h1>Page not found</h1>
      <Link to="/">Return home</Link>
    </section>
  );
}
function Root() {
  const location = useLocation();
  useEffect(() => {
    if (!['/verify-email', '/reset-password'].includes(location.pathname)) clearCapturedToken();
  }, [location.pathname]);
  return <Outlet />;
}
export const router = createBrowserRouter([
  {
    element: <Root />,
    errorElement: (
      <section className="auth-card">
        <h1>Something went wrong</h1>
        <p>Please reload this page. Your session may require signing in again.</p>
        <a href="/">Return home</a>
      </section>
    ),
    children: [
      {
        element: <PublicLayout />,
        children: [
          { path: '/', element: <Home /> },
          { path: '/login', element: <LoginPage /> },
          { path: '/register', element: <RegisterPage /> },
          { path: '/verify-email', element: <VerifyPage /> },
          { path: '/verification-sent', element: <VerificationSentPage /> },
          {
            path: '/resend-verification',
            element: <EmailRequestPage action="resend-verification" />,
          },
          { path: '/forgot-password', element: <EmailRequestPage /> },
          { path: '/reset-password', element: <ResetPage /> },
          { path: '/staff', element: <StaffLanding /> },
        ],
      },
      {
        element: <RoleGate roles={['CUSTOMER']} />,
        children: [
          {
            path: '/customer',
            element: <CustomerLayout />,
            children: [
              { index: true, element: <Navigate to="horses" replace /> },
              { path: 'account', element: <AccountPage /> },
              { path: 'horses', element: <HorsesPage /> },
              { path: 'horses/new', element: <HorseEditor /> },
              { path: 'horses/:id', element: <HorseDetailPage /> },
              { path: 'horses/:id/edit', element: <HorseEditPage /> },
              { path: 'requests', element: <OpenDraftPage /> },
              { path: 'requests/new', element: <OrderEditor /> },
              { path: 'requests/:id', element: <OrderPage /> },
            ],
          },
        ],
      },
      {
        element: <RoleGate roles={['MANAGER']} />,
        children: [
          {
            path: '/manager',
            element: <ManagerLayout />,
            children: [
              { index: true, element: <Navigate to="requests" replace /> },
              { path: 'requests', element: <ManagerQueuePage /> },
              { path: 'staff', element: <ManagerStaffPage /> },
            ],
          },
        ],
      },
      { path: '*', element: <PublicLayout />, children: [{ path: '*', element: <NotFound /> }] },
    ],
  },
]);
