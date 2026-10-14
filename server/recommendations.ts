import { evaluateAll, type MatchResult } from '../src/lib/matching';
import type { Component, InventoryItem, Project } from '../src/types';
import type { SubmissionComponentInput } from '../shared/submission';
import type { RecommendationRow, SubmissionRow } from './types';
import { AI_SYSTEM_PROMPT, buildUserPrompt, parseModelJson, validateAiRecommendations, type AiClient } from './ai';

export type AiStatus = 'used' | 'not_configured' | 'failed_validation' | 'error' | 'skipped';

export interface RecommendationDto {
  rank: number;
  productId: string;
  productName: string;
  feasibility: MatchResult['feasibility'];
  matchPercent: number;
  missing: { componentId: string; name: string; quantity: number }[];
  explanation: string;
  safetyNotes: string[];
  source: 'ai' | 'rule_based';
  estimatedBuildCost: number;
  estimatedNewPrice: number;
}

export interface RecommendationRun {
  source: 'ai' | 'rule_based';
  aiStatus: AiStatus;
  aiNote: string;
  recommendations: RecommendationDto[];
  rows: RecommendationRow[];
}

const FEASIBILITY_RANK: Record<MatchResult['feasibility'], number> = { BUILD_NOW: 0, SMALL_ADDITIONS: 1, NOT_FEASIBLE: 2 };
const MAX_RECOMMENDATIONS = 5;

/** Builds the matching inventory from submitted parts. Specs are unknown, so spec checks stay active. */
export function submissionInventory(parts: SubmissionComponentInput[], components: Record<string, Component>): InventoryItem[] {
  const now = new Date(0).toISOString();
  return parts.flatMap((p, i) => {
    const c = components[p.componentId];
    if (!c) return [];
    return [{
      id: `sub-${i}`,
      componentId: p.componentId,
      name: c.name,
      category: c.category,
      quantity: p.quantity,
      condition: p.condition,
      specs: '',
      notes: '',
      source: 'E-waste submission',
      addedAt: now,
    }];
  });
}

function mandatorySafety(product: Project): string[] {
  const notes = [...product.safety];
  if (product.requiresSpecCheck) {
    notes.push('Verify the electrical specifications of every part against its datasheet before wiring.');
  }
  return notes;
}

function dto(
  r: MatchResult,
  rank: number,
  source: 'ai' | 'rule_based',
  explanation: string,
  aiNotes: string[],
): RecommendationDto {
  return {
    rank,
    productId: r.project.id,
    productName: r.project.name,
    feasibility: r.feasibility,
    matchPercent: r.matchPercent,
    missing: r.requirements.filter((q) => q.missing > 0).map((q) => ({ componentId: q.componentId, name: q.name, quantity: q.missing })),
    explanation,
    safetyNotes: [...aiNotes, ...r.project.compatibilityNotes, ...mandatorySafety(r.project)].filter(
      (n, i, arr) => arr.indexOf(n) === i,
    ),
    source,
    estimatedBuildCost: r.buildCost,
    estimatedNewPrice: r.newProductPrice,
  };
}

/**
 * Produces validated recommendations.
 * 1. The matching engine computes feasibility. Only BUILD_NOW and SMALL_ADDITIONS can be recommended.
 * 2. If an AI client is configured, the model chooses and explains candidates. Its output is validated.
 * 3. If AI is unavailable or its output fails validation, a labelled rule-based result is returned instead.
 */
export async function runRecommendations(input: {
  submission: Pick<SubmissionRow, 'id' | 'user_id' | 'device_type' | 'brand' | 'model' | 'condition' | 'age_years' | 'notes' | 'available_components'>;
  products: Project[];
  components: Component[];
  ai: AiClient | null;
  model: string | null;
}): Promise<RecommendationRun> {
  const componentMap = Object.fromEntries(input.components.map((c) => [c.id, c]));
  const inventory = submissionInventory(input.submission.available_components, componentMap);
  const results = evaluateAll(inventory, input.products, componentMap);
  const feasible = results
    .filter((r) => r.feasibility !== 'NOT_FEASIBLE')
    .sort((a, b) => FEASIBILITY_RANK[a.feasibility] - FEASIBILITY_RANK[b.feasibility] || b.matchPercent - a.matchPercent);
  const byId = new Map(feasible.map((r) => [r.project.id, r]));

  const ruleBased = (aiStatus: AiStatus, aiNote: string, rejected: unknown[] = []): RecommendationRun => {
    const recs = feasible.slice(0, MAX_RECOMMENDATIONS).map((r, i) =>
      dto(r, i + 1, 'rule_based', `Rule-based result: ${r.reasons.join(' ')}`, []),
    );
    return { source: 'rule_based', aiStatus, aiNote, recommendations: recs, rows: toRows(recs, input.submission, null, { aiStatus, aiNote, rejected }) };
  };

  if (feasible.length === 0) {
    return ruleBased('skipped', 'No project in the catalogue is feasible with the listed parts, so there is nothing to recommend.');
  }
  if (!input.ai) {
    return ruleBased('not_configured', 'AI is not configured on the server (ANTHROPIC_API_KEY is not set). Showing the deterministic rule-based result.');
  }

  try {
    const candidates = feasible.slice(0, 15).map((r) => ({
      id: r.project.id,
      name: r.project.name,
      difficulty: r.project.difficulty,
      requirements: r.project.requirements.map((q) => ({ name: componentMap[q.componentId]?.name ?? q.componentId, quantity: q.quantity })),
    }));
    const prompt = buildUserPrompt({
      device: {
        type: input.submission.device_type,
        brand: input.submission.brand,
        model: input.submission.model,
        condition: input.submission.condition,
        ageYears: input.submission.age_years,
        notes: input.submission.notes,
      },
      parts: input.submission.available_components.map((p) => ({
        name: componentMap[p.componentId]?.name ?? p.componentId,
        quantity: p.quantity,
        condition: p.condition,
      })),
      candidates,
    });
    const text = await input.ai.complete({ system: AI_SYSTEM_PROMPT, user: prompt });
    const parsed = parseModelJson(text);
    if (!parsed.ok) return ruleBased('failed_validation', `AI output rejected: ${parsed.reason} Showing the rule-based result.`);

    const { accepted, rejected } = validateAiRecommendations(parsed.value, new Set(byId.keys()));
    if (accepted.length === 0) {
      return ruleBased('failed_validation', 'AI output did not pass validation, so the rule-based result is shown.', rejected);
    }
    const recs = accepted.map((a, i) => {
      const r = byId.get(a.productId)!;
      return dto(r, i + 1, 'ai', a.explanation, a.safetyNotes);
    });
    const note = rejected.length
      ? `AI suggested ${accepted.length} valid recommendation(s). ${rejected.length} item(s) were rejected by validation.`
      : `AI recommendations validated (${accepted.length}).`;
    return { source: 'ai', aiStatus: 'used', aiNote: note, recommendations: recs, rows: toRows(recs, input.submission, input.model, { aiStatus: 'used', aiNote: note, rejected }) };
  } catch (err) {
    // Never include provider payloads or keys in stored or returned messages.
    const msg = err instanceof Error && /\(\d{3}\)/.test(err.message) ? err.message : 'AI request failed.';
    return ruleBased('error', `${msg} Showing the rule-based result.`);
  }
}

function toRows(
  recs: RecommendationDto[],
  submission: { id: string; user_id: string },
  model: string | null,
  validation: Record<string, unknown>,
): RecommendationRow[] {
  return recs.map((r) => ({
    submission_id: submission.id,
    user_id: submission.user_id,
    product_id: r.productId,
    rank: r.rank,
    source: r.source,
    model: r.source === 'ai' ? model : null,
    match_percent: r.matchPercent,
    feasibility: r.feasibility,
    explanation: r.explanation,
    missing_components: r.missing,
    safety_notes: r.safetyNotes,
    validation,
  }));
}
