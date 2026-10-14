import type { SavedProject } from '../types';

/** Only projects explicitly marked completed count toward impact. */
export function completedProjects(saved: SavedProject[]): SavedProject[] {
  return saved
    .filter((p) => p.status === 'completed' && !!p.completedAt)
    .sort((a, b) => (a.completedAt ?? '').localeCompare(b.completedAt ?? ''));
}

export interface ImpactPoint {
  label: string;
  completions: number;
  components: number;
  savings: number;
  kg: number;
}

export function impactSeries(saved: SavedProject[]): ImpactPoint[] {
  let completions = 0;
  let components = 0;
  let savings = 0;
  let grams = 0;
  return completedProjects(saved).map((p) => {
    completions += 1;
    components += (p.reusedUnits ?? []).reduce((s, u) => s + u.quantity, 0);
    savings += p.reuseValue ?? 0;
    grams += p.reusedWeightGrams ?? 0;
    return {
      label: new Date(p.completedAt as string).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
      completions,
      components,
      savings: Math.round(savings),
      kg: Number((grams / 1000).toFixed(3)),
    };
  });
}
