/**
 * HTTP-level tests. Uses a real node:http server, the real request handler and validation,
 * and an in-memory database TEST DOUBLE (test/support/fakeDb.ts). No Supabase or AI calls are made.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { createApp } from '../server/app';
import type { AiClient } from '../server/ai';
import { createFakeDb } from './support/fakeDb';

const users = [
  { id: '11111111-1111-4111-8111-111111111111', email: 'maker@example.com', token: 'tok-maker', role: 'user' as const },
  { id: '22222222-2222-4222-8222-222222222222', email: 'other@example.com', token: 'tok-other', role: 'user' as const },
  { id: '33333333-3333-4333-8333-333333333333', email: 'admin@example.com', token: 'tok-admin', role: 'admin' as const },
];

let server: Server;
let base: string;
let fake: ReturnType<typeof createFakeDb>;

function req(path: string, opts: { method?: string; token?: string; body?: unknown } = {}) {
  return fetch(base + path, {
    method: opts.method ?? 'GET',
    headers: {
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
      ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
}

const goodSubmission = {
  deviceType: 'Printer', brand: 'Epson', model: 'L3110', condition: 'Partly working', ageYears: 4, notes: 'Motor noisy',
  availableComponents: [
    { componentId: 'ultrasonic', quantity: 1, condition: 'Working' },
    { componentId: 'servo', quantity: 1, condition: 'Working' },
    { componentId: 'arduino-uno', quantity: 1, condition: 'Working' },
    { componentId: 'jumper', quantity: 12, condition: 'Working' },
    { componentId: 'breadboard', quantity: 1, condition: 'Working' },
    { componentId: 'power-supply', quantity: 1, condition: 'Working' },
  ],
};

function startApp(ai: AiClient | null, aiModel: string | null) {
  const verify = async (token: string) => {
    const u = fake.tokenToUser.get(token);
    return u ? { id: u.id, email: u.email } : null;
  };
  const app = createApp({ db: fake.db, verifyAccessToken: verify, ai, aiModel });
  return new Promise<{ server: Server; base: string }>((resolve) => {
    const srv = createServer((r, s) => void app(r, s));
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address() as { port: number };
      resolve({ server: srv, base: `http://127.0.0.1:${addr.port}` });
    });
  });
}

before(async () => {
  fake = createFakeDb(users);
  const started = await startApp(null, null);
  server = started.server;
  base = started.base;
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});



test('health reports configuration without exposing any secret', async () => {
  const res = await req('/api/health');
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.status, 'ok');
  assert.equal(body.ai, 'not_configured');
  assert.ok(!JSON.stringify(body).toLowerCase().includes('key'));
});

test('every submission endpoint requires a session', async () => {
  assert.equal((await req('/api/submissions')).status, 401);
  assert.equal((await req('/api/submissions', { method: 'POST', body: goodSubmission })).status, 401);
  assert.equal((await req('/api/submissions', { token: 'forged' })).status, 401);
});

test('invalid submissions return 422 with field errors and store nothing', async () => {
  const before = fake.submissions.length;
  const res = await req('/api/submissions', { method: 'POST', token: 'tok-maker', body: { ...goodSubmission, brand: '', ageYears: 999 } });
  assert.equal(res.status, 422);
  const body = await res.json();
  assert.ok(body.fields.brand);
  assert.ok(body.fields.ageYears);
  assert.equal(fake.submissions.length, before);
});

test('a valid submission is saved for the signed-in user only', async () => {
  const res = await req('/api/submissions', { method: 'POST', token: 'tok-maker', body: goodSubmission });
  assert.equal(res.status, 201);
  const { submission } = await res.json();
  assert.equal(submission.status, 'pending');
  assert.equal(submission.submittedBy, users[0].id);
  assert.equal(submission.brand, 'Epson');
});

test('users cannot read another user’s submission, and get 404 rather than the data', async () => {
  const mine = await (await req('/api/submissions', { token: 'tok-maker' })).json();
  const id = mine.submissions[0].id;
  assert.equal((await req(`/api/submissions/${id}`, { token: 'tok-maker' })).status, 200);
  assert.equal((await req(`/api/submissions/${id}`, { token: 'tok-other' })).status, 404);
  const others = await (await req('/api/submissions', { token: 'tok-other' })).json();
  assert.equal(others.submissions.length, 0);
});

test('recommendations run server-side and are stored, with a labelled rule-based result when AI is off', async () => {
  const sub = (await (await req('/api/submissions', { token: 'tok-maker' })).json()).submissions[0];
  const res = await req(`/api/submissions/${sub.id}/recommendations`, { method: 'POST', token: 'tok-maker' });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.source, 'rule_based');
  assert.equal(body.aiStatus, 'not_configured');
  assert.ok(body.recommendations.length > 0);
  assert.ok(body.recommendations.every((r: any) => r.feasibility !== 'NOT_FEASIBLE'));
  assert.ok(fake.recommendations.some((r) => r.submission_id === sub.id), 'results must be persisted');

  const reread = await (await req(`/api/submissions/${sub.id}/recommendations`, { token: 'tok-maker' })).json();
  assert.equal(reread.recommendations.length, body.recommendations.length);
});

test('another user cannot generate or read recommendations for a submission they do not own', async () => {
  const sub = (await (await req('/api/submissions', { token: 'tok-maker' })).json()).submissions[0];
  assert.equal((await req(`/api/submissions/${sub.id}/recommendations`, { method: 'POST', token: 'tok-other' })).status, 404);
  assert.equal((await req(`/api/submissions/${sub.id}/recommendations`, { token: 'tok-other' })).status, 404);
});

test('admin endpoints reject anonymous and non-admin callers', async () => {
  assert.equal((await req('/api/admin/submissions')).status, 401);
  assert.equal((await req('/api/admin/submissions', { token: 'tok-maker' })).status, 403);
  const sub = (await (await req('/api/submissions', { token: 'tok-maker' })).json()).submissions[0];
  assert.equal((await req(`/api/admin/submissions/${sub.id}`, { method: 'PATCH', token: 'tok-maker', body: { status: 'accepted' } })).status, 403);
  assert.equal(fake.submissions.find((s) => s.id === sub.id)!.status, 'pending', 'non-admin must not change status');
});

test('admin can list all submissions, filter by status, and update status with notes', async () => {
  const list = await req('/api/admin/submissions', { token: 'tok-admin' });
  assert.equal(list.status, 200);
  const { submissions } = await list.json();
  assert.ok(submissions.length >= 1);
  const target = submissions[0];
  assert.equal((await req('/api/admin/submissions?status=bogus', { token: 'tok-admin' })).status, 400);

  const bad = await req(`/api/admin/submissions/${target.id}`, { method: 'PATCH', token: 'tok-admin', body: { status: 'deleted' } });
  assert.equal(bad.status, 422);

  const ok = await req(`/api/admin/submissions/${target.id}`, { method: 'PATCH', token: 'tok-admin', body: { status: 'needs_info', reviewerNotes: 'Send a photo of the board.' } });
  assert.equal(ok.status, 200);
  const updated = (await ok.json()).submission;
  assert.equal(updated.status, 'needs_info');
  assert.equal(updated.reviewerNotes, 'Send a photo of the board.');

  const filtered = await (await req('/api/admin/submissions?status=needs_info', { token: 'tok-admin' })).json();
  assert.ok(filtered.submissions.every((s: any) => s.status === 'needs_info'));
});

test('admin status updates for a missing id return 404', async () => {
  const res = await req('/api/admin/submissions/44444444-4444-4444-8444-444444444444', { method: 'PATCH', token: 'tok-admin', body: { status: 'accepted' } });
  assert.equal(res.status, 404);
});

test('unknown routes and wrong methods are rejected', async () => {
  assert.equal((await req('/api/nothing')).status, 404);
  const sub = (await (await req('/api/submissions', { token: 'tok-maker' })).json()).submissions[0];
  assert.equal((await req(`/api/submissions/${sub.id}`, { method: 'DELETE', token: 'tok-maker' })).status, 405);
});

test('oversized and malformed JSON bodies are rejected cleanly', async () => {
  const bad = await fetch(base + '/api/submissions', { method: 'POST', headers: { Authorization: 'Bearer tok-maker', 'Content-Type': 'application/json' }, body: '{not json' });
  assert.equal(bad.status, 400);
});

test('with a configured AI client, the API stores AI results and records the model', async () => {
  const aiClient: AiClient = {
    complete: async () => JSON.stringify({
      recommendations: [{ productId: 'smart-dustbin', explanation: 'The ultrasonic sensor and servo already on hand suit this lid.', safetyNotes: ['Keep fingers clear of the servo arm.'] }],
    }),
  };
  const withAi = await startApp(aiClient, 'claude-haiku-5-5');
  try {
    const sub = (await (await fetch(withAi.base + '/api/submissions', { headers: { Authorization: 'Bearer tok-maker' } })).json()).submissions[0];
    const res = await fetch(`${withAi.base}/api/submissions/${sub.id}/recommendations`, { method: 'POST', headers: { Authorization: 'Bearer tok-maker' } });
    const body = await res.json();
    assert.equal(body.source, 'ai');
    assert.equal(body.aiStatus, 'used');
    assert.equal(body.recommendations[0].productId, 'smart-dustbin');
    const stored = fake.recommendations.filter((r) => r.submission_id === sub.id && r.source === 'ai');
    assert.equal(stored[0].model, 'claude-haiku-5-5');
  } finally {
    await new Promise<void>((resolve) => withAi.server.close(() => resolve()));
  }
});
