import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateProject, evaluateAll } from '../src/lib/matching';
import { PROJECTS_BY_ID, COMPONENTS_BY_ID, sampleInventory } from '../src/data/catalog';
import type { InventoryItem } from '../src/types';

const item = (componentId: string, quantity: number, condition: InventoryItem['condition'] = 'Working', specs = ''): InventoryItem => ({
  id: `${componentId}-${condition}`, componentId, name: COMPONENTS_BY_ID[componentId]?.name ?? componentId,
  category: '', quantity, condition, specs, notes: '', source: 'test', addedAt: '',
});

test('empty inventory gives 0% and Not Feasible', () => {
  const r = evaluateProject(PROJECTS_BY_ID['plant-watering'], []);
  assert.equal(r.matchPercent, 0);
  assert.equal(r.feasibility, 'NOT_FEASIBLE');
});

test('quantity-based match matches the documented formula on the sample kit', () => {
  const r = evaluateProject(PROJECTS_BY_ID['plant-watering'], sampleInventory());
  // required 17 units; sample kit covers arduino(1) + jumper(10) + breadboard(1) = 12
  assert.equal(r.totalRequired, 17);
  assert.equal(r.totalUsable, 12);
  assert.equal(r.matchPercent, Math.round((12 / 17) * 100));
  assert.equal(r.feasibility, 'NOT_FEASIBLE');
});

test('a project with everything present but an unverified spec is never Build Now', () => {
  const inv = [
    item('ultrasonic', 1), item('servo', 1), item('arduino-uno', 1), item('jumper', 12),
    item('breadboard', 1), item('power-supply', 1),
  ];
  const r = evaluateProject(PROJECTS_BY_ID['smart-dustbin'], inv);
  assert.equal(r.matchPercent, 100);
  assert.notEqual(r.feasibility, 'BUILD_NOW', 'missing specs must block Build Now');
  assert.ok(r.warnings.some((w) => w.includes('electrical specifications')));
});

test('with specs recorded and no open issues, the project is Build Now', () => {
  const inv = [
    item('ultrasonic', 1, 'Working', '5V'), item('servo', 1, 'Working', '5V'), item('arduino-uno', 1, 'Working', '5V'),
    item('jumper', 12), item('breadboard', 1), item('power-supply', 1, 'Working', '5V'),
  ];
  const r = evaluateProject(PROJECTS_BY_ID['smart-dustbin'], inv);
  assert.equal(r.feasibility, 'BUILD_NOW');
  assert.equal(r.missingUnits, 0);
});

test('"Not working" units are ignored', () => {
  const r = evaluateProject(PROJECTS_BY_ID['weather-station'], [item('arduino-uno', 1, 'Not working')]);
  assert.equal(r.requirements.find((q) => q.componentId === 'arduino-uno')!.usable, 0);
});

test('a missing critical component makes the project Not Feasible', () => {
  const inv = [item('jumper', 15), item('breadboard', 1), item('lcd16x2', 1), item('power-supply', 1), item('dht11', 1, 'Working', '5V')];
  const r = evaluateProject(PROJECTS_BY_ID['weather-station'], inv);
  assert.equal(r.criticalMissing, true);
  assert.equal(r.feasibility, 'NOT_FEASIBLE');
});

test('an ESP32 substitute fills an Arduino shortfall and adds a verification warning', () => {
  const inv = [item('esp32', 1, 'Working', '3.3V'), item('dht11', 1, 'Working', '5V'), item('lcd16x2', 1, 'Working', '5V'), item('breadboard', 1), item('jumper', 15), item('power-supply', 1, 'Working', '5V')];
  const r = evaluateProject(PROJECTS_BY_ID['weather-station'], inv);
  const ard = r.requirements.find((q) => q.componentId === 'arduino-uno')!;
  assert.equal(ard.missing, 0);
  assert.equal(ard.alternativeName, 'ESP32 Dev Board');
  assert.ok(r.unverifiedCount >= 1);
  assert.notEqual(r.feasibility, 'BUILD_NOW');
});

test('savings can be negative and are not clamped', () => {
  const r = evaluateProject(PROJECTS_BY_ID['obstacle-robot'], []);
  assert.ok(r.buildCost > r.newProductPrice || r.savingsVsNew < 0 || r.savingsVsNew === r.newProductPrice - r.buildCost);
  assert.equal(r.savingsVsNew, r.newProductPrice - r.buildCost);
});

test('evaluateAll accepts an explicit project and component set (database catalogue path)', () => {
  const comps = Object.fromEntries(Object.values(COMPONENTS_BY_ID).map((c) => [c.id, { ...c, name: `DB ${c.name}` }]));
  const out = evaluateAll(sampleInventory(), [PROJECTS_BY_ID['led-emergency']], comps);
  assert.equal(out.length, 1);
  assert.equal(out[0].requirements[0].name.startsWith('DB '), true);
});
