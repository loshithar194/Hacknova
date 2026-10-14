-- 0003: e-waste submissions. Users create and read only their own rows.
-- Admins read all rows and change status. Users cannot change status or reviewer fields.

create table if not exists public.ewaste_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  device_type text not null check (device_type in ('Computer','Printer','Router','Toy','Electronics kit','Circuit board','Phone','Other')),
  brand text not null check (char_length(brand) between 1 and 60),
  model text check (model is null or char_length(model) <= 80),
  condition text not null check (condition in ('Working','Partly working','Not working','Unknown')),
  age_years integer not null check (age_years between 0 and 50),
  available_components jsonb not null default '[]'::jsonb
    check (jsonb_typeof(available_components) = 'array' and jsonb_array_length(available_components) between 1 and 50),
  notes text check (notes is null or char_length(notes) <= 500),
  status text not null default 'pending' check (status in ('pending','under_review','accepted','rejected','needs_info')),
  reviewer_id uuid references public.profiles(id) on delete set null,
  reviewer_notes text check (reviewer_notes is null or char_length(reviewer_notes) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ewaste_submissions_user_idx on public.ewaste_submissions (user_id, created_at desc);
create index if not exists ewaste_submissions_status_idx on public.ewaste_submissions (status, created_at desc);

alter table public.ewaste_submissions enable row level security;

create policy "submissions: users insert own"
  on public.ewaste_submissions for insert to authenticated
  with check (user_id = auth.uid() and status = 'pending' and reviewer_id is null);

create policy "submissions: read own or admin"
  on public.ewaste_submissions for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

create policy "submissions: admin updates status"
  on public.ewaste_submissions for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- No delete policy: submissions are retained for review. Only the service role can delete.
