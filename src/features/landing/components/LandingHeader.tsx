import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useSession } from '../../../shared/api/session';
import { signOut } from '../../../shared/api/refresh';
import { NotificationBell } from '../../activity-customer/notifications';
import { Icon } from '../../../components/ui/Icons';
import type { Role } from '../../../shared/api/contracts';

function getWorkspaceUrl(role: Role): string {
  return role === 'CUSTOMER' ? '/customer/horses' : '/staff';
}

export function LandingHeader() {
  const session = useSession();
  const navigate = useNavigate();

  const handleAccountClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (session) {
      navigate(getWorkspaceUrl(session.role));
    } else {
      navigate('/login');
    }
  };

  return (
    <header className="landing-header">
      <Link to="/" className="landing-brand">
        <div className="landing-brand-logo">
          <Icon name="shield" size={22} />
        </div>
        <span>EquiTransit</span>
      </Link>

      <nav aria-label="Main navigation" style={{ display: 'flex', alignItems: 'center', gap: 32 }}>
        <ul className="landing-nav-links">
          <li>
            <NavLink
              to="/"
              end
              className={({ isActive }) => `landing-nav-link ${isActive ? 'active' : ''}`}
            >
              Home
            </NavLink>
          </li>
          <li>
            <NavLink
              to="/transport"
              className={({ isActive }) => `landing-nav-link ${isActive ? 'active' : ''}`}
            >
              Transport
            </NavLink>
          </li>
          <li>
            <NavLink
              to="/pricing"
              className={({ isActive }) => `landing-nav-link ${isActive ? 'active' : ''}`}
            >
              Pricing
            </NavLink>
          </li>
          <li>
            <NavLink
              to="/how-it-works"
              className={({ isActive }) => `landing-nav-link ${isActive ? 'active' : ''}`}
            >
              How It Works
            </NavLink>
          </li>
          <li>
            <a
              href="#account"
              onClick={handleAccountClick}
              className="landing-nav-link"
              title={session ? 'Vào không gian làm việc' : 'Đăng nhập vào tài khoản'}
            >
              Account
            </a>
          </li>
        </ul>

        <div className="landing-header-actions">
          {session ? (
            <>
              <NotificationBell />
              <Link className="landing-btn-gold button primary" to={getWorkspaceUrl(session.role)}>
                My Workspace
              </Link>
              <button
                type="button"
                className="landing-btn-outline"
                onClick={() => void signOut()}
                title="Đăng xuất khỏi phiên hiện tại"
              >
                Log Out
              </button>
            </>
          ) : (
            <>
              <Link to="/login" className="landing-btn-outline">
                Login
              </Link>
              <Link to="/register" className="landing-btn-gold button primary">
                Sign Up
              </Link>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}
