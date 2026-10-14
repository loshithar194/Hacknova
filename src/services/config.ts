/**
 * Browser-visible configuration. Only VITE_* variables reach the bundle, so they must never
 * hold secrets. The Supabase anon key is public by design. Row Level Security protects the data.
 */
export interface PublicConfig {
  supabaseUrl: string | null;
  supabaseAnonKey: string | null;
  /** Base URL of the API. Empty means same origin (the Vite proxy in dev, the Node server in prod). */
  apiBase: string;
}

type EnvShape = Record<string, string | undefined>;

export function readPublicConfig(env: EnvShape = (import.meta as unknown as { env?: EnvShape }).env ?? {}): PublicConfig {
  const clean = (v?: string) => (v && v.trim() ? v.trim() : null);
  return {
    supabaseUrl: clean(env.VITE_SUPABASE_URL),
    supabaseAnonKey: clean(env.VITE_SUPABASE_ANON_KEY),
    apiBase: (clean(env.VITE_API_BASE_URL) ?? '').replace(/\/+$/, ''),
  };
}

export function supabaseConfigured(c: PublicConfig): boolean {
  return Boolean(c.supabaseUrl && c.supabaseAnonKey);
}
