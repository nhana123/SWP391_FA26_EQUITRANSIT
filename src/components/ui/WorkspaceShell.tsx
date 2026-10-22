import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useSession } from '../../shared/api/session';
import { signOut } from '../../shared/api/refresh';
import { NotificationBell } from '../../features/activity-customer/notifications';
import { Icon, navigationIcon } from './Icons';
export const portalNames: Record<string, string> = {
  CUSTOMER: 'CUSTOMER PORTAL',
  MANAGER: 'MANAGER CONSOLE',
  COORDINATOR: 'COORDINATOR STUDIO',
  SPECIALIST: 'SPECIALIST DESK',
  DRIVER: 'DRIVER OPS',
};
export function Brand({ to = '/' }: { to?: string }) {
  return (
    <Link className="brand" to={to}>
      <span className="brand-mark">
        <Icon name="shield" size={26} />
      </span>
      EquiTransit
    </Link>
  );
}
export function WorkspaceShell({
  home,
  links,
  navigationLabel,
  aliases,
}: {
  home: string;
  links: { to: string; label: string }[];
  navigationLabel: string;
  /** Path prefixes that belong to a link without being listed, e.g. a hidden route. */
  aliases?: Record<string, string>;
}) {
  const [menu, setMenu] = useState(false);
  const location = useLocation();
  const focusRef = useRef<HTMLElement>(null);
  const session = useSession();
  const role = session?.role ?? 'CUSTOMER';
  const under = (path: string) =>
    location.pathname === path || location.pathname.startsWith(`${path}/`);
  const aliasTarget = Object.entries(aliases ?? {}).find(([path]) => under(path))?.[1];
  const active =
    [...links].sort((a, b) => b.to.length - a.to.length).find((link) => under(link.to)) ??
    links.find((link) => link.to === aliasTarget);
  useEffect(() => {
    focusRef.current?.focus({ preventScroll: true });
  }, [location.pathname]);
  return (
    <div
      className="workspace"
      onKeyDown={(event) => {
        if (event.key === 'Escape') setMenu(false);
      }}
    >
      <a className="skip" href="#main">
        Skip to content
      </a>
      <aside id="workspace-navigation" className={menu ? 'sidebar open' : 'sidebar'}>
        <Brand to={home} />
        <small className="portal-label">{portalNames[role]}</small>
        <span className="nav-caption">WORKSPACE</span>
        <nav aria-label={navigationLabel}>
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={links.some(
                (other) => other.to !== link.to && other.to.startsWith(`${link.to}/`),
              )}
              className={({ isActive }) =>
                isActive || link.to === aliasTarget ? 'active' : undefined
              }
              onClick={() => setMenu(false)}
            >
              <Icon name={navigationIcon(link.to)} />
              <span>{link.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="support">
          <span className="support-icon">
            <Icon name="headset" size={22} />
          </span>
          <strong>Transit Support</strong>
          <p>Your dedicated coordination team.</p>
          <small>Care at every checkpoint</small>
        </div>
      </aside>
      {menu && (
        <button
          className="navigation-scrim"
          aria-label="Close navigation"
          onClick={() => setMenu(false)}
        />
      )}
      <div className="workspace-main">
        <header className="workspace-header">
          <button
            className="menu-button"
            type="button"
            aria-expanded={menu}
            aria-controls="workspace-navigation"
            aria-label="Toggle navigation"
            onClick={() => setMenu((v) => !v)}
          >
            <Icon name="menu" />
          </button>
          <nav className="breadcrumbs" aria-label="Breadcrumb">
            <Link to={home}>Workspace</Link>
            <span aria-hidden="true">/</span>
            <span>{active?.label ?? 'Journey details'}</span>
          </nav>
          <span className="timezone-chip">
            <Icon name="globe" size={14} />
            GMT+07:00
          </span>
          <div className="header-actions">
            <NotificationBell />
            <div className="profile-chip">
              <span className="profile-avatar">{role.slice(0, 2)}</span>
              <span>
                <strong>{role.charAt(0) + role.slice(1).toLowerCase()}</strong>
                <small>{portalNames[role]}</small>
              </span>
            </div>
            <button className="logout-button" type="button" onClick={() => void signOut()}>
              <Icon name="logout" size={17} />
              <span>Log Out</span>
            </button>
          </div>
        </header>
        <main id="main" ref={focusRef} tabIndex={-1} className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
