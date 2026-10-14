import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COMPONENTS, PROJECTS, PROJECTS_BY_ID, COMPONENTS_BY_ID, replaceCatalogue, catalogueState, sampleInventory, BUNDLED_PROJECTS, BUNDLED_COMPONENTS } from '../src/data/catalog';
import { pageSlice, nextVisibleCount } from '../shared/pagination';

test('replaceCatalogue swaps the live catalogue and its lookup maps', () => {
  const comps = [{ ...BUNDLED_COMPONENTS[0], id: 'db-only', name: 'DB part' }];
  const prods = [{ ...BUNDLED_PROJECTS[0], id: 'db-product', requirements: [{ componentId: 'db-only', quantity: 1 }] }];
  replaceCatalogue({ components: comps, projects: prods, source: 'database' });
  assert.equal(COMPONENTS.length, 1);
  assert.equal(PROJECTS.length, 1);
  assert.ok(PROJECTS_BY_ID['db-product']);
  assert.equal(PROJECTS_BY_ID['plant-watering'], undefined);
  assert.equal(catalogueState.source, 'database');
  // sample kit must not crash when its parts are absent from the database catalogue
  assert.doesNotThrow(() => sampleInventory());
  replaceCatalogue({ components: BUNDLED_COMPONENTS, projects: BUNDLED_PROJECTS, source: 'bundled' });
  assert.ok(COMPONENTS_BY_ID['arduino-uno']);
});

test('paging helpers have no fixed cap: Load More reveals every item', () => {
  const items = Array.from({ length: 53 }, (_, i) => i);
  let visible = 6;
  let shown = pageSlice(items, visible);
  while (shown.remaining > 0) {
    visible = nextVisibleCount(visible, 6, items.length);
    shown = pageSlice(items, visible);
  }
  assert.equal(shown.visible.length, 53);
});
