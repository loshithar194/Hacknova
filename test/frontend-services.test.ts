import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readPublicConfig, supabaseConfigured } from '../src/services/config';
import { apiRequest, ApiError } from '../src/services/api';
import { loadCatalogueFromDatabase } from '../src/services/catalogueClient';
import { signInWithPassword, signUpWithPassword, loadSession, saveSession, clearSession, SESSION_KEY } from '../src/services/supabaseAuth';
import { fetchAllRows, pageSlice } from '../shared/pagination';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

test('config reads only VITE_ variables and treats blanks as unset', () => {
  const c = readPublicConfig({ VITE_SUPABASE_URL: ' https://x.supabase.co ', VITE_SUPABASE_ANON_KEY: '  ', VITE_API_BASE_URL: 'https://api.example.com/' });
  assert.equal(c.supabaseUrl, 'https://x.supabase.co');
  assert.equal(c.supabaseAnonKey, null);
  assert.equal(c.apiBase, 'https://api.example.com');
  assert.equal(supabaseConfigured(c), false);
  assert.equal(readPublicConfig({}).apiBase, '');
});

test('apiRequest sends the bearer token and returns parsed JSON', async () => {
  let auth = '';
  const f = (async (_u: string, init: RequestInit) => { auth = (init.headers as Record<string, string>).Authorization; return json({ ok: 1 }); }) as unknown as typeof fetch;
  const out = await apiRequest<{ ok: number }>('', '/api/me', { token: 'abc' }, f);
  assert.equal(out.ok, 1);
  assert.equal(auth, 'Bearer abc');
});

test('apiRequest surfaces server messages and field errors', async () => {
  const f = (async () => json({ error: 'Please correct the highlighted fields.', fields: { brand: 'Brand is required.' } }, 422)) as unknown as typeof fetch;
  await assert.rejects(() => apiRequest('', '/api/submissions', { method: 'POST', body: {} }, f), (e: ApiError) => e.status === 422 && e.fields?.brand === 'Brand is required.');
});

test('apiRequest reports a network failure clearly, not as success', async () => {
  const f = (async () => { throw new TypeError('fetch failed'); }) as unknown as typeof fetch;
  await assert.rejects(() => apiRequest('', '/api/me', {}, f), (e: ApiError) => e.status === 0 && /Could not reach/.test(e.message));
});

test('database catalogue loads all pages and maps rows to app types', async () => {
  const totalComponents = 620;
  const f = (async (url: string, init: RequestInit) => {
    const h = init.headers as Record<string, string>;
    assert.equal(h.apikey, 'anon-KEY');
    const [start, end] = h.Range.split('-').map(Number);
    if (url.includes('/rest/v1/components')) {
      const rows = Array.from({ length: Math.max(0, Math.min(end, totalComponents - 1) - start + 1) }, (_, i) => ({
        id: `c${start + i}`, name: 'Part', category: 'Sensors', description: null, unit_price: '12.50', weight_grams: 3, specs: 'x', compatibility: null,
      }));
      return json(rows);
    }
    return json([{
      id: 'p1', name: 'Demo product', aliases: ['alias'], category: 'Home', description: 'd', difficulty: 'Beginner', duration_minutes: 60,
      new_product_price: 500, consumables_cost: 20, icon: 'bulb', requires_spec_check: false, instructions: ['a'], safety_notes: ['s'], compatibility_notes: [],
      product_requirements: [{ component_id: 'c0', required_quantity: 2, compatible_alternatives: [], is_critical: true }],
    }]);
  }) as unknown as typeof fetch;
  const cat = await loadCatalogueFromDatabase({ url: 'https://x.supabase.co', anonKey: 'anon-KEY' }, f);
  assert.equal(cat.components.length, totalComponents);
  assert.equal(cat.components[0].unitPrice, 12.5);
  assert.equal(cat.products[0].requirements[0].quantity, 2);
  assert.equal(cat.products[0].requirements[0].critical, true);
});

test('database catalogue errors are thrown, not replaced with stale data', async () => {
  const f = (async () => new Response('x', { status: 503 })) as unknown as typeof fetch;
  await assert.rejects(() => loadCatalogueFromDatabase({ url: 'https://x.supabase.co', anonKey: 'k' }, f), /Catalogue request failed \(503\)/);
});

test('fetchAllRows stops on a short page and has a safety guard', async () => {
  const data = Array.from({ length: 1234 }, (_, i) => i);
  const rows = await fetchAllRows(async (o, l) => data.slice(o, o + l), 500);
  assert.equal(rows.length, 1234);
  await assert.rejects(() => fetchAllRows(async () => [1, 2], 2, 3), /safety guard/);
  assert.deepEqual(pageSlice([1, 2, 3], 10), { visible: [1, 2, 3], remaining: 0 });
});

test('sign-in returns a session on success and a readable message on failure', async () => {
  const ok = (async () => json({ access_token: 'T', user: { email: 'a@b.co' } })) as unknown as typeof fetch;
  const s = await signInWithPassword({ url: 'https://x.supabase.co', anonKey: 'k' }, 'a@b.co', 'pw-12345', ok);
  assert.deepEqual(s, { accessToken: 'T', email: 'a@b.co' });
  const bad = (async () => json({ error_description: 'Invalid login credentials' }, 400)) as unknown as typeof fetch;
  await assert.rejects(() => signInWithPassword({ url: 'https://x.supabase.co', anonKey: 'k' }, 'a@b.co', 'x', bad), /Invalid login credentials/);
});

test('sign-up with email confirmation enabled asks the user to confirm instead of pretending success', async () => {
  const f = (async () => json({ id: 'u', email: 'n@b.co' })) as unknown as typeof fetch;
  const out = await signUpWithPassword({ url: 'https://x.supabase.co', anonKey: 'k' }, { email: 'n@b.co', password: 'pw-12345', fullName: 'N' }, f);
  assert.equal(out.kind, 'confirm_email');
});

test('stored session round-trips and is cleared on sign-out', () => {
  const mem = new Map<string, string>();
  const store = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) };
  saveSession({ accessToken: 'T', email: 'a@b.co' }, store);
  assert.equal(mem.has(SESSION_KEY), true);
  assert.equal(loadSession(store)?.accessToken, 'T');
  clearSession(store);
  assert.equal(loadSession(store), null);
  mem.set(SESSION_KEY, 'not json');
  assert.equal(loadSession(store), null);
});
