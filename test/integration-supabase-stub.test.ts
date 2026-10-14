/**
 * Integration test of the REAL server (buildServer) and REAL Supabase client over HTTP.
 * The remote end is a small local STUB that speaks the PostgREST/Auth wire format and applies
 * the same access split as the migrations: anon/user tokens are scoped, only the service key
 * can write recommendations, change status, or read all rows. This is NOT a Supabase emulator,
 * and it does not prove the SQL policies. Those need a real Supabase project to verify.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { buildServer } from '../server/index';
import { BUNDLED_COMPONENTS, BUNDLED_PROJECTS } from '../src/data/catalog';

const ANON = 'anon-stub-key';
const SERVICE = 'service-stub-key';
const USERS = {
  maker: { id: '11111111-1111-4111-8111-111111111111', email: 'maker@example.com', token: 'jwt-maker', role: 'user' },
  admin: { id: '33333333-3333-4333-8333-333333333333', email: 'admin@example.com', token: 'jwt-admin', role: 'admin' },
} as const;

const stubRows = { submissions: [] as any[], recs: [] as any[] };
const calls: { method: string; path: string; auth: string; apikey: string }[] = [];

function startStub(): Promise<{ server: Server; url: string }> {
  const handler = (req: IncomingMessage, res: ServerResponse) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const url = new URL(req.url ?? '/', 'http://stub');
      const auth = String(req.headers.authorization ?? '').replace(/^Bearer /, '');
      const apikey = String(req.headers.apikey ?? '');
      calls.push({ method: req.method ?? 'GET', path: url.pathname + url.search, auth, apikey });
      const send = (status: number, data: unknown) => {
        res.writeHead(status, { 'content-type': 'application/json' });
        res.end(data === undefined ? '' : JSON.stringify(data));
      };
      const userByToken = Object.values(USERS).find((u) => u.token === auth);
      const isService = apikey === SERVICE && auth === SERVICE;

      if (url.pathname === '/auth/v1/user') {
        return userByToken ? send(200, { id: userByToken.id, email: userByToken.email }) : send(401, { msg: 'invalid JWT' });
      }
      if (!apikey || (apikey !== ANON && apikey !== SERVICE)) return send(401, { message: 'No API key' });

      if (url.pathname === '/rest/v1/components') {
        const [s, e] = String(req.headers.range ?? '0-999').split('-').map(Number);
        const rows = BUNDLED_COMPONENTS.slice(s, e + 1).map((c) => ({
          id: c.id, name: c.name, category: c.category, description: c.description, unit_price: c.unitPrice,
          weight_grams: c.weightGrams, specs: c.specs, compatibility: c.compatibility, is_active: true,
        }));
        return send(200, rows);
      }
      if (url.pathname === '/rest/v1/products') {
        const [s, e] = String(req.headers.range ?? '0-999').split('-').map(Number);
        const rows = BUNDLED_PROJECTS.slice(s, e + 1).map((p) => ({
          id: p.id, name: p.name, aliases: p.aliases, category: p.category, description: p.description, difficulty: p.difficulty,
          duration_minutes: p.durationMinutes, new_product_price: p.newProductPrice, consumables_cost: p.consumablesCost,
          icon: p.icon, requires_spec_check: p.requiresSpecCheck, instructions: p.instructions, safety_notes: p.safety,
          compatibility_notes: p.compatibilityNotes, is_active: true,
          product_requirements: p.requirements.map((r) => ({ component_id: r.componentId, required_quantity: r.quantity, compatible_alternatives: r.alternatives ?? [], is_critical: !!r.critical })),
        }));
        return send(200, rows);
      }
      if (url.pathname === '/rest/v1/profiles') {
        const id = url.searchParams.get('id')?.replace('eq.', '') ?? '';
        const u = Object.values(USERS).find((x) => x.id === id);
        return send(200, u ? [{ role: u.role, email: u.email }] : []);
      }
      if (url.pathname === '/rest/v1/ewaste_submissions') {
        if (req.method === 'POST') {
          if (!userByToken) return send(401, { message: 'RLS: no user' });
          const row = JSON.parse(body);
          if (row.user_id !== userByToken.id) return send(403, { message: 'new row violates RLS policy' });
          const rec = { id: randomUUID(), status: 'pending', reviewer_id: null, reviewer_notes: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...row };
          stubRows.submissions.push(rec);
          return send(201, [rec]);
        }
        if (req.method === 'PATCH') {
          if (!isService) return send(403, { message: 'RLS: admin update only' });
          const id = url.searchParams.get('id')!.replace('eq.', '');
          const rec = stubRows.submissions.find((s) => s.id === id);
          if (!rec) return send(200, []);
          Object.assign(rec, JSON.parse(body));
          return send(200, [{ ...rec, profiles: { email: USERS.maker.email } }]);
        }
        // GET
        if (url.searchParams.get('select')?.includes('profiles(email)')) {
          if (!isService) return send(403, { message: 'RLS: admin read only' });
          return send(200, stubRows.submissions.map((s) => ({ ...s, profiles: { email: USERS.maker.email } })));
        }
        if (!userByToken) return send(200, []);
        const id = url.searchParams.get('id')?.replace('eq.', '');
        const mine = stubRows.submissions.filter((s) => s.user_id === userByToken.id && (!id || s.id === id));
        return send(200, mine);
      }
      if (url.pathname === '/rest/v1/reuse_recommendations') {
        if (req.method === 'POST') {
          if (!isService) return send(403, { message: 'RLS: recommendations are written by the server only' });
          stubRows.recs.push(...JSON.parse(body));
          return send(201, undefined);
        }
        if (req.method === 'DELETE') {
          if (!isService) return send(403, { message: 'RLS denied' });
          const id = url.searchParams.get('submission_id')!.replace('eq.', '');
          for (let i = stubRows.recs.length - 1; i >= 0; i--) if (stubRows.recs[i].submission_id === id) stubRows.recs.splice(i, 1);
          return send(204, undefined);
        }
        const id = url.searchParams.get('submission_id')!.replace('eq.', '');
        return send(200, userByToken ? stubRows.recs.filter((r) => r.submission_id === id && r.user_id === userByToken.id) : []);
      }
      send(404, { message: 'stub: unknown path' });
    });
  };
  return new Promise((resolve) => {
    const s = createServer(handler);
    s.listen(0, '127.0.0.1', () => resolve({ server: s, url: `http://127.0.0.1:${(s.address() as { port: number }).port}` }));
  });
}

let stub: { server: Server; url: string };
let app: { server: Server; cfg: unknown };
let base: string;

before(async () => {
  stub = await startStub();
  app = buildServer({
    SUPABASE_URL: stub.url, SUPABASE_ANON_KEY: ANON, SUPABASE_SERVICE_ROLE_KEY: SERVICE, ANTHROPIC_API_KEY: '',
  } as NodeJS.ProcessEnv);
  await new Promise<void>((resolve) => app.server.listen(0, '127.0.0.1', () => resolve()));
  base = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;
});
after(async () => {
  await new Promise<void>((r) => app.server.close(() => r()));
  await new Promise<void>((r) => stub.server.close(() => r()));
});

const api = (path: string, opts: { method?: string; token?: string; body?: unknown } = {}) =>
  fetch(base + path, {
    method: opts.method ?? 'GET',
    headers: { ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}), ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });

const sub = {
  deviceType: 'Printer', brand: 'Canon', model: null, condition: 'Unknown', ageYears: 3, notes: null,
  availableComponents: [
    { componentId: 'ultrasonic', quantity: 1, condition: 'Working' },
    { componentId: 'servo', quantity: 1, condition: 'Working' },
    { componentId: 'arduino-uno', quantity: 1, condition: 'Working' },
    { componentId: 'jumper', quantity: 12, condition: 'Working' },
    { componentId: 'breadboard', quantity: 1, condition: 'Working' },
    { componentId: 'power-supply', quantity: 1, condition: 'Working' },
  ],
};

test('health reports the database as configured through the real client', async () => {
  const body = await (await api('/api/health')).json();
  assert.equal(body.database, 'configured');
  assert.equal(body.ai, 'not_configured');
});

test('the server loads the full catalogue from the stub using the anon key', async () => {
  const r = await api('/api/submissions', { method: 'POST', token: USERS.maker.token, body: { ...sub, brand: '' } });
  assert.equal(r.status, 422, 'validation runs against the database-loaded catalogue');
  const reqs = calls.filter((c) => c.path.startsWith('/rest/v1/components'));
  assert.ok(reqs.length >= 1);
  assert.equal(reqs[0].apikey, ANON, 'catalogue reads use the public anon key');
});

test('valid submission is inserted with the USER token, so the stub’s RLS check passes', async () => {
  const r = await api('/api/submissions', { method: 'POST', token: USERS.maker.token, body: sub });
  assert.equal(r.status, 201);
  const insert = calls.find((c) => c.method === 'POST' && c.path.startsWith('/rest/v1/ewaste_submissions'));
  assert.equal(insert!.auth, USERS.maker.token, 'insert must not use the service key');
});

test('recommendations are generated on the server and written with the SERVICE key', async () => {
  const id = (await (await api('/api/submissions', { token: USERS.maker.token })).json()).submissions[0].id;
  const r = await api(`/api/submissions/${id}/recommendations`, { method: 'POST', token: USERS.maker.token });
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(body.source, 'rule_based');
  assert.ok(body.recommendations.length > 0);
  const write = calls.filter((c) => c.method === 'POST' && c.path.startsWith('/rest/v1/reuse_recommendations')).pop();
  assert.equal(write!.auth, SERVICE);
  // reading it back with the user's token returns the stored rows
  const again = await (await api(`/api/submissions/${id}/recommendations`, { token: USERS.maker.token })).json();
  assert.equal(again.recommendations.length, body.recommendations.length);
});

test('admin list and status change work for admins only, through the real client', async () => {
  assert.equal((await api('/api/admin/submissions', { token: USERS.maker.token })).status, 403);
  const list = await api('/api/admin/submissions', { token: USERS.admin.token });
  assert.equal(list.status, 200);
  const { submissions } = await list.json();
  const target = submissions[0];
  const up = await api(`/api/admin/submissions/${target.id}`, { method: 'PATCH', token: USERS.admin.token, body: { status: 'accepted', reviewerNotes: 'Parts look good.' } });
  assert.equal(up.status, 200);
  assert.equal((await up.json()).submission.status, 'accepted');
  const patch = calls.filter((c) => c.method === 'PATCH').pop();
  assert.equal(patch!.auth, SERVICE, 'status change uses the service key after the server role check');
});

test('a forged token is rejected before any database call', async () => {
  const before = calls.length;
  assert.equal((await api('/api/submissions', { token: 'forged' })).status, 401);
  assert.equal(calls.slice(before).filter((c) => c.path.startsWith('/rest/v1/ewaste')).length, 0);
});

test('no response body leaks the anon or service key', async () => {
  const texts = await Promise.all([
    api('/api/health').then((r) => r.text()),
    api('/api/submissions', { token: USERS.maker.token }).then((r) => r.text()),
    api('/api/admin/submissions', { token: USERS.maker.token }).then((r) => r.text()),
  ]);
  for (const t of texts) {
    assert.ok(!t.includes(SERVICE) && !t.includes(ANON), 'secrets must never appear in responses');
  }
});
