import type { Component, Project } from '../src/types';
import type { ComponentCondition, DeviceCondition, DeviceType, SubmissionComponentInput, SubmissionStatus } from '../shared/submission';

export interface SubmissionRow {
  id: string;
  user_id: string;
  device_type: DeviceType;
  brand: string;
  model: string | null;
  condition: DeviceCondition;
  age_years: number;
  available_components: SubmissionComponentInput[];
  notes: string | null;
  status: SubmissionStatus;
  reviewer_id: string | null;
  reviewer_notes: string | null;
  created_at: string;
  updated_at: string;
  profiles?: { email: string } | null;
}

export interface NewSubmissionRow {
  device_type: DeviceType;
  brand: string;
  model: string | null;
  condition: DeviceCondition;
  age_years: number;
  available_components: SubmissionComponentInput[];
  notes: string | null;
}

export interface RecommendationRow {
  id?: string;
  submission_id: string;
  user_id: string;
  product_id: string;
  rank: number;
  source: 'ai' | 'rule_based';
  model: string | null;
  match_percent: number;
  feasibility: 'BUILD_NOW' | 'SMALL_ADDITIONS' | 'NOT_FEASIBLE';
  explanation: string;
  missing_components: { componentId: string; name: string; quantity: number }[];
  safety_notes: string[];
  validation: Record<string, unknown>;
  created_at?: string;
}

export interface AiIdeaRow {
  id?: string;
  submission_id: string;
  user_id: string;
  rank: number;
  name: string;
  description: string;
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced';
  duration_minutes: number;
  parts: { componentId: string; quantity: number }[];
  steps: string[];
  safety_notes: string[];
  feasibility: 'BUILD_NOW' | 'SMALL_ADDITIONS' | 'NOT_FEASIBLE';
  match_percent: number;
  missing_components: { componentId: string; name: string; quantity: number }[];
  estimated_build_cost: number;
  model: string | null;
  validation: Record<string, unknown>;
  created_at?: string;
}

export interface CatalogueData {
  components: Component[];
  products: Project[];
}

export interface AuthUser {
  id: string;
  email: string;
}

/** Persistence boundary. Production: SupabaseDb. Tests: an in-memory double. */
export interface Db {
  createSubmission(userId: string, userToken: string, row: NewSubmissionRow): Promise<SubmissionRow>;
  getOwnSubmission(id: string, userToken: string): Promise<SubmissionRow | null>;
  listOwnSubmissions(userToken: string): Promise<SubmissionRow[]>;
  listOwnRecommendations(submissionId: string, userToken: string): Promise<RecommendationRow[]>;
  loadCatalogue(): Promise<CatalogueData>;
  getRole(userId: string): Promise<'user' | 'admin' | null>;
  listAllSubmissions(status?: SubmissionStatus): Promise<SubmissionRow[]>;
  updateSubmission(
    id: string,
    patch: { status: SubmissionStatus; reviewer_notes: string | null; reviewer_id: string },
  ): Promise<SubmissionRow | null>;
  replaceRecommendations(submissionId: string, rows: RecommendationRow[]): Promise<void>;
  listOwnAiIdeas(submissionId: string, userToken: string): Promise<AiIdeaRow[]>;
  replaceAiIdeas(submissionId: string, rows: AiIdeaRow[]): Promise<void>;
}

export type TokenVerifier = (token: string) => Promise<AuthUser | null>;
