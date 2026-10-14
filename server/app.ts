import type { IncomingMessage, ServerResponse } from 'node:http';
import { validateReview, validateSubmission } from '../shared/submission';
import type { AiClient } from './ai';
import { runRecommendations, type RecommendationRun } from './recommendations';
import { runIdeas } from './ideas';
import { DbError } from './supabase';
import type { AuthUser, CatalogueData, Db, SubmissionRow, TokenVerifier } from './types';

export interface AppDeps {
  db: Db | null;
  verifyAccessToken: TokenVerifier | null;
  ai: AiClient | null;
  aiModel: string | null;
  /** Catalogue cache lifetime. Keeps repeated submissions from re-reading every row. */
  catalogueTtlMs?: number;
  now?: () => number;
}

const MAX_BODY_BYTES = 64 * 1024;

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function submissionDto(r: SubmissionRow) {
  return {
    id: r.id,
    deviceType: r.device_type,
    brand: r.brand,
    model: r.model,
    condition: r.condition,
    ageYears: r.age_years,
    availableComponents: r.available_components,
    notes: r.notes,
    status: r.status,
    reviewerNotes: r.reviewer_notes,
    submittedBy: r.user_id,
    submitterEmail: r.profiles?.email ?? null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function recommendationDto(run: RecommendationRun, submissionId: string) {
  return {
    submissionId,
    source: run.source,
    aiStatus: run.aiStatus,
    aiNote: run.aiNote,
    recommendations: run.recommendations,
  };
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) throw new HttpError(413, 'Request body is too large.');
    chunks.push(chunk as Buffer);
  }
  if (size === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, 'Request body must be valid JSON.');
  }
}

function send(res: ServerResponse, status: number, body: unknown) {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(json),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(json);
}

export function createApp(deps: AppDeps) {
  const ttl = deps.catalogueTtlMs ?? 60_000;
  const now = deps.now ?? Date.now;
  let cache: { at: number; data: CatalogueData } | null = null;

  async function catalogue(): Promise<CatalogueData> {
    if (!deps.db) throw new HttpError(503, 'Database is not configured on the server.');
    if (cache && now() - cache.at < ttl) return cache.data;
    const data = await deps.db.loadCatalogue();
    cache = { at: now(), data };
    return data;
  }

  async function requireUser(req: IncomingMessage): Promise<{ user: AuthUser; token: string }> {
    if (!deps.verifyAccessToken || !deps.db) throw new HttpError(503, 'Database is not configured on the server.');
    const header = req.headers.authorization ?? '';
    const m = header.match(/^Bearer\s+(.+)$/i);
    if (!m) throw new HttpError(401, 'Sign in is required.');
    const user = await deps.verifyAccessToken(m[1]);
    if (!user) throw new HttpError(401, 'Your session is invalid or has expired. Please sign in again.');
    return { user, token: m[1] };
  }

  async function requireAdmin(req: IncomingMessage) {
    const auth = await requireUser(req);
    const role = await deps.db!.getRole(auth.user.id);
    if (role !== 'admin') throw new HttpError(403, 'Administrator access is required.');
    return auth;
  }

  async function route(req: IncomingMessage, res: ServerResponse) {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const path = url.pathname.replace(/\/+$/, '') || '/';
    const method = req.method ?? 'GET';

    if (path === '/api/health' && method === 'GET') {
      return send(res, 200, {
        status: 'ok',
        database: deps.db ? 'configured' : 'not_configured',
        ai: deps.ai ? 'configured' : 'not_configured',
      });
    }

    if (path === '/api/me' && method === 'GET') {
      const { user } = await requireUser(req);
      const role = await deps.db!.getRole(user.id);
      return send(res, 200, { id: user.id, email: user.email, role: role ?? 'user' });
    }

    if (path === '/api/submissions' && method === 'POST') {
      const { user, token } = await requireUser(req);
      const cat = await catalogue();
      const body = await readJson(req);
      const v = validateSubmission(body, new Set(cat.components.map((c) => c.id)));
      if (!v.ok) return send(res, 422, { error: 'Please correct the highlighted fields.', fields: v.errors });
      const row = await deps.db!.createSubmission(user.id, token, {
        device_type: v.value.deviceType,
        brand: v.value.brand,
        model: v.value.model,
        condition: v.value.condition,
        age_years: v.value.ageYears,
        available_components: v.value.availableComponents,
        notes: v.value.notes,
      });
      return send(res, 201, { submission: submissionDto(row) });
    }

    if (path === '/api/submissions' && method === 'GET') {
      const { token } = await requireUser(req);
      const rows = await deps.db!.listOwnSubmissions(token);
      return send(res, 200, { submissions: rows.map(submissionDto) });
    }

    const subMatch = path.match(/^\/api\/submissions\/([0-9a-f-]{36})(\/recommendations|\/ai-ideas)?$/i);
    if (subMatch) {
      const id = subMatch[1];
      const isRecs = subMatch[2] === '/recommendations';
      const isIdeas = subMatch[2] === '/ai-ideas';
      const { user, token } = await requireUser(req);
      const row = await deps.db!.getOwnSubmission(id, token);
      if (!row) throw new HttpError(404, 'Submission not found.');

      if (isIdeas && method === 'GET') {
        const rows = await deps.db!.listOwnAiIdeas(id, token);
        return send(res, 200, {
          submissionId: id,
          ideas: rows.map((r) => ({
            rank: r.rank, name: r.name, description: r.description, difficulty: r.difficulty,
            durationMinutes: r.duration_minutes, parts: r.parts, steps: r.steps, safetyNotes: r.safety_notes,
            feasibility: r.feasibility, matchPercent: r.match_percent, missing: r.missing_components,
            estimatedBuildCost: r.estimated_build_cost,
          })),
        });
      }

      if (isIdeas && method === 'POST') {
        const cat = await catalogue();
        const run = await runIdeas({ submission: row, components: cat.components, ai: deps.ai, model: deps.aiModel });
        // Stored ideas are replaced only when the new run passed validation.
        if (run.aiStatus === 'used') {
          await deps.db!.replaceAiIdeas(id, run.rows.map((r) => ({ ...r, user_id: user.id })));
        }
        return send(res, 200, { submissionId: id, aiStatus: run.aiStatus, aiNote: run.aiNote, ideas: run.ideas });
      }

      if (!isRecs && !isIdeas && method === 'GET') return send(res, 200, { submission: submissionDto(row) });

      if (isRecs && method === 'GET') {
        const recs = await deps.db!.listOwnRecommendations(id, token);
        return send(res, 200, {
          submissionId: id,
          recommendations: recs.map((r) => ({
            rank: r.rank, productId: r.product_id, feasibility: r.feasibility, matchPercent: r.match_percent,
            missing: r.missing_components, explanation: r.explanation, safetyNotes: r.safety_notes, source: r.source,
          })),
        });
      }

      if (isRecs && method === 'POST') {
        const cat = await catalogue();
        const run = await runRecommendations({
          submission: row,
          products: cat.products,
          components: cat.components,
          ai: deps.ai,
          model: deps.aiModel,
        });
        await deps.db!.replaceRecommendations(id, run.rows.map((r) => ({ ...r, user_id: user.id })));
        return send(res, 200, recommendationDto(run, id));
      }
      throw new HttpError(405, 'Method not allowed.');
    }

    if (path === '/api/admin/submissions' && method === 'GET') {
      await requireAdmin(req);
      const status = url.searchParams.get('status') ?? undefined;
      const allowed = ['pending', 'under_review', 'accepted', 'rejected', 'needs_info'];
      if (status && !allowed.includes(status)) throw new HttpError(400, 'Unknown status filter.');
      const rows = await deps.db!.listAllSubmissions(status as SubmissionRow['status'] | undefined);
      return send(res, 200, { submissions: rows.map(submissionDto) });
    }

    const adminMatch = path.match(/^\/api\/admin\/submissions\/([0-9a-f-]{36})$/i);
    if (adminMatch && method === 'PATCH') {
      const { user } = await requireAdmin(req);
      const v = validateReview(await readJson(req));
      if (!v.ok) return send(res, 422, { error: 'Please correct the highlighted fields.', fields: v.errors });
      const row = await deps.db!.updateSubmission(adminMatch[1], {
        status: v.value.status,
        reviewer_notes: v.value.reviewerNotes,
        reviewer_id: user.id,
      });
      if (!row) throw new HttpError(404, 'Submission not found.');
      return send(res, 200, { submission: submissionDto(row) });
    }

    throw new HttpError(404, 'Not found.');
  }

  return async function handle(req: IncomingMessage, res: ServerResponse) {
    try {
      await route(req, res);
    } catch (err) {
      if (err instanceof HttpError) return send(res, err.status, { error: err.message });
      if (err instanceof DbError) {
        console.error('[api] database error:', err.status);
        return send(res, 502, { error: 'The database request failed. Please try again.' });
      }
      console.error('[api] unexpected error');
      return send(res, 500, { error: 'Unexpected server error.' });
    }
  };
}
