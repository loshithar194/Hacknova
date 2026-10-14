import type { Component, Feasibility, InventoryItem, Project } from '../types';
import { COMPONENTS_BY_ID, PROJECTS } from '../data/catalog';

export type ComponentMap = Record<string, Component>;

/** Categories with no electrical rating worth verifying (plain wiring and passives). */
export const SPEC_EXEMPT_CATEGORIES: readonly string[] = ['Wiring & Prototyping', 'Passives'];

/** Configurable classification thresholds for SMALL ADDITIONS. */
export const CLASSIFICATION_THRESHOLDS = {
  maxMissingTypesForSmallAdditions: 3,
  maxMissingUnitsForSmallAdditions: 10,
  minMatchPercentForSmallAdditions: 50,
};

export const FEASIBILITY_META: Record<Feasibility, { label: string; tone: 'green' | 'amber' | 'red' }> = {
  BUILD_NOW: { label: 'Build Now', tone: 'green' },
  SMALL_ADDITIONS: { label: 'Build With Small Additions', tone: 'amber' },
  NOT_FEASIBLE: { label: 'Not Feasible Yet', tone: 'red' },
};

export interface RequirementResult {
  componentId: string;
  name: string;
  category: string;
  unitPrice: number;
  weightGrams: number;
  required: number;
  available: number;     // owned units, including alternatives and units needing testing
  usable: number;        // min(available, required), counting only non-broken units
  missing: number;       // max(0, required - available)
  testingUsed: number;   // usable units still marked "Needs testing"
  alternativeName: string | null;
  critical: boolean;
  state: 'full' | 'partial' | 'missing';
}

export interface MatchResult {
  project: Project;
  requirements: RequirementResult[];
  totalRequired: number;
  totalUsable: number;
  matchPercent: number;          // quantity-based only
  fullTypes: number;
  partialTypes: number;
  missingTypes: number;          // types with at least one missing unit
  missingUnits: number;
  unverifiedCount: number;       // unresolved compatibility or verification items
  warnings: string[];
  reasons: string[];
  feasibility: Feasibility;
  criticalMissing: boolean;
  additionalCost: number;
  buildCost: number;
  newProductPrice: number;
  savingsVsNew: number;          // can be negative; shown as-is
  reuseValue: number;            // value of owned units used by the project
  reusedWeightGrams: number;
}

interface Totals { working: number; testing: number }

function totalsFor(componentId: string, inventory: InventoryItem[]): Totals {
  let working = 0;
  let testing = 0;
  for (const item of inventory) {
    if (item.componentId !== componentId) continue;
    if (item.condition === 'Working') working += item.quantity;
    else if (item.condition === 'Needs testing') testing += item.quantity;
  }
  return { working, testing };
}

/**
 * Deterministic, explainable project evaluation.
 * Working units are used before units marked "Needs testing". Units marked
 * "Not working" are ignored. Alternatives are only used when the primary part is short.
 */
export function evaluateProject(
  project: Project,
  inventory: InventoryItem[],
  components: ComponentMap = COMPONENTS_BY_ID,
): MatchResult {
  const warnings: string[] = [];
  const reasons: string[] = [];
  let unverifiedCount = 0;

  const requirements = project.requirements.map((req): RequirementResult => {
    const comp: Component = components[req.componentId];
    const alternatives = req.alternatives ?? [];
    const primary = totalsFor(req.componentId, inventory);

    let remaining = req.quantity;
    const primaryWorking = Math.min(primary.working, remaining);
    remaining -= primaryWorking;
    const primaryTesting = Math.min(primary.testing, remaining);
    remaining -= primaryTesting;

    let altAvailable = 0;
    let altTesting = 0;
    let altId: string | null = null;
    for (const id of alternatives) {
      const t = totalsFor(id, inventory);
      altAvailable += t.working + t.testing;
      if (remaining <= 0) continue;
      const useWorking = Math.min(t.working, remaining);
      remaining -= useWorking;
      const useTesting = Math.min(t.testing, remaining);
      remaining -= useTesting;
      if (useWorking + useTesting > 0) {
        altTesting += useTesting;
        if (!altId) altId = id;
      }
    }

    const usable = req.quantity - remaining;
    const missing = remaining;
    const testingUsed = primaryTesting + altTesting;
    const available = primary.working + primary.testing + altAvailable;
    const altName = altId ? components[altId]?.name ?? altId : null;

    if (testingUsed > 0) {
      unverifiedCount += 1;
      warnings.push(`${comp.name}: ${testingUsed} unit(s) are marked "Needs testing" and must be tested before use.`);
    }
    if (altId && altName) {
      unverifiedCount += 1;
      warnings.push(`${altName} is counted in place of ${comp.name}. ${components[altId]?.compatibility ?? ''}`);
    }
    if (project.requiresSpecCheck && usable > 0 && !SPEC_EXEMPT_CATEGORIES.includes(comp.category)) {
      const ids = [req.componentId, ...alternatives];
      const specsRecorded = inventory.some(
        (i) => ids.includes(i.componentId) && i.condition !== 'Not working' && i.specs.trim() !== '',
      );
      if (!specsRecorded) {
        unverifiedCount += 1;
        warnings.push(`No electrical specifications are recorded for ${comp.name}. Verify them before construction.`);
      }
    }

    return {
      componentId: req.componentId,
      name: comp.name,
      category: comp.category,
      unitPrice: comp.unitPrice,
      weightGrams: comp.weightGrams,
      required: req.quantity,
      available,
      usable,
      missing,
      testingUsed,
      alternativeName: altName,
      critical: !!req.critical,
      state: missing === 0 ? 'full' : usable > 0 ? 'partial' : 'missing',
    };
  });

  const totalRequired = requirements.reduce((s, r) => s + r.required, 0);
  const totalUsable = requirements.reduce((s, r) => s + r.usable, 0);
  const matchPercent = totalRequired === 0 ? 0 : Math.round((totalUsable / totalRequired) * 100);
  const fullTypes = requirements.filter((r) => r.missing === 0).length;
  const partialTypes = requirements.filter((r) => r.missing > 0 && r.usable > 0).length;
  const missingTypes = requirements.filter((r) => r.missing > 0).length;
  const missingUnits = requirements.reduce((s, r) => s + r.missing, 0);
  const criticalMissingList = requirements.filter((r) => r.critical && r.missing > 0);
  const criticalMissing = criticalMissingList.length > 0;

  const additionalCost = requirements.reduce((s, r) => s + r.missing * r.unitPrice, 0);
  const buildCost = additionalCost + project.consumablesCost;
  const newProductPrice = project.newProductPrice;
  const savingsVsNew = newProductPrice - buildCost;
  const reuseValue = requirements.reduce((s, r) => s + r.usable * r.unitPrice, 0);
  const reusedWeightGrams = requirements.reduce((s, r) => s + r.usable * r.weightGrams, 0);

  const T = CLASSIFICATION_THRESHOLDS;
  let feasibility: Feasibility;
  if (missingTypes === 0 && unverifiedCount === 0) feasibility = 'BUILD_NOW';
  else if (criticalMissing) feasibility = 'NOT_FEASIBLE';
  else if (missingTypes === 0) feasibility = 'SMALL_ADDITIONS';
  else if (
    missingTypes <= T.maxMissingTypesForSmallAdditions &&
    missingUnits <= T.maxMissingUnitsForSmallAdditions &&
    matchPercent >= T.minMatchPercentForSmallAdditions
  ) feasibility = 'SMALL_ADDITIONS';
  else feasibility = 'NOT_FEASIBLE';

  reasons.push(
    `${fullTypes} of ${requirements.length} component types are fully available; ${missingTypes} type(s) have missing units.`,
  );
  reasons.push(
    `Quantity-based match: ${totalUsable} of ${totalRequired} required units (${matchPercent}%). This measures quantities only, not technical compatibility or guaranteed success.`,
  );
  if (feasibility === 'BUILD_NOW') {
    reasons.push('All required quantities are present and no unresolved compatibility or verification item remains.');
  } else if (criticalMissing) {
    reasons.push(`Critical component missing: ${criticalMissingList.map((r) => r.name).join(', ')}.`);
  } else if (missingTypes === 0) {
    reasons.push(
      `All quantities are present, but ${unverifiedCount} verification item(s) must be resolved before this can be called "Ready to Build".`,
    );
  } else if (feasibility === 'SMALL_ADDITIONS') {
    reasons.push(`${missingTypes} type(s) and ${missingUnits} unit(s) are missing, within the configured limits.`);
  } else {
    reasons.push(
      `Too many missing items (${missingTypes} types, ${missingUnits} units) or match below ${T.minMatchPercentForSmallAdditions}% for the configured limits.`,
    );
  }

  return {
    project,
    requirements,
    totalRequired,
    totalUsable,
    matchPercent,
    fullTypes,
    partialTypes,
    missingTypes,
    missingUnits,
    unverifiedCount,
    warnings,
    reasons,
    feasibility,
    criticalMissing,
    additionalCost,
    buildCost,
    newProductPrice,
    savingsVsNew,
    reuseValue,
    reusedWeightGrams,
  };
}

export function evaluateAll(
  inventory: InventoryItem[],
  projects: Project[] = PROJECTS,
  components: ComponentMap = COMPONENTS_BY_ID,
): MatchResult[] {
  return projects.map((p) => evaluateProject(p, inventory, components));
}
