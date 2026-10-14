-- 0002: component and product catalogue. Public read for active rows; admin-only writes.
-- The app reads the whole catalogue with pagination. There is no fixed row limit in the schema.

create table if not exists public.components (
  id text primary key,
  name text not null check (char_length(name) between 1 and 120),
  category text not null,
  description text not null default '',
  unit_price numeric(10,2) not null check (unit_price >= 0),
  weight_grams numeric(10,2) not null check (weight_grams >= 0),
  specs text not null default '',
  compatibility text not null default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.products (
  id text primary key,
  name text not null check (char_length(name) between 1 and 160),
  aliases text[] not null default '{}',
  category text not null,
  description text not null default '',
  difficulty text not null check (difficulty in ('Beginner', 'Intermediate', 'Advanced')),
  duration_minutes integer not null check (duration_minutes > 0),
  new_product_price numeric(10,2) not null check (new_product_price >= 0),
  consumables_cost numeric(10,2) not null default 0 check (consumables_cost >= 0),
  icon text not null,
  requires_spec_check boolean not null default false,
  instructions jsonb not null default '[]'::jsonb check (jsonb_typeof(instructions) = 'array'),
  safety_notes jsonb not null default '[]'::jsonb check (jsonb_typeof(safety_notes) = 'array'),
  compatibility_notes jsonb not null default '[]'::jsonb check (jsonb_typeof(compatibility_notes) = 'array'),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.product_requirements (
  id bigint generated always as identity primary key,
  product_id text not null references public.products(id) on delete cascade,
  component_id text not null references public.components(id) on delete restrict,
  required_quantity integer not null check (required_quantity >= 1),
  compatible_alternatives text[] not null default '{}',
  is_critical boolean not null default false,
  unique (product_id, component_id)
);

create index if not exists product_requirements_product_idx on public.product_requirements (product_id);

alter table public.components enable row level security;
alter table public.products enable row level security;
alter table public.product_requirements enable row level security;

create policy "components: public read active"
  on public.components for select to anon, authenticated
  using (is_active or public.is_admin());
create policy "components: admin write"
  on public.components for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "products: public read active"
  on public.products for select to anon, authenticated
  using (is_active or public.is_admin());
create policy "products: admin write"
  on public.products for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "requirements: public read for active products"
  on public.product_requirements for select to anon, authenticated
  using (
    exists (select 1 from public.products p where p.id = product_id and p.is_active)
    or public.is_admin()
  );
create policy "requirements: admin write"
  on public.product_requirements for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
