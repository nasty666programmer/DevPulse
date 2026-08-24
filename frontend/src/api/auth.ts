import type { AuthUserDto } from '../types';
import { parseErrorMessage } from './http';

// credentials: 'include' on every call here (and only here) — the session
// lives in an httpOnly cookie set by the backend, and the frontend/backend
// may not share an origin in prod, so the browser needs telling explicitly
// to carry the cookie along.
export async function fetchCurrentUser(): Promise<AuthUserDto | null> {
  const res = await fetch('/auth/me', { credentials: 'include' });
  if (res.status === 401) {
    return null;
  }
  if (!res.ok) {
    throw new Error(await parseErrorMessage(res));
  }
  const data = (await res.json()) as { user: AuthUserDto };
  return data.user;
}

export async function signInWithGoogle(idToken: string): Promise<AuthUserDto> {
  const res = await fetch('/auth/google', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken }),
  });
  if (!res.ok) {
    throw new Error(await parseErrorMessage(res));
  }
  const data = (await res.json()) as { user: AuthUserDto };
  return data.user;
}

export async function signOut(): Promise<void> {
  const res = await fetch('/auth/logout', { method: 'POST', credentials: 'include' });
  if (!res.ok) {
    throw new Error(await parseErrorMessage(res));
  }
}
