import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { createApp } from '../server/app';
import type { AiClient } from '../server/ai';
import { validateIdeas, runIdeas } from '../server/ideas';
import { BUNDLED_COMPONENTS } from '../src/data/catalog';
import { createFakeDb } from './support/fakeDb';

const COMPS = Object.fromEntries(BUNDLED_COMPONENTS.map((c) => [c.id, c]));
const CATALOGUE = BUNDLED_COMPONENTS;

const idea = (over: Record<string, unknown> = {}) => ({
  name: 'Bird feeder alarm',
  description: 'Sounds a buzzer when the ultrasonic sensor sees a visitor approaching the feeder.',
  difficulty: 'Beginner',
  durationMinutes: 90,
  parts: [{ componentId: 'ultrasonic', quantity: 1 }, { componentId: 'buzzer', quantity: 1 }, { componentId: 'arduino-uno', quantity: 1 }],
  steps: ['Wire the ultrasonic sensor to two digital pins.', 'Connect the buzzer to a third digital pin.', 'Upload a sketch that beeps under 30 cm.'],
  safetyNotes: ['Keep the board dry and away from the feeder seed.'],
  ...over,
});
const wrap = (...ideas: unknown[]) => ({ ideas });

test('a valid, non-catalogue idea is accepted: the model is not limited to fixed projects', () => {
  const v = validateIdeas(wrap(idea()), COMPS);
  assert.equal(v.accepted.length, 1);
  assert.equal(v.accepted[0].name, 'Bird feeder alarm');
  assert.equal(v.rejected.length, 0);
});

test('an invented part is rejected, but valid ideas in the same reply are kept', () => {
  const bad = idea({ name: 'Robot dog', parts: [{ componentId: 'quantum-core', quantity: 1 }] });
  const v = validateIdeas(wrap(bad, idea()), COMPS);
  assert.equal(v.accepted.length, 1);
  assert.equal(v.accepted[0].name, 'Bird feeder alarm');
  assert.ok(v.rejected.some((r) => /Unknown part/.test(r.reason)));
});

test('the safety gate rejects mains, high voltage, lithium and hazardous material wording', () => {
  for (const text of ['Plug it into the 230V mains', 'Uses a lithium cell pack', 'High voltage arc generator', 'Store the flammable fuel nearby']) {
    const v = validateIdeas(wrap(idea({ description: `${text} to power it. Safe enough to build.` })), COMPS);
    assert.equal(v.accepted.length, 0, `should reject: ${text}`);
    assert.ok(v.rejected[0].reason.includes('Rejected'));
  }
});

test('missing safety notes, bad steps, duplicate names and out-of-range quantities are rejected', () => {
  assert.equal(validateIdeas(wrap(idea({ safetyNotes: [] })), COMPS).accepted.length, 0);
  assert.equal(validateIdeas(wrap(idea({ steps: ['only one'] })), COMPS).accepted.length, 0);
  assert.equal(validateIdeas(wrap(idea({ parts: [{ componentId: 'buzzer', quantity: 500 }] })), COMPS).accepted.length, 0);
  const dup = validateIdeas(wrap(idea(), idea()), COMPS);
  assert.equal(dup.accepted.length, 1);
  assert.ok(dup.rejected.some((r) => r.reason === 'Duplicate project name.'));
});

test('no AI key: no ideas are invented and the status says so', async () => {
  const run = await runIdeas({ submission: sub(), components: CATALOGUE, ai: null, model: null });
  assert.equal(run.aiStatus, 'not_configured');
  assert.deepEqual(run.ideas, []);
  assert.deepEqual(run.rows, []);
});

test('feasibility and missing parts are computed from what the user really owns, not the model’s claim', async () => {
  const ai: AiClient = { complete: async () => JSON.stringify(wrap(idea({
    name: 'Greenhouse monitor',
    parts: [{ componentId: 'dht11', quantity: 1 }, { componentId: 'lcd16x2', quantity: 1 }, { componentId: 'arduino-uno', quantity: 1 }],
  }))) };
  const run = await runIdeas({ submission: sub(), components: CATALOGUE, ai, model: 'test-model' });
  assert.equal(run.aiStatus, 'used');
  const d = run.ideas[0];
  // the user owns ultrasonic/servo/arduino/jumper/breadboard/power-supply, not dht11 or the LCD
  const missingIds = d.missing.map((m) => m.componentId).sort();
  assert.deepEqual(missingIds, ['dht11', 'lcd16x2']);
  assert.notEqual(d.feasibility, 'BUILD_NOW');
  assert.ok(d.estimatedBuildCost >= COMPS['dht11'].unitPrice + COMPS['lcd16x2'].unitPrice);
  assert.equal(run.rows[0].model, 'test-model');
});

test('an idea using only owned parts is shown, still with a verification note because specs are unknown', async () => {
  const ai: AiClient = { complete: async () => JSON.stringify(wrap(idea())) };
  const run = await runIdeas({ submission: sub(), components: CATALOGUE, ai, model: 'm' });
  const d = run.ideas[0];
  assert.equal(d.missing.length, 1, 'only the buzzer is missing');
  assert.equal(d.missing[0].componentId, 'buzzer');
  assert.ok(d.safetyNotes.some((n) => /Verify the items/.test(n)) || d.feasibility !== 'BUILD_NOW');
});

test('non-JSON output is rejected, and no ideas are stored', async () => {
  const run = await runIdeas({ submission: sub(), components: CATALOGUE, ai: { complete: async () => 'Here are some ideas!' }, model: 'm' });
  assert.equal(run.aiStatus, 'failed_validation');
  assert.deepEqual(run.rows, []);
});

test('a provider error is reported without leaking the key', async () => {
  const run = await runIdeas({ submission: sub(), components: CATALOGUE, ai: { complete: async () => { throw new Error('boom sk-LEAK-123'); } }, model: 'm' });
  assert.equal(run.aiStatus, 'error');
  assert.ok(!run.aiNote.includes('sk-LEAK'));
});

// ---- HTTP level -------------------------------------------------------------
const users = [
  { id: '11111111-1111-4111-8111-111111111111', email: 'maker@example.com', token: 'tok-maker', role: 'user' as const },
  { id: '22222222-2222-4222-8222-222222222222', email: 'other@example.com', token: 'tok-other', role: 'user' as const },
];

function sub() {
  return {
    id: '00000000-0000-4000-8000-000000000001', user_id: users[0].id, device_type: 'Printer' as const, brand: 'HP', model: null,
    condition: 'Unknown' as const, age_years: 5, notes: null,
    available_components: [
      { componentId: 'ultrasonic', quantity: 1, condition: 'Working' as const },
      { componentId: 'arduino-uno', quantity: 1, condition: 'Working' as const },
      { componentId: 'jumper', quantity: 12, condition: 'Working' as const },
      { componentId: 'breadboard', quantity: 1, condition: 'Working' as const },
    ],
  };
}

const fake = createFakeDb(users);
let stopAI: { server: Server; base: string } | null = null;
let stopNoAI: { server: Server; base: string } | null = null;
let subId = '';

function start(ai: AiClient | null) {
  const app = createApp({
    db: fake.db,
    verifyAccessToken: async (t) => { const u = fake.tokenToUser.get(t); return u ? { id: u.id, email: u.email } : null; },
    ai, aiModel: ai ? 'claude-haiku-5-5' : null,
  });
  return new Promise<{ server: Server; base: string }>((resolve) => {
    const srv = createServer((r, s) => void app(r, s));
    srv.listen(0, '127.0.0.1', () => resolve({ server: srv, base: `http://127.0.0.1:${(srv.address() as { port: number }).port}` }));
  });
}

before(async () => {
  // create a real stored submission through the fake database
  const row = await fake.db.createSubmission(users[0].id, users[0].token, {
    device_type: 'Printer', brand: 'HP', model: null, condition: 'Unknown', age_years: 5, notes: null,
    available_components: sub().available_components,
  });
  subId = row.id;
  stopNoAI = await start(null);
  stopAI = await start({ complete: async () => JSON.stringify(wrap(idea())) });
});
after(async () => {
  for (const s of [stopAI, stopNoAI]) if (s) await new Promise<void>((r) => s.server.close(() => r()));
});

test('HTTP: without AI configured the endpoint returns an explicit status and stores nothing', async () => {
  const r = await fetch(`${stopNoAI!.base}/api/submissions/${subId}/ai-ideas`, { method: 'POST', headers: { Authorization: 'Bearer tok-maker' } });
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(body.aiStatus, 'not_configured');
  assert.deepEqual(body.ideas, []);
  assert.equal(fake.aiIdeas.filter((i) => i.submission_id === subId).length, 0);
});

test('HTTP: with AI configured, ideas are generated, stored, and readable by the owner', async () => {
  const r = await fetch(`${stopAI!.base}/api/submissions/${subId}/ai-ideas`, { method: 'POST', headers: { Authorization: 'Bearer tok-maker' } });
  const body = await r.json();
  assert.equal(body.aiStatus, 'used');
  assert.equal(body.ideas[0].name, 'Bird feeder alarm');
  assert.equal(fake.aiIdeas.filter((i) => i.submission_id === subId).length, 1);
  const list = await (await fetch(`${stopAI!.base}/api/submissions/${subId}/ai-ideas`, { headers: { Authorization: 'Bearer tok-maker' } })).json();
  assert.equal(list.ideas.length, 1);
});

test('HTTP: another user cannot generate or read ideas for this submission', async () => {
  const post = await fetch(`${stopAI!.base}/api/submissions/${subId}/ai-ideas`, { method: 'POST', headers: { Authorization: 'Bearer tok-other' } });
  assert.equal(post.status, 404);
  const get = await fetch(`${stopAI!.base}/api/submissions/${subId}/ai-ideas`, { headers: { Authorization: 'Bearer tok-other' } });
  assert.equal(get.status, 404);
});

test('HTTP: anonymous requests are rejected', async () => {
  const r = await fetch(`${stopAI!.base}/api/submissions/${subId}/ai-ideas`, { method: 'POST' });
  assert.equal(r.status, 401);
});
