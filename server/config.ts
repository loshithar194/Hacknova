/** Server configuration. Secrets are read from the environment only and never logged. */
export interface ServerConfig {
  port: number;
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  supabaseServiceRoleKey?: string;
  anthropicApiKey?: string;
  anthropicModel: string;
  distDir?: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const clean = (v?: string) => (v && v.trim() ? v.trim() : undefined);
  return {
    port: Number(env.API_PORT ?? env.PORT ?? 8787),
    supabaseUrl: clean(env.SUPABASE_URL) ?? clean(env.VITE_SUPABASE_URL),
    supabaseAnonKey: clean(env.SUPABASE_ANON_KEY) ?? clean(env.VITE_SUPABASE_ANON_KEY),
    supabaseServiceRoleKey: clean(env.SUPABASE_SERVICE_ROLE_KEY),
    anthropicApiKey: clean(env.ANTHROPIC_API_KEY),
    anthropicModel: clean(env.ANTHROPIC_MODEL) ?? 'claude-haiku-5-5',
    distDir: clean(env.SERVE_DIST_DIR),
  };
}

export function databaseConfigured(c: ServerConfig): boolean {
  return Boolean(c.supabaseUrl && c.supabaseAnonKey);
}

export function aiConfigured(c: ServerConfig): boolean {
  return Boolean(c.anthropicApiKey);
}
