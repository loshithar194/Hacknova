/** Pure paging helpers used by the Load More UI. No fixed catalogue limits. */
export function pageSlice<T>(items: readonly T[], visibleCount: number): { visible: T[]; remaining: number } {
  const n = Math.max(0, Math.min(visibleCount, items.length));
  return { visible: items.slice(0, n), remaining: items.length - n };
}

export function nextVisibleCount(current: number, step: number, total: number): number {
  return Math.min(total, current + step);
}

/**
 * Reads every row from a paged source. Stops on the first short page, so there is no
 * fixed row cap. `pageSize` only controls request size. `fetchPage` receives an offset and a limit.
 */
export async function fetchAllRows<T>(
  fetchPage: (offset: number, limit: number) => Promise<T[]>,
  pageSize = 500,
  maxPages = 10_000,
): Promise<T[]> {
  const out: T[] = [];
  for (let page = 0; page < maxPages; page++) {
    const rows = await fetchPage(page * pageSize, pageSize);
    out.push(...rows);
    if (rows.length < pageSize) return out;
  }
  throw new Error('Catalogue paging exceeded the safety guard. Check the query.');
}
