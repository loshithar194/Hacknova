import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { aiConfigured, databaseConfigured, loadConfig } from './config';
import { createAnthropicClient } from './ai';
import { createApp } from './app';
import { createSupabaseClient } from './supabase';
import { serveStatic } from './static';

/** Production and development entry point. Run with: npm run api */
export function buildServer(env: NodeJS.ProcessEnv = process.env) {
  const cfg = loadConfig(env);
  const dbOn = databaseConfigured(cfg);
  const client = dbOn ? createSupabaseClient({ url: cfg.supabaseUrl!, anonKey: cfg.supabaseAnonKey!, serviceRoleKey: cfg.supabaseServiceRoleKey }) : null;
  const ai = cfg.anthropicApiKey ? createAnthropicClient({ apiKey: cfg.anthropicApiKey, model: cfg.anthropicModel }) : null;
  const api = createApp({
    db: client?.db ?? null,
    verifyAccessToken: client?.verifyAccessToken ?? null,
    ai,
    aiModel: aiConfigured(cfg) ? cfg.anthropicModel : null,
  });
  const staticHandler = cfg.distDir && existsSync(cfg.distDir) ? serveStatic(cfg.distDir) : null;

  const allowedOrigins = (env.ALLOWED_ORIGINS ?? '').split(',').map((o) => o.trim()).filter(Boolean);

  const server = createServer((req, res) => {
    const path = (req.url ?? '/').split('?')[0];
    if (path.startsWith('/api/')) {
      // CORS is off unless ALLOWED_ORIGINS lists exact origins. Same-origin deployments need none.
      const origin = req.headers.origin;
      if (origin && allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Vary', 'Origin');
        res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
      }
      if (req.method === 'OPTIONS') return void res.writeHead(204).end();
      return void api(req, res);
    }
    if (staticHandler && (req.method === 'GET' || req.method === 'HEAD') && staticHandler(req, res)) return;
    res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
  });
  return { server, cfg };
}

const isMain = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isMain || process.env.START_SERVER === '1') {
  const { server, cfg } = buildServer();
  server.listen(cfg.port, () => {
    console.log(`SecondLife API listening on http://localhost:${cfg.port}`);
    console.log(`  database: ${databaseConfigured(cfg) ? 'configured' : 'NOT configured'}`);
    console.log(`  AI:       ${aiConfigured(cfg) ? 'configured' : 'NOT configured (rule-based results only)'}`);
  });
}
