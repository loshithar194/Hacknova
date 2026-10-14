import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSupabaseClient, DbError } from '../server/supabase';

type Call = { url: string; init: RequestInit };
function stubFetch(handler: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const fn = (async (url: string, init: RequestInit = {}) => {
    calls.push({ url: String(url), init });
    return handler(String(url), init);
  }) as unknown as typeof fetch;
  return { fn, calls };
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const CFG = { url: 'https://proj.supabase.co/', anonKey: 'anon-KEY', serviceRoleKey: 'service-KEY' };

test('catalogue loading follows every page until a short page, with no fixed cap', async () => {
  let pageNo = 0;
  const total = 1250; // three pages at 500 per page
  const { fn, calls } = stubFetch((url, init) => {
    const range = (init.headers as Record<string, string>).Range;
    const [start, end] = range.split('-').map(Number);
    if (url.includes('/components')) {
      const rows = Array.from({ length: Math.max(0, Math.min(end, total - 1) - start + 1) }, (_, i) => ({
        id: `c${start + i}`, name: 'C', category: 'Sensors', unit_price: 1, weight_grams: 1, specs: '', compatibility: '',
      }));
      return json(rows);
    }
    pageNo++;
    return json([]);
  });
  const client = createSupabaseClient(CFG, fn);
  const cat = await client.db.loadCatalogue();
  assert.equal(cat.components.length, total);
  assert.equal(cat.products.length, 0);
  assert.ok(calls.some((c) => (c.init.headers as Record<string, string>).Range === '1000-1499'));
  assert.ok(pageNo >= 1);
});

test('catalogue loading uses the service key only when configured, and never leaks it in errors', async () => {
  const { fn, calls } = stubFetch(() => new Response('oops', { status: 500 }));
  const client = createSupabaseClient({ url: CFG.url, anonKey: CFG.anonKey }, fn);
  await assert.rejects(() => client.db.loadCatalogue(), (e: DbError) => e instanceof DbError && e.status === 500 && !e.message.includes('anon-KEY'));
  const h = calls[0].init.headers as Record<string, string>;
  assert.equal(h.apikey, 'anon-KEY');
  assert.equal(h.Authorization, 'Bearer anon-KEY');
});

test('user-scoped writes send the user JWT, so RLS applies, not the service key', async () => {
  const { fn, calls } = stubFetch(() => json([{ id: 's1', user_id: 'u1', status: 'pending' }], 201));
  const client = createSupabaseClient(CFG, fn);
  await client.db.createSubmission('u1', 'user-JWT', {
    device_type: 'Toy', brand: 'X', model: null, condition: 'Unknown', age_years: 1, available_components: [], notes: null,
  });
  const h = calls[0].init.headers as Record<string, string>;
  assert.equal(h.Authorization, 'Bearer user-JWT');
  assert.equal(h.apikey, 'anon-KEY');
  assert.equal(calls[0].init.method, 'POST');
});

test('admin writes use the service key and are the only path that bypasses RLS', async () => {
  const { fn, calls } = stubFetch(() => json([{ id: 's1', status: 'accepted' }]));
  const client = createSupabaseClient(CFG, fn);
  await client.db.updateSubmission('s1', { status: 'accepted', reviewer_notes: null, reviewer_id: 'a1' });
  const h = calls[0].init.headers as Record<string, string>;
  assert.equal(h.Authorization, 'Bearer service-KEY');
});

test('token verification returns the user for a 200 and null for a 401', async () => {
  const ok = stubFetch(() => json({ id: 'u9', email: 'a@b.co' }));
  assert.deepEqual(await createSupabaseClient(CFG, ok.fn).verifyAccessToken('t'), { id: 'u9', email: 'a@b.co' });
  const bad = stubFetch(() => new Response('{}', { status: 401 }));
  assert.equal(await createSupabaseClient(CFG, bad.fn).verifyAccessToken('t'), null);
});
