import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseModelJson, validateAiRecommendations, createAnthropicClient, type AiClient } from '../server/ai';
import { runRecommendations } from '../server/recommendations';
import { BUNDLED_COMPONENTS, BUNDLED_PROJECTS } from '../src/data/catalog';
import type { SubmissionRow } from '../server/types';

const submission = {
  id: '00000000-0000-4000-8000-000000000001', user_id: 'u1', device_type: 'Printer' as const, brand: 'HP', model: null,
  condition: 'Unknown' as const, age_years: 5, notes: null,
  available_components: [
    { componentId: 'ultrasonic', quantity: 1, condition: 'Working' as const },
    { componentId: 'servo', quantity: 1, condition: 'Working' as const },
    { componentId: 'arduino-uno', quantity: 1, condition: 'Working' as const },
    { componentId: 'jumper', quantity: 12, condition: 'Working' as const },
    { componentId: 'breadboard', quantity: 1, condition: 'Working' as const },
    { componentId: 'power-supply', quantity: 1, condition: 'Working' as const },
  ],
} as Pick<SubmissionRow, 'id' | 'user_id' | 'device_type' | 'brand' | 'model' | 'condition' | 'age_years' | 'notes' | 'available_components'>;

const products = BUNDLED_PROJECTS;
const components = BUNDLED_COMPONENTS;
const validAi = (productId: string) => JSON.stringify({
  recommendations: [{ productId, explanation: 'Uses the ultrasonic sensor and servo you already have.', safetyNotes: ['Keep fingers clear of the lid hinge.'] }],
});

const fakeAi = (text: string | (() => Promise<string>)): AiClient => ({
  complete: typeof text === 'string' ? async () => text : text,
});

test('parseModelJson accepts a bare object and a single json fence, rejects prose', () => {
  assert.equal(parseModelJson('{"a":1}').ok, true);
  assert.equal(parseModelJson('```json\n{"a":1}\n```').ok, true);
  assert.equal(parseModelJson('Sure! Here you go: {"a":1}').ok, false);
});

test('validation drops unknown product ids, weak explanations and missing safety notes', () => {
  const allowed = new Set(['smart-dustbin']);
  const { accepted, rejected } = validateAiRecommendations({
    recommendations: [
      { productId: 'invented-robot', explanation: 'A long enough explanation text here.', safetyNotes: ['Safe enough note.'] },
      { productId: 'smart-dustbin', explanation: 'short', safetyNotes: ['Safe enough note.'] },
      { productId: 'smart-dustbin', explanation: 'A long enough explanation text here.', safetyNotes: [] },
      { productId: 'smart-dustbin', explanation: 'A long enough explanation text here.', safetyNotes: ['Safe enough note.'] },
    ],
  }, allowed);
  assert.equal(accepted.length, 1);
  assert.equal(rejected.length, 3);
  assert.ok(rejected.some((r) => r.reason.includes('candidate list')));
});

test('no AI client configured: returns a labelled rule-based result, never an AI result', async () => {
  const run = await runRecommendations({ submission, products, components, ai: null, model: null });
  assert.equal(run.source, 'rule_based');
  assert.equal(run.aiStatus, 'not_configured');
  assert.ok(run.recommendations.length > 0);
  assert.ok(run.recommendations.every((r) => r.source === 'rule_based' && r.feasibility !== 'NOT_FEASIBLE'));
  assert.ok(run.aiNote.includes('ANTHROPIC_API_KEY'));
});

test('valid AI output is used, and feasibility comes from the engine, not the model', async () => {
  const run = await runRecommendations({
    submission, products, components, model: 'test-model',
    ai: fakeAi(validAi('smart-dustbin')),
  });
  assert.equal(run.source, 'ai');
  assert.equal(run.aiStatus, 'used');
  assert.equal(run.recommendations[0].productId, 'smart-dustbin');
  assert.equal(run.recommendations[0].source, 'ai');
  assert.notEqual(run.recommendations[0].feasibility, 'NOT_FEASIBLE');
  // mandatory server-side safety note for spec-checked products is always present
  assert.ok(run.recommendations[0].safetyNotes.some((n) => n.includes('datasheet')));
  assert.equal(run.rows[0].model, 'test-model');
});

test('AI recommending a product the engine says is not feasible is rejected, with fallback', async () => {
  const run = await runRecommendations({
    submission, products, components, model: 'm',
    ai: fakeAi(validAi('plant-watering')), // needs a pump, relay, tubing: not in the submission
  });
  assert.equal(run.source, 'rule_based');
  assert.equal(run.aiStatus, 'failed_validation');
  assert.ok(run.recommendations.every((r) => r.feasibility !== 'NOT_FEASIBLE'));
});

test('non-JSON model output falls back to rule-based and says why', async () => {
  const run = await runRecommendations({ submission, products, components, model: 'm', ai: fakeAi('Here are my ideas...') });
  assert.equal(run.aiStatus, 'failed_validation');
  assert.match(run.aiNote, /not valid JSON/);
});

test('a provider error falls back to rule-based and does not leak internals', async () => {
  const run = await runRecommendations({
    submission, products, components, model: 'm',
    ai: fakeAi(async () => { throw new Error('socket hang up with key sk-SECRET123'); }),
  });
  assert.equal(run.aiStatus, 'error');
  assert.equal(run.source, 'rule_based');
  assert.ok(!run.aiNote.includes('sk-SECRET123'));
});

test('anthropic client sends the key only in the header and returns text blocks', async () => {
  let seen: { url: string; init: RequestInit } | null = null;
  const fetchStub = (async (url: string, init: RequestInit) => {
    seen = { url: String(url), init };
    return new Response(JSON.stringify({ content: [{ type: 'text', text: '{"recommendations":[]}' }] }), { status: 200 });
  }) as unknown as typeof fetch;
  const client = createAnthropicClient({ apiKey: 'sk-test-KEY', model: 'claude-haiku-5-5' }, fetchStub);
  const text = await client.complete({ system: 's', user: 'u' });
  assert.equal(text, '{"recommendations":[]}');
  assert.equal(seen!.url, 'https://api.anthropic.com/v1/messages');
  const headers = seen!.init.headers as Record<string, string>;
  assert.equal(headers['x-api-key'], 'sk-test-KEY');
  const body = JSON.parse(String(seen!.init.body));
  assert.equal(body.model, 'claude-haiku-5-5');
  assert.ok(!JSON.stringify(body).includes('sk-test-KEY'), 'key must never appear in the request body');
});

test('anthropic client surfaces a non-OK status without the key', async () => {
  const fetchStub = (async () => new Response('denied', { status: 401 })) as unknown as typeof fetch;
  const client = createAnthropicClient({ apiKey: 'sk-test-KEY', model: 'm' }, fetchStub);
  await assert.rejects(() => client.complete({ system: 's', user: 'u' }), (e: Error) => /401/.test(e.message) && !e.message.includes('sk-test-KEY'));
});
