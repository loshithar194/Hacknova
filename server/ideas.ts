/**
 * AI project prediction. The model proposes NEW project ideas from the parts a user owns.
 * It is not limited to the product catalogue. The server then:
 *   1. Requires every part to be a known catalogue component (no invented parts).
 *   2. Rejects ideas that involve mains, high voltage, lithium cells, or hazardous materials.
 *   3. Recomputes owned vs missing parts, feasibility and cost with the matching engine.
 * The model never decides feasibility, prices, or safety status.
 */
import { evaluateProject } from '../src/lib/matching';
import type { Component, Difficulty, Project } from '../src/types';
import type { SubmissionComponentInput } from '../shared/submission';
import type { AiIdeaRow, SubmissionRow } from './types';
import { parseModelJson, type AiClient } from './ai';
import { submissionInventory } from './recommendations';

export type IdeaAiStatus = 'used' | 'not_configured' | 'failed_validation' | 'error';

export interface IdeaDto {
  rank: number;
  name: string;
  description: string;
  difficulty: Difficulty;
  durationMinutes: number;
  parts: { componentId: string; name: string; quantity: number }[];
  steps: string[];
  safetyNotes: string[];
  feasibility: 'BUILD_NOW' | 'SMALL_ADDITIONS' | 'NOT_FEASIBLE';
  matchPercent: number;
  missing: { componentId: string; name: string; quantity: number }[];
  estimatedBuildCost: number;
  source: 'ai';
}

export interface IdeaRun {
  aiStatus: IdeaAiStatus;
  aiNote: string;
  ideas: IdeaDto[];
  rows: AiIdeaRow[];
}

export const IDEA_SYSTEM_PROMPT = [
  'You are a careful electronics project designer for hobbyists who reuse salvaged parts.',
  'Propose up to 5 DIFFERENT, practical low-voltage project ideas that use parts from the catalogue list.',
  'Use ONLY component ids from the catalogue list. Never invent parts.',
  'Suggest projects that use what the user owns where possible. Parts the user lacks are allowed; they will be flagged as missing.',
  'Never propose anything using mains voltage (110-240 V), high voltage, lithium cells, fire, pressure, or hazardous chemicals.',
  'Each project needs clear numbered steps and at least one safety note.',
  'Respond with ONLY a JSON object, with no markdown and no prose, in this exact shape:',
  '{"ideas":[{"name":"<short name>","description":"<2-3 sentences>","difficulty":"Beginner|Intermediate|Advanced",',
  '"durationMinutes":<integer>,"parts":[{"componentId":"<id from catalogue>","quantity":<integer>}],',
  '"steps":["<step>"],"safetyNotes":["<note>"]}]}',
].join(' ');

export function buildIdeaPrompt(input: {
  device: { type: string; brand: string; condition: string; ageYears: number };
  owned: { componentId: string; name: string; quantity: number; condition: string }[];
  catalogue: Component[];
}): string {
  return JSON.stringify({
    device: input.device,
    owned: input.owned,
    catalogue: input.catalogue.map((c) => ({ id: c.id, name: c.name, category: c.category, specs: c.specs })),
  });
}

/** Terms that must never appear in an idea. Checked across every text field. */
const FORBIDDEN = /\b(mains|230\s*v|240\s*v|220\s*v|120\s*v|110\s*v|high[\s-]?voltage|lithium|li-?ion|explosive|flammable|gas\s+cylinder|firearm|weapon)\b/i;
const DIFFICULTIES: Difficulty[] = ['Beginner', 'Intermediate', 'Advanced'];
const FEASIBILITY_RANK: Record<IdeaDto['feasibility'], number> = { BUILD_NOW: 0, SMALL_ADDITIONS: 1, NOT_FEASIBLE: 2 };
const MAX_IDEAS = 5;

export interface ValidIdea {
  name: string;
  description: string;
  difficulty: Difficulty;
  durationMinutes: number;
  parts: { componentId: string; quantity: number }[];
  steps: string[];
  safetyNotes: string[];
}

const isStr = (v: unknown, min: number, max: number): v is string =>
  typeof v === 'string' && v.trim().length >= min && v.length <= max;

export function validateIdeas(
  value: unknown,
  components: Record<string, Component>,
): { accepted: ValidIdea[]; rejected: { name: string | null; reason: string }[] } {
  const accepted: ValidIdea[] = [];
  const rejected: { name: string | null; reason: string }[] = [];
  const list = value && typeof value === 'object' ? (value as { ideas?: unknown }).ideas : undefined;
  if (!Array.isArray(list)) return { accepted, rejected: [{ name: null, reason: 'Missing "ideas" array.' }] };

  const names = new Set<string>();
  for (const raw of list.slice(0, 10)) {
    if (!raw || typeof raw !== 'object') {
      rejected.push({ name: null, reason: 'Idea is not an object.' });
      continue;
    }
    const i = raw as Record<string, unknown>;
    const name = typeof i.name === 'string' ? i.name.trim() : null;
    const fail = (reason: string) => rejected.push({ name, reason });

    if (!isStr(i.name, 3, 80)) { fail('Name must be 3 to 80 characters.'); continue; }
    if (!isStr(i.description, 20, 400)) { fail('Description must be 20 to 400 characters.'); continue; }
    if (!DIFFICULTIES.includes(i.difficulty as Difficulty)) { fail('Difficulty is not recognised.'); continue; }
    const dur = i.durationMinutes;
    if (typeof dur !== 'number' || !Number.isInteger(dur) || dur < 10 || dur > 1440) { fail('Duration must be 10 to 1440 minutes.'); continue; }

    if (!Array.isArray(i.parts) || i.parts.length < 1 || i.parts.length > 12) { fail('Parts must list 1 to 12 items.'); continue; }
    const parts: { componentId: string; quantity: number }[] = [];
    const seen = new Set<string>();
    let badPart: string | null = null;
    for (const p of i.parts) {
      const pr = (p ?? {}) as Record<string, unknown>;
      const cid = typeof pr.componentId === 'string' ? pr.componentId : '';
      if (!components[cid]) { badPart = `Unknown part "${cid}". Only catalogue parts are allowed.`; break; }
      if (seen.has(cid)) { badPart = 'Each part can be listed only once.'; break; }
      const q = pr.quantity;
      if (typeof q !== 'number' || !Number.isInteger(q) || q < 1 || q > 50) { badPart = 'Part quantities must be whole numbers from 1 to 50.'; break; }
      seen.add(cid);
      parts.push({ componentId: cid, quantity: q });
    }
    if (badPart) { fail(badPart); continue; }

    if (!Array.isArray(i.steps) || i.steps.length < 2 || i.steps.length > 12 || !i.steps.every((s) => isStr(s, 10, 300))) {
      { fail('Steps must be 2 to 12 instructions of 10 to 300 characters.'); continue; }
    }
    if (!Array.isArray(i.safetyNotes) || i.safetyNotes.length < 1 || !i.safetyNotes.every((s) => isStr(s, 5, 200))) {
      { fail('At least one safety note is required.'); continue; }
    }
    const allText = [name, i.description, ...(i.steps as string[]), ...(i.safetyNotes as string[])].join(' ');
    if (FORBIDDEN.test(allText)) { fail('Rejected: involves mains, high voltage, lithium cells or hazardous materials.'); continue; }
    if (names.has(name!.toLowerCase())) { fail('Duplicate project name.'); continue; }

    names.add(name!.toLowerCase());
    accepted.push({
      name: name!,
      description: (i.description as string).trim(),
      difficulty: i.difficulty as Difficulty,
      durationMinutes: dur,
      parts,
      steps: (i.steps as string[]).map((s) => s.trim()),
      safetyNotes: (i.safetyNotes as string[]).map((s) => s.trim()),
    });
    if (accepted.length >= MAX_IDEAS) break;
  }
  return { accepted, rejected };
}

/** Turns a validated idea into a Project so the same rules engine computes ownership and feasibility. */
function ideaAsProject(idea: ValidIdea, index: number): Project {
  return {
    id: `ai-idea-${index}`,
    name: idea.name,
    aliases: [],
    category: 'AI idea',
    description: idea.description,
    difficulty: idea.difficulty,
    durationMinutes: idea.durationMinutes,
    newProductPrice: 0,
    consumablesCost: 0,
    icon: 'bulb',
    requiresSpecCheck: true,
    requirements: idea.parts.map((p) => ({ componentId: p.componentId, quantity: p.quantity })),
    instructions: idea.steps,
    safety: idea.safetyNotes,
    compatibilityNotes: [],
  };
}

export async function runIdeas(input: {
  submission: Pick<SubmissionRow, 'id' | 'user_id' | 'device_type' | 'brand' | 'condition' | 'age_years' | 'available_components'>;
  components: Component[];
  ai: AiClient | null;
  model: string | null;
}): Promise<IdeaRun> {
  if (!input.ai) {
    return {
      aiStatus: 'not_configured',
      aiNote: 'AI project prediction needs ANTHROPIC_API_KEY on the server. No ideas were generated.',
      ideas: [],
      rows: [],
    };
  }
  const componentMap = Object.fromEntries(input.components.map((c) => [c.id, c]));
  const owned = input.submission.available_components.flatMap((p: SubmissionComponentInput) => {
    const c = componentMap[p.componentId];
    return c ? [{ componentId: p.componentId, name: c.name, quantity: p.quantity, condition: p.condition }] : [];
  });

  try {
    const text = await input.ai.complete({
      system: IDEA_SYSTEM_PROMPT,
      user: buildIdeaPrompt({
        device: { type: input.submission.device_type, brand: input.submission.brand, condition: input.submission.condition, ageYears: input.submission.age_years },
        owned,
        catalogue: input.components,
      }),
      maxTokens: 2500,
    });
    const parsed = parseModelJson(text);
    if (!parsed.ok) return failed(`AI output rejected: ${parsed.reason}`);

    const { accepted, rejected } = validateIdeas(parsed.value, componentMap);
    if (accepted.length === 0) return failed('No AI idea passed validation.');

    const inventory = submissionInventory(input.submission.available_components, componentMap);
    const ideas: IdeaDto[] = accepted.map((idea, index) => {
      const r = evaluateProject(ideaAsProject(idea, index), inventory, componentMap);
      return {
        rank: 0,
        name: idea.name,
        description: idea.description,
        difficulty: idea.difficulty,
        durationMinutes: idea.durationMinutes,
        parts: idea.parts.map((p) => ({ componentId: p.componentId, name: componentMap[p.componentId].name, quantity: p.quantity })),
        steps: idea.steps,
        safetyNotes: [...idea.safetyNotes, ...(r.warnings.length ? ['Verify the items flagged in the compatibility notes before wiring.'] : [])],
        feasibility: r.feasibility,
        matchPercent: r.matchPercent,
        missing: r.requirements.filter((q) => q.missing > 0).map((q) => ({ componentId: q.componentId, name: q.name, quantity: q.missing })),
        estimatedBuildCost: r.additionalCost,
        source: 'ai' as const,
      };
    }).sort((a, b) => FEASIBILITY_RANK[a.feasibility] - FEASIBILITY_RANK[b.feasibility] || b.matchPercent - a.matchPercent);
    ideas.forEach((d, i) => (d.rank = i + 1));

    const note = rejected.length
      ? `${ideas.length} idea(s) passed validation; ${rejected.length} were rejected by the safety and catalogue checks.`
      : `${ideas.length} idea(s) passed validation.`;
    return {
      aiStatus: 'used',
      aiNote: note,
      ideas,
      rows: ideas.map((d) => ({
        submission_id: input.submission.id,
        user_id: input.submission.user_id,
        rank: d.rank,
        name: d.name,
        description: d.description,
        difficulty: d.difficulty,
        duration_minutes: d.durationMinutes,
        parts: d.parts.map((p) => ({ componentId: p.componentId, quantity: p.quantity })),
        steps: d.steps,
        safety_notes: d.safetyNotes,
        feasibility: d.feasibility,
        match_percent: d.matchPercent,
        missing_components: d.missing,
        estimated_build_cost: d.estimatedBuildCost,
        model: input.model,
        validation: { rejected, note },
      })),
    };
  } catch (err) {
    const msg = err instanceof Error && /\(\d{3}\)/.test(err.message) ? err.message : 'AI request failed.';
    return { aiStatus: 'error', aiNote: `${msg} No ideas were generated.`, ideas: [], rows: [] };
  }
}

function failed(reason: string): IdeaRun {
  return { aiStatus: 'failed_validation', aiNote: `${reason} No ideas were generated. Try again.`, ideas: [], rows: [] };
}
