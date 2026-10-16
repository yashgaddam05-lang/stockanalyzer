import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/components/auth/AuthProvider';

/**
 * Signs out and lands on the public home page. Navigates first so the RequireAuth guard does not
 * bounce the user to /login?next=... when the session disappears.
 */
export function useSignOutToHome() {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  return useCallback(async () => {
    navigate('/', { replace: true });
    await signOut();
  }, [navigate, signOut]);
}
