import { fetchAllRows } from '../../shared/pagination';
import { mapComponentRow, mapProductRow } from '../../shared/catalogueMapping';
import type { Component, Project } from '../types';

/**
 * Loads the complete catalogue from Supabase REST with the public anon key. Row Level Security
 * limits results to active rows. Pages are read until a short page is returned.
 */
export async function loadCatalogueFromDatabase(
  cfg: { url: string; anonKey: string },
  fetchImpl: typeof fetch = fetch,
): Promise<{ components: Component[]; products: Project[] }> {
  const base = cfg.url.replace(/\/+$/, '');
  const get = async (path: string, offset: number, limit: number): Promise<Record<string, unknown>[]> => {
    const res = await fetchImpl(`${base}/rest/v1/${path}`, {
      headers: {
        apikey: cfg.anonKey,
        Authorization: `Bearer ${cfg.anonKey}`,
        Accept: 'application/json',
        'Range-Unit': 'items',
        Range: `${offset}-${offset + limit - 1}`,
      },
    });
    if (!res.ok) throw new Error(`Catalogue request failed (${res.status}). Check that the database migrations have run.`);
    return (await res.json()) as Record<string, unknown>[];
  };

  const componentRows = await fetchAllRows((o, l) => get('components?select=*&is_active=eq.true&order=id.asc', o, l));
  const productRows = await fetchAllRows((o, l) =>
    get(
      'products?select=*,product_requirements(component_id,required_quantity,compatible_alternatives,is_critical)&is_active=eq.true&order=id.asc',
      o,
      l,
    ),
  );
  return {
    components: componentRows.map((r) => mapComponentRow(r)),
    products: productRows.map((r) => mapProductRow(r)),
  };
}
