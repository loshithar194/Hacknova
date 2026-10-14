/**
 * Server-side AI client. The API key is read from the server environment only.
 * The model is asked for JSON. The response is treated as untrusted and validated
 * in recommendations.ts before anything is stored.
 */
export interface AiClient {
  complete(prompt: { system: string; user: string; maxTokens?: number }): Promise<string>;
}

export class AiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function createAnthropicClient(
  cfg: { apiKey: string; model: string },
  fetchImpl: typeof fetch = fetch,
): AiClient {
  return {
    async complete({ system, user, maxTokens }) {
      const res = await fetchImpl('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': cfg.apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: cfg.model,
          max_tokens: maxTokens ?? 1200,
          system,
          messages: [{ role: 'user', content: user }],
        }),
      });
      if (!res.ok) throw new AiError(res.status, `AI request failed (${res.status}).`);
      const data = (await res.json()) as { content?: { type: string; text?: string }[] };
      return (data.content ?? [])
        .filter((b) => b.type === 'text' && typeof b.text === 'string')
        .map((b) => b.text as string)
        .join('');
    },
  };
}

export const AI_SYSTEM_PROMPT = [
  'You are a cautious electronics reuse assistant for a hobby platform.',
  'You receive a list of parts a user owns and a list of candidate projects that are already',
  'checked for quantity feasibility. Choose up to 5 projects to recommend and explain them briefly.',
  'Never invent parts, products, or electrical specifications. Only use product ids from the list.',
  'Always include safety notes. Warn about verifying datasheets before wiring.',
  'Respond with ONLY a JSON object, with no markdown and no prose, in this exact shape:',
  '{"recommendations":[{"productId":"<id>","explanation":"<2-4 sentences>","safetyNotes":["<note>"]}]}',
].join(' ');

export function buildUserPrompt(input: {
  device: { type: string; brand: string; model: string | null; condition: string; ageYears: number; notes: string | null };
  parts: { name: string; quantity: number; condition: string }[];
  candidates: { id: string; name: string; difficulty: string; requirements: { name: string; quantity: number }[] }[];
}): string {
  return JSON.stringify(input, null, 2);
}

/** Accepts only a bare JSON object, or one wrapped in a single ```json fence. */
export function parseModelJson(text: string): { ok: true; value: unknown } | { ok: false; reason: string } {
  let body = text.trim();
  const fence = body.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fence) body = fence[1];
  try {
    return { ok: true, value: JSON.parse(body) };
  } catch {
    return { ok: false, reason: 'The model response was not valid JSON.' };
  }
}

export interface AcceptedAiRec {
  productId: string;
  explanation: string;
  safetyNotes: string[];
}

export interface RejectedAiRec {
  productId: string | null;
  reason: string;
}

export function validateAiRecommendations(
  value: unknown,
  allowedProductIds: ReadonlySet<string>,
): { accepted: AcceptedAiRec[]; rejected: RejectedAiRec[] } {
  const accepted: AcceptedAiRec[] = [];
  const rejected: RejectedAiRec[] = [];
  const list = value && typeof value === 'object' ? (value as { recommendations?: unknown }).recommendations : undefined;
  if (!Array.isArray(list)) return { accepted, rejected: [{ productId: null, reason: 'Missing "recommendations" array.' }] };

  const seen = new Set<string>();
  for (const item of list.slice(0, 10)) {
    if (!item || typeof item !== 'object') {
      rejected.push({ productId: null, reason: 'Entry is not an object.' });
      continue;
    }
    const r = item as Record<string, unknown>;
    const productId = typeof r.productId === 'string' ? r.productId : null;
    if (!productId || !allowedProductIds.has(productId)) {
      rejected.push({ productId, reason: 'Product is not in the candidate list.' });
      continue;
    }
    if (seen.has(productId)) {
      rejected.push({ productId, reason: 'Duplicate product.' });
      continue;
    }
    const explanation = typeof r.explanation === 'string' ? r.explanation.trim() : '';
    if (explanation.length < 20 || explanation.length > 600) {
      rejected.push({ productId, reason: 'Explanation must be 20 to 600 characters.' });
      continue;
    }
    const notes = Array.isArray(r.safetyNotes)
      ? r.safetyNotes.filter((n): n is string => typeof n === 'string' && n.trim().length >= 5 && n.length <= 200).map((n) => n.trim())
      : [];
    if (notes.length === 0) {
      rejected.push({ productId, reason: 'At least one valid safety note is required.' });
      continue;
    }
    seen.add(productId);
    accepted.push({ productId, explanation, safetyNotes: notes.slice(0, 5) });
    if (accepted.length >= 5) break;
  }
  return { accepted, rejected };
}
