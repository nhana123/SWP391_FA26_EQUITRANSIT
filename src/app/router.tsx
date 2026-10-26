import { LandingHeader } from '../features/landing/components/LandingHeader';
import { LandingFooter } from '../features/landing/components/LandingFooter';
import { HomePage } from '../features/landing/pages/HomePage';
import { TransportPage } from '../features/landing/pages/TransportPage';
import { PricingPage } from '../features/landing/pages/PricingPage';
import { HowItWorksPage } from '../features/landing/pages/HowItWorksPage';
import { AccountRedirect } from '../features/landing/pages/AccountRedirect';
import { useEffect } from 'react';
import { WorkspaceShell } from '../components/ui/WorkspaceShell';
import { createBrowserRouter, Link, Navigate, Outlet, useLocation } from 'react-router-dom';
import {
  AccountPage,
  EmailRequestPage,
  LoginPage,
  RegisterPage,
  ResetPage,
  VerificationSentPage,
  VerifyPage,
} from '../features/auth/pages';
import {
  AssignedCasePage,
  AssignedCasesLayout,
  AssignedCasesPage,
} from '../features/assigned-cases/pages';
import { ManagerCasePage } from '../features/assessment/case';
import { ManagerLayout } from '../features/assessment/layout';
import { ManagerQueuePage } from '../features/assessment/pages';
import { ManagerStaffPage } from '../features/assessment/staff';
import { ManagerPricesPage } from '../features/service-pricing/ManagerPricesPage';
import {
  StaffAdministrationPage,
  CreateStaffPage,
  StaffAdministrationDetailPage,
} from '../features/staff-administration/pages';
import { PaymentsPage } from '../features/payments/pages';
import { HorseDetailPage, HorseEditPage, HorseEditor, HorsesPage } from '../features/horses/pages';
import { OrderEditor } from '../features/transport-orders/pages';
import { RequestDetailPage, RequestsPage } from '../features/transport-orders/status';
import { QuotationDetailPage, QuotationsPage } from '../features/quotations/pages';
import { PrepareQuotationPage } from '../features/quotations/prepare';
import { ManagerQuotationDetailPage } from '../features/quotations/manager-actions';
import { CustomerQuotationDetailPage } from '../features/quotations/customer-actions';
import { ManagerResourcesPage } from '../features/resources/ManagerResourcesPage';
import { CaseAvailabilityPage } from '../features/resources/availability';
import { PlansPage } from '../features/plans/PlansPage';
import { PlanDetailPage } from '../features/plans/PlanDetailPage';
import { DeparturePage, DriverHome, DriverLayout } from '../features/departure/DeparturePage';
import { staffDashboardRoute, staffTaskRoute } from '../features/activity-operations/routes';
import { StaffDashboardPage } from '../features/activity-operations/StaffDashboard';
import { ExecutionPage } from '../features/execution/ExecutionPage';
import { CustomerCompliancePage } from '../features/compliance/CustomerCompliancePage';
import { SpecialistCompliancePage } from '../features/compliance/SpecialistCompliancePage';
import { CustomerDashboardPage } from '../features/activity-customer/dashboard';
import { NotificationsPage } from '../features/activity-customer/notifications';
import { EmailPreferencesPage } from '../features/activity-customer/preferences';
import { ManagerAuditPage, ManagerFinancialPage } from '../features/activity-reports/pages';
import {
  CustomerHandoverPage,
  ManagerSettlementPage,
  StaffActualCostsPage,
} from '../features/settlement/pages';
import { CoordinatorRoutesPage } from '../features/coordinator/CoordinatorRoutesPage';
import { CoordinatorHubsPage } from '../features/coordinator/CoordinatorHubsPage';
import { signOut } from '../shared/api/refresh';
import { useSession } from '../shared/api/session';
import { clearCapturedToken } from '../shared/lib/token';
import { Notice } from '../shared/ui/common';
import type { Role } from '../shared/api/contracts';


function PublicLayout() {
  return (
    <>
      <a className="skip" href="#main">
        Skip to content
      </a>
      <LandingHeader />
      <main id="main" className="landing-main">
        <Outlet />
      </main>
      <LandingFooter />
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
function CustomerLayout() {
  return (
    <WorkspaceShell
      home="/customer/dashboard"
      navigationLabel="Customer navigation"
      links={[
        { to: '/customer/dashboard', label: 'Dashboard' },
        { to: '/customer/horses', label: 'My Horses' },
        { to: '/customer/requests', label: 'Requests' },
        { to: '/customer/account', label: 'Account' },
        { to: '/customer/notification-preferences', label: 'Email preferences' },
      ]}
    />
  );
}
function StaffLanding() {
  const session = useSession();
  if (!session) return <Navigate to="/login" replace />;
  if (session.role === 'CUSTOMER') return <Navigate to="/customer/horses" replace />;
  if (session.role === 'MANAGER') return <Navigate to="/manager/requests" replace />;
  if (session.role === 'SPECIALIST' || session.role === 'COORDINATOR')
    return <Navigate to="/staff/cases" replace />;
  if (session.role === 'DRIVER') return <Navigate to="/driver" replace />;
  return (
    <section className="auth-card">
      <h1>{session.role} access</h1>
      <Notice>
        Your account is signed in. This role workspace is not available in this release.
      </Notice>
      <button onClick={() => void signOut()}>Log Out</button>
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
          { path: '/', element: <HomePage /> },
          { path: '/transport', element: <TransportPage /> },
          { path: '/pricing', element: <PricingPage /> },
          { path: '/how-it-works', element: <HowItWorksPage /> },
          { path: '/account', element: <AccountRedirect /> },
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
        element: (
          <RoleGate roles={['CUSTOMER', 'MANAGER', 'SPECIALIST', 'COORDINATOR', 'DRIVER']} />
        ),
        children: [
          {
            element: <PublicLayout />,
            children: [{ path: '/notifications', element: <NotificationsPage /> }],
          },
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
              { path: 'dashboard', element: <CustomerDashboardPage /> },
              { path: 'notification-preferences', element: <EmailPreferencesPage /> },
              { path: 'horses', element: <HorsesPage /> },
              { path: 'horses/new', element: <HorseEditor /> },
              { path: 'horses/:id', element: <HorseDetailPage /> },
              { path: 'horses/:id/edit', element: <HorseEditPage /> },
              { path: 'requests', element: <RequestsPage /> },
              { path: 'requests/new', element: <OrderEditor /> },
              { path: 'requests/:id', element: <RequestDetailPage /> },
              { path: 'requests/:id/handover', element: <CustomerHandoverPage /> },
              { path: 'requests/:id/payments', element: <PaymentsPage /> },
              { path: 'requests/:id/quotes', element: <QuotationsPage /> },
              { path: 'requests/:id/quotes/:quoteId', element: <CustomerQuotationDetailPage /> },
              { path: 'requests/:id/compliance', element: <CustomerCompliancePage /> },
              { path: 'requests/:id/execution', element: <ExecutionPage /> },
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
              { path: 'dashboard', element: <StaffDashboardPage /> },
              { path: 'requests', element: <ManagerQueuePage /> },
              { path: 'requests/:id', element: <ManagerCasePage /> },
              { path: 'requests/:id/settlement', element: <ManagerSettlementPage /> },
              { path: 'requests/:id/payments', element: <PaymentsPage /> },
              { path: 'requests/:id/quotes', element: <QuotationsPage /> },
              { path: 'requests/:id/quotes/prepare', element: <PrepareQuotationPage /> },
              { path: 'requests/:id/quotes/:quoteId', element: <ManagerQuotationDetailPage /> },
              { path: 'staff', element: <ManagerStaffPage /> },
              { path: 'staff-administration', element: <StaffAdministrationPage /> },
              { path: 'staff-administration/new', element: <CreateStaffPage /> },
              { path: 'staff-administration/:staffId', element: <StaffAdministrationDetailPage /> },
              { path: 'service-prices', element: <ManagerPricesPage /> },
              { path: 'hubs', element: <CoordinatorHubsPage /> },
              { path: 'resources', element: <ManagerResourcesPage /> },
              { path: 'reports/financial', element: <ManagerFinancialPage /> },
              { path: 'audit-events', element: <ManagerAuditPage /> },
              { path: 'requests/:id/availability', element: <CaseAvailabilityPage /> },
              { path: 'requests/:id/plans', element: <PlansPage /> },
              { path: 'requests/:id/plans/:planId', element: <PlanDetailPage /> },
              { path: 'requests/:id/departure', element: <DeparturePage /> },
              { path: 'requests/:id/execution', element: <ExecutionPage /> },
            ],
          },
        ],
      },
      {
        element: <RoleGate roles={['SPECIALIST', 'COORDINATOR']} />,
        children: [
          staffTaskRoute,
          staffDashboardRoute,
          {
            path: '/staff/cases',
            element: <AssignedCasesLayout />,
            children: [
              { index: true, element: <AssignedCasesPage /> },
              { path: ':id', element: <AssignedCasePage /> },
              {
                element: <RoleGate roles={['COORDINATOR']} />,
                children: [
                  { path: ':id/quotes', element: <QuotationsPage /> },
                  { path: ':id/quotes/prepare', element: <PrepareQuotationPage /> },
                  { path: ':id/quotes/:quoteId', element: <QuotationDetailPage /> },
                  { path: ':id/availability', element: <CaseAvailabilityPage /> },
                  { path: ':id/plans', element: <PlansPage /> },
                  { path: ':id/plans/:planId', element: <PlanDetailPage /> },
                  { path: ':id/departure', element: <DeparturePage /> },
                  { path: ':id/execution', element: <ExecutionPage /> },
                  { path: ':id/actual-costs', element: <StaffActualCostsPage /> },
                ],
              },
              {
                element: <RoleGate roles={['SPECIALIST']} />,
                children: [{ path: ':id/compliance', element: <SpecialistCompliancePage /> }],
              },
            ],
          },
          {
            element: <RoleGate roles={['COORDINATOR']} />,
            children: [
              {
                element: <AssignedCasesLayout />,
                children: [
                  { path: '/coordinator/routes', element: <CoordinatorRoutesPage /> },
                ],
              },
            ],
          },
        ],
      },
      {
        element: <RoleGate roles={['DRIVER']} />,
        children: [
          {
            path: '/driver',
            element: <DriverLayout />,
            children: [
              { index: true, element: <DriverHome /> },
              { path: 'dashboard', element: <StaffDashboardPage /> },
              { path: 'orders/:id/departure', element: <DeparturePage /> },
              { path: 'orders/:id/execution', element: <ExecutionPage /> },
            ],
          },
        ],
      },
      { path: '*', element: <PublicLayout />, children: [{ path: '*', element: <NotFound /> }] },
    ],
  },
]);
