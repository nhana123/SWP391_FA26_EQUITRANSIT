import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '../../../shared/api/session';

export function AccountRedirect() {
  const session = useSession();
  const navigate = useNavigate();

  useEffect(() => {
    if (session) {
      if (session.role === 'CUSTOMER') {
        navigate('/customer/horses', { replace: true });
      } else {
        navigate('/staff', { replace: true });
      }
    } else {
      navigate('/login', { replace: true });
    }
  }, [session, navigate]);

  return (
    <div style={{ padding: '60px 20px', textAlign: 'center', color: '#64748b' }}>
      <p>Đang chuyển hướng đến tài khoản của bạn...</p>
    </div>
  );
}
