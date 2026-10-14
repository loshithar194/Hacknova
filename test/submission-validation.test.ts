import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateReview, validateSubmission, LIMITS } from '../shared/submission';

const KNOWN = new Set(['arduino-uno', 'servo', 'jumper']);
const good = {
  deviceType: 'Printer', brand: ' HP ', model: '', condition: 'Partly working', ageYears: 6, notes: 'Sounds noisy',
  availableComponents: [{ componentId: 'servo', quantity: 2, condition: 'Working' }],
};

test('a valid submission is accepted and trimmed', () => {
  const v = validateSubmission(good, KNOWN);
  assert.equal(v.ok, true);
  if (v.ok) {
    assert.equal(v.value.brand, 'HP');
    assert.equal(v.value.model, null);
    assert.equal(v.value.availableComponents[0].quantity, 2);
  }
});

test('missing brand, bad device type and bad age are all reported', () => {
  const v = validateSubmission({ ...good, brand: '  ', deviceType: 'Spaceship', ageYears: 1.5 }, KNOWN);
  assert.equal(v.ok, false);
  if (!v.ok) {
    assert.ok(v.errors.brand);
    assert.ok(v.errors.deviceType);
    assert.ok(v.errors.ageYears);
  }
});

test('age bounds are enforced', () => {
  for (const ageYears of [-1, LIMITS.ageMax + 1]) {
    const v = validateSubmission({ ...good, ageYears }, KNOWN);
    assert.equal(v.ok, false);
  }
  assert.equal(validateSubmission({ ...good, ageYears: LIMITS.ageMax }, KNOWN).ok, true);
});

test('unknown component ids are rejected, so the AI cannot introduce parts', () => {
  const v = validateSubmission({ ...good, availableComponents: [{ componentId: 'nuclear-core', quantity: 1, condition: 'Working' }] }, KNOWN);
  assert.equal(v.ok, false);
  if (!v.ok) assert.ok(v.errors['availableComponents[0].componentId']);
});

test('duplicate components, zero quantity and bad condition are rejected', () => {
  const v = validateSubmission({
    ...good,
    availableComponents: [
      { componentId: 'servo', quantity: 1, condition: 'Working' },
      { componentId: 'servo', quantity: 0, condition: 'Broken' },
    ],
  }, KNOWN);
  assert.equal(v.ok, false);
  if (!v.ok) {
    assert.ok(v.errors['availableComponents[1].componentId']);
    assert.ok(v.errors['availableComponents[1].quantity']);
    assert.ok(v.errors['availableComponents[1].condition']);
  }
});

test('at least one component is required', () => {
  assert.equal(validateSubmission({ ...good, availableComponents: [] }, KNOWN).ok, false);
});

test('non-object bodies are rejected', () => {
  assert.equal(validateSubmission('hello', KNOWN).ok, false);
  assert.equal(validateSubmission(null, KNOWN).ok, false);
});

test('review accepts only known statuses', () => {
  assert.equal(validateReview({ status: 'accepted', reviewerNotes: 'ok' }).ok, true);
  assert.equal(validateReview({ status: 'deleted' }).ok, false);
});
