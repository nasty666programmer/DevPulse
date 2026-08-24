import { useCallback, useEffect, useState } from 'react';
import { fetchCurrentUser, signInWithGoogle, signOut as apiSignOut } from '../api/auth';
import type { AuthUserDto } from '../types';

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

export function useAuth() {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<AuthUserDto | null>(null);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    let cancelled = false;

    fetchCurrentUser()
      .then((found) => {
        if (cancelled) return;
        setUser(found);
        setStatus(found ? 'authenticated' : 'unauthenticated');
      })
      .catch(() => {
        if (cancelled) return;
        setStatus('unauthenticated');
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback(async (idToken: string) => {
    setErrorMessage('');
    try {
      const signedInUser = await signInWithGoogle(idToken);
      setUser(signedInUser);
      setStatus('authenticated');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Не удалось войти через Google.');
    }
  }, []);

  const signOut = useCallback(async () => {
    // Clear local state regardless of whether the request succeeds — an
    // already-expired or already-cleared cookie shouldn't strand the user
    // on the authenticated view with no way back to the gate.
    try {
      await apiSignOut();
    } finally {
      setUser(null);
      setStatus('unauthenticated');
    }
  }, []);

  return { status, user, errorMessage, signIn, signOut };
}
