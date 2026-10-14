/**
 * TEST DOUBLE ONLY. An in-memory stand-in for the Db interface so the HTTP layer can be
 * exercised without a Supabase project. It is never imported by application code.
 * It mirrors the production RLS rules: users see only their own rows, admins see all.
 */
import { randomUUID } from 'node:crypto';
import { BUNDLED_COMPONENTS, BUNDLED_PROJECTS } from '../../src/data/catalog';
import type { AiIdeaRow, AuthUser, Db, NewSubmissionRow, RecommendationRow, SubmissionRow } from '../../server/types';
import type { SubmissionStatus } from '../../shared/submission';

export interface FakeUser extends AuthUser { token: string; role: 'user' | 'admin' }

export function createFakeDb(users: FakeUser[]) {
  const submissions: SubmissionRow[] = [];
  const recommendations: RecommendationRow[] = [];
  const aiIdeas: AiIdeaRow[] = [];
  const tokenToUser = new Map(users.map((u) => [u.token, u]));
  const idToUser = new Map(users.map((u) => [u.id, u]));
  const calls = { loadCatalogue: 0, replaceRecommendations: 0 };

  const db: Db = {
    async createSubmission(userId, userToken, row: NewSubmissionRow) {
      if (tokenToUser.get(userToken)?.id !== userId) throw new Error('RLS: user mismatch');
      const now = new Date().toISOString();
      const r: SubmissionRow = {
        id: randomUUID(), user_id: userId, status: 'pending', reviewer_id: null, reviewer_notes: null,
        created_at: now, updated_at: now, profiles: { email: idToUser.get(userId)?.email ?? '' }, ...row,
      };
      submissions.push(r);
      return r;
    },
    async getOwnSubmission(id, userToken) {
      const u = tokenToUser.get(userToken);
      return submissions.find((s) => s.id === id && (u?.role === 'admin' || s.user_id === u?.id)) ?? null;
    },
    async listOwnSubmissions(userToken) {
      const u = tokenToUser.get(userToken);
      return submissions.filter((s) => s.user_id === u?.id);
    },
    async listOwnRecommendations(submissionId, userToken) {
      const u = tokenToUser.get(userToken);
      return recommendations.filter((r) => r.submission_id === submissionId && r.user_id === u?.id);
    },
    async loadCatalogue() {
      calls.loadCatalogue++;
      return { components: BUNDLED_COMPONENTS, products: BUNDLED_PROJECTS };
    },
    async getRole(userId) {
      return idToUser.get(userId)?.role ?? null;
    },
    async listAllSubmissions(status?: SubmissionStatus) {
      return submissions.filter((s) => !status || s.status === status);
    },
    async updateSubmission(id, patch) {
      const s = submissions.find((x) => x.id === id);
      if (!s) return null;
      Object.assign(s, { status: patch.status, reviewer_notes: patch.reviewer_notes, reviewer_id: patch.reviewer_id, updated_at: new Date().toISOString() });
      return s;
    },
    async listOwnAiIdeas(submissionId, userToken) {
      const u = tokenToUser.get(userToken);
      return aiIdeas.filter((r) => r.submission_id === submissionId && r.user_id === u?.id);
    },
    async replaceAiIdeas(submissionId, rows) {
      for (let i = aiIdeas.length - 1; i >= 0; i--) if (aiIdeas[i].submission_id === submissionId) aiIdeas.splice(i, 1);
      for (const r of rows) aiIdeas.push({ ...r, id: randomUUID(), created_at: new Date().toISOString() });
    },
    async replaceRecommendations(submissionId, rows) {
      calls.replaceRecommendations++;
      for (let i = recommendations.length - 1; i >= 0; i--) {
        if (recommendations[i].submission_id === submissionId) recommendations.splice(i, 1);
      }
      for (const r of rows) recommendations.push({ ...r, id: randomUUID(), created_at: new Date().toISOString() });
    },
  };

  return { db, submissions, recommendations, aiIdeas, calls, tokenToUser };
}
