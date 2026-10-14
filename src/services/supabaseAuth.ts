/**
 * Supabase Auth over the REST endpoints (no SDK). Tokens are kept in localStorage, so they are
 * readable by page scripts. Use a strict Content Security Policy in production.
 */
export const SESSION_KEY = 'secondlife-supabase-session';

export interface StoredSession {
  accessToken: string;
  email: string;
}

export type AuthOutcome = { kind: 'session'; session: StoredSession } | { kind: 'confirm_email'; message: string };

export function loadSession(storage: Pick<Storage, 'getItem'> = localStorage): StoredSession | null {
  try {
    const raw = storage.getItem(SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as StoredSession;
    return s.accessToken ? s : null;
  } catch {
    return null;
  }
}

export function saveSession(s: StoredSession, storage: Pick<Storage, 'setItem'> = localStorage) {
  storage.setItem(SESSION_KEY, JSON.stringify(s));
}

export function clearSession(storage: Pick<Storage, 'removeItem'> = localStorage) {
  storage.removeItem(SESSION_KEY);
}

async function authError(res: Response, fallback: string): Promise<Error> {
  let msg = fallback;
  try {
    const body = (await res.json()) as { error_description?: string; msg?: string; message?: string };
    msg = body.error_description ?? body.msg ?? body.message ?? fallback;
  } catch {
    /* keep fallback */
  }
  return new Error(msg);
}

export async function signInWithPassword(
  cfg: { url: string; anonKey: string },
  email: string,
  password: string,
  fetchImpl: typeof fetch = fetch,
): Promise<StoredSession> {
  const res = await fetchImpl(`${cfg.url.replace(/\/+$/, '')}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: cfg.anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw await authError(res, 'Sign-in failed. Check your email and password.');
  const body = (await res.json()) as { access_token?: string; user?: { email?: string } };
  if (!body.access_token) throw new Error('Sign-in did not return a session.');
  return { accessToken: body.access_token, email: body.user?.email ?? email };
}

export async function signUpWithPassword(
  cfg: { url: string; anonKey: string },
  input: { email: string; password: string; fullName: string },
  fetchImpl: typeof fetch = fetch,
): Promise<AuthOutcome> {
  const res = await fetchImpl(`${cfg.url.replace(/\/+$/, '')}/auth/v1/signup`, {
    method: 'POST',
    headers: { apikey: cfg.anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: input.email, password: input.password, data: { full_name: input.fullName } }),
  });
  if (!res.ok) throw await authError(res, 'Could not create the account.');
  const body = (await res.json()) as { access_token?: string; user?: { email?: string } };
  if (body.access_token) return { kind: 'session', session: { accessToken: body.access_token, email: body.user?.email ?? input.email } };
  return {
    kind: 'confirm_email',
    message: 'Account created. Check your email to confirm it, then sign in.',
  };
}

export async function signOutRemote(cfg: { url: string; anonKey: string }, accessToken: string, fetchImpl: typeof fetch = fetch) {
  try {
    await fetchImpl(`${cfg.url.replace(/\/+$/, '')}/auth/v1/logout`, {
      method: 'POST',
      headers: { apikey: cfg.anonKey, Authorization: `Bearer ${accessToken}` },
    });
  } catch {
    /* local sign-out still proceeds */
  }
}
