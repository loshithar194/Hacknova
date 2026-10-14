import type { SubmissionStatus } from '../shared/submission';
import { mapComponentRow, mapProductRow } from '../shared/catalogueMapping';
import { fetchAllRows } from '../shared/pagination';
import type { AiIdeaRow, AuthUser, CatalogueData, Db, NewSubmissionRow, RecommendationRow, SubmissionRow, TokenVerifier } from './types';

export interface SupabaseConfig {
  url: string;
  anonKey: string;
  serviceRoleKey?: string;
}

export class DbError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const PAGE_SIZE = 500;

/**
 * Thin PostgREST + Auth client built on fetch. No secrets are included in error messages.
 * User-scoped calls send the user's JWT, so Row Level Security applies. Service-role calls
 * bypass RLS and are used only for server-side writes after explicit authorization checks.
 */
export function createSupabaseClient(cfg: SupabaseConfig, fetchImpl: typeof fetch = fetch) {
  const base = cfg.url.replace(/\/+$/, '');

  async function rest(
    path: string,
    opts: { method?: string; token?: string; service?: boolean; body?: unknown; prefer?: string; range?: [number, number] } = {},
  ): Promise<{ data: any; headers: Headers }> {
    const key = opts.service ? cfg.serviceRoleKey : cfg.anonKey;
    if (!key) throw new DbError(503, 'Service key is not configured on the server.');
    const headers: Record<string, string> = {
      apikey: key,
      Authorization: `Bearer ${opts.token ?? key}`,
      Accept: 'application/json',
    };
    if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
    if (opts.prefer) headers.Prefer = opts.prefer;
    if (opts.range) {
      headers['Range-Unit'] = 'items';
      headers.Range = `${opts.range[0]}-${opts.range[1]}`;
    }
    const res = await fetchImpl(`${base}/rest/v1/${path}`, {
      method: opts.method ?? 'GET',
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
    if (!res.ok) {
      throw new DbError(res.status, `Database request failed (${res.status}).`);
    }
    const text = await res.text();
    return { data: text ? JSON.parse(text) : null, headers: res.headers };
  }

  async function verifyAccessToken(token: string): Promise<AuthUser | null> {
    const res = await fetchImpl(`${base}/auth/v1/user`, {
      headers: { apikey: cfg.anonKey, Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const u = (await res.json()) as { id?: string; email?: string };
    if (!u.id) return null;
    return { id: u.id, email: u.email ?? '' };
  }

  const db: Db = {
    async createSubmission(userId, userToken, row: NewSubmissionRow) {
      const { data } = await rest('ewaste_submissions?select=*', {
        method: 'POST',
        token: userToken,
        body: { ...row, user_id: userId },
        prefer: 'return=representation',
      });
      return (data as SubmissionRow[])[0];
    },

    async getOwnSubmission(id, userToken) {
      const { data } = await rest(`ewaste_submissions?select=*&id=eq.${encodeURIComponent(id)}`, { token: userToken });
      return (data as SubmissionRow[])[0] ?? null;
    },

    async listOwnSubmissions(userToken) {
      const { data } = await rest('ewaste_submissions?select=*&order=created_at.desc', { token: userToken });
      return data as SubmissionRow[];
    },

    async listOwnRecommendations(submissionId, userToken) {
      const { data } = await rest(
        `reuse_recommendations?select=*&submission_id=eq.${encodeURIComponent(submissionId)}&order=rank.asc`,
        { token: userToken },
      );
      return data as RecommendationRow[];
    },

    async loadCatalogue(): Promise<CatalogueData> {
      // The catalogue is public read under RLS, so the least-privileged anon key is used.
      const service = false;
      const componentRows = await fetchAllRows<Record<string, any>>(
        (offset, limit) =>
          rest('components?select=*&is_active=eq.true&order=id.asc', { service, range: [offset, offset + limit - 1] }).then((r) => r.data),
        PAGE_SIZE,
      );
      const productRows = await fetchAllRows<Record<string, any>>(
        (offset, limit) =>
          rest(
            'products?select=*,product_requirements(component_id,required_quantity,compatible_alternatives,is_critical)&is_active=eq.true&order=id.asc',
            { service, range: [offset, offset + limit - 1] },
          ).then((r) => r.data),
        PAGE_SIZE,
      );
      return { components: componentRows.map(mapComponentRow), products: productRows.map(mapProductRow) };
    },

    async getRole(userId) {
      const { data } = await rest(`profiles?select=role&id=eq.${encodeURIComponent(userId)}`, { service: true });
      const row = (data as { role: 'user' | 'admin' }[])[0];
      return row ? row.role : null;
    },

    async listAllSubmissions(status?: SubmissionStatus) {
      const filter = status ? `&status=eq.${status}` : '';
      const { data } = await rest(
        `ewaste_submissions?select=*,profiles(email)${filter}&order=created_at.desc`,
        { service: true },
      );
      return data as SubmissionRow[];
    },

    async updateSubmission(id, patch) {
      const { data } = await rest(
        `ewaste_submissions?id=eq.${encodeURIComponent(id)}&select=*,profiles(email)`,
        { method: 'PATCH', service: true, body: { ...patch, updated_at: new Date().toISOString() }, prefer: 'return=representation' },
      );
      return (data as SubmissionRow[])[0] ?? null;
    },

    async listOwnAiIdeas(submissionId, userToken) {
      const { data } = await rest(
        `ai_project_ideas?select=*&submission_id=eq.${encodeURIComponent(submissionId)}&order=rank.asc`,
        { token: userToken },
      );
      return data as AiIdeaRow[];
    },

    async replaceAiIdeas(submissionId, rows) {
      await rest(`ai_project_ideas?submission_id=eq.${encodeURIComponent(submissionId)}`, { method: 'DELETE', service: true, prefer: 'return=minimal' });
      if (rows.length === 0) return;
      await rest('ai_project_ideas', { method: 'POST', service: true, body: rows, prefer: 'return=minimal' });
    },

    async replaceRecommendations(submissionId, rows) {
      await rest(`reuse_recommendations?submission_id=eq.${encodeURIComponent(submissionId)}`, { method: 'DELETE', service: true, prefer: 'return=minimal' });
      if (rows.length === 0) return;
      await rest('reuse_recommendations', { method: 'POST', service: true, body: rows, prefer: 'return=minimal' });
    },
  };

  const verify: TokenVerifier = verifyAccessToken;
  return { db, verifyAccessToken: verify, rest };
}

