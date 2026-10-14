import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { readPublicConfig, supabaseConfigured, type PublicConfig } from '../services/config';
import { apiRequest, ApiError } from '../services/api';
import {
  clearSession, loadSession, saveSession, signInWithPassword, signOutRemote, signUpWithPassword,
  type AuthOutcome, type StoredSession,
} from '../services/supabaseAuth';

interface SessionValue {
  config: PublicConfig;
  configured: boolean;
  session: StoredSession | null;
  role: 'user' | 'admin' | null;
  checking: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (input: { email: string; password: string; fullName: string }) => Promise<AuthOutcome>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<SessionValue | null>(null);

export function SupabaseSessionProvider({ children }: { children: ReactNode }) {
  const config = useMemo(() => readPublicConfig(), []);
  const configured = supabaseConfigured(config);
  const [session, setSession] = useState<StoredSession | null>(() => (configured ? loadSession() : null));
  const [role, setRole] = useState<'user' | 'admin' | null>(null);
  const [checking, setChecking] = useState(false);

  // Verify the stored token with the server. An expired or revoked token is cleared, not trusted.
  useEffect(() => {
    if (!session) {
      setRole(null);
      return;
    }
    let cancelled = false;
    setChecking(true);
    apiRequest<{ role: 'user' | 'admin' }>(config.apiBase, '/api/me', { token: session.accessToken })
      .then((me) => { if (!cancelled) setRole(me.role); })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          clearSession();
          setSession(null);
        }
        setRole(null);
      })
      .finally(() => { if (!cancelled) setChecking(false); });
    return () => { cancelled = true; };
  }, [session, config.apiBase]);

  const signIn = useCallback(async (email: string, password: string) => {
    const s = await signInWithPassword({ url: config.supabaseUrl!, anonKey: config.supabaseAnonKey! }, email, password);
    saveSession(s);
    setSession(s);
  }, [config]);

  const signUp = useCallback(async (input: { email: string; password: string; fullName: string }) => {
    const out = await signUpWithPassword({ url: config.supabaseUrl!, anonKey: config.supabaseAnonKey! }, input);
    if (out.kind === 'session') {
      saveSession(out.session);
      setSession(out.session);
    }
    return out;
  }, [config]);

  const signOut = useCallback(async () => {
    if (session && configured) await signOutRemote({ url: config.supabaseUrl!, anonKey: config.supabaseAnonKey! }, session.accessToken);
    clearSession();
    setSession(null);
    setRole(null);
  }, [session, configured, config]);

  const value: SessionValue = { config, configured, session, role, checking, signIn, signUp, signOut };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSupabaseSession(): SessionValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSupabaseSession must be used inside SupabaseSessionProvider');
  return v;
}
