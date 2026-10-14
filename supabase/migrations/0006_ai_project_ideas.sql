-- 0006: AI-predicted project ideas for a submission. Written only by the server (service role).
-- Ideas are not limited to the product catalogue. Every part must be a catalogue component.
-- Users read ideas for their own submissions. Admins can read all.

create table if not exists public.ai_project_ideas (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.ewaste_submissions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  rank integer not null check (rank >= 1),
  name text not null check (char_length(name) between 3 and 80),
  description text not null check (char_length(description) between 20 and 400),
  difficulty text not null check (difficulty in ('Beginner', 'Intermediate', 'Advanced')),
  duration_minutes integer not null check (duration_minutes between 10 and 1440),
  parts jsonb not null check (jsonb_typeof(parts) = 'array'),
  steps jsonb not null check (jsonb_typeof(steps) = 'array'),
  safety_notes jsonb not null check (jsonb_typeof(safety_notes) = 'array'),
  feasibility text not null check (feasibility in ('BUILD_NOW', 'SMALL_ADDITIONS', 'NOT_FEASIBLE')),
  match_percent integer not null check (match_percent between 0 and 100),
  missing_components jsonb not null default '[]'::jsonb,
  estimated_build_cost numeric(10,2) not null check (estimated_build_cost >= 0),
  model text,
  validation jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists ai_project_ideas_submission_idx on public.ai_project_ideas (submission_id, rank);

alter table public.ai_project_ideas enable row level security;

create policy "ai ideas: read own or admin"
  on public.ai_project_ideas for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
-- No client insert/update/delete policies. Only the server (service role) writes these.
