-- 0004: validated reuse recommendations. Written only by the server (service role).
-- Users can read recommendations for their own submissions. Clients cannot write them.

create table if not exists public.reuse_recommendations (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.ewaste_submissions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  product_id text not null references public.products(id) on delete cascade,
  rank integer not null check (rank >= 1),
  source text not null check (source in ('ai', 'rule_based')),
  model text,
  match_percent integer not null check (match_percent between 0 and 100),
  feasibility text not null check (feasibility in ('BUILD_NOW','SMALL_ADDITIONS','NOT_FEASIBLE')),
  explanation text not null check (char_length(explanation) between 1 and 2000),
  missing_components jsonb not null default '[]'::jsonb,
  safety_notes jsonb not null default '[]'::jsonb check (jsonb_typeof(safety_notes) = 'array'),
  validation jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists reuse_recommendations_submission_idx on public.reuse_recommendations (submission_id, rank);

alter table public.reuse_recommendations enable row level security;

create policy "recommendations: read own or admin"
  on public.reuse_recommendations for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
-- No insert/update/delete policies for clients. The service role bypasses RLS on the server.
