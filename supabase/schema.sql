-- Esquema aplicado al proyecto Supabase de Mi balance.
-- La clave pública solo puede acceder a datos después de iniciar sesión.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  monthly_budget_cents integer not null default 0 check (monthly_budget_cents >= 0),
  monthly_saving_goal_cents integer not null default 0 check (monthly_saving_goal_cents >= 0),
  home_widgets jsonb not null default '["balance","projection","fundingGoals","progress","forecasts","recent"]'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.movements (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  concept text not null check (char_length(concept) between 1 and 160),
  amount_cents integer not null check (amount_cents > 0),
  movement_date date not null,
  category_id text not null,
  kind text not null check (kind in ('expense', 'income', 'saving')),
  status text not null check (status in ('confirmed', 'planned')),
  forecast_id uuid references public.movements(id) on delete set null,
  funding_plan_id uuid,
  funding_role text check (funding_role in ('target', 'contribution')),
  funding_installments integer check (funding_installments is null or funding_installments between 2 and 120),
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.monthly_closings (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  month date not null,
  notes text not null default '',
  snapshot jsonb not null,
  closed_at timestamptz not null default now(),
  unique (user_id, month)
);

create index if not exists movements_user_date_idx on public.movements (user_id, movement_date desc);
create index if not exists movements_forecast_idx on public.movements (forecast_id);
create index if not exists closings_user_month_idx on public.monthly_closings (user_id, month desc);

alter table public.profiles enable row level security;
alter table public.movements enable row level security;
alter table public.monthly_closings enable row level security;

-- Actualizaciones seguras para proyectos que ya tenían las tablas creadas.
alter table public.profiles add column if not exists home_widgets jsonb not null default '["balance","projection","fundingGoals","progress","forecasts","recent"]'::jsonb;
alter table public.movements add column if not exists funding_plan_id uuid;
alter table public.movements add column if not exists funding_role text;
alter table public.movements add column if not exists funding_installments integer;
alter table public.movements drop constraint if exists movements_funding_role_check;
alter table public.movements add constraint movements_funding_role_check check (funding_role is null or funding_role in ('target', 'contribution'));
alter table public.movements drop constraint if exists movements_funding_installments_check;
alter table public.movements add constraint movements_funding_installments_check check (funding_installments is null or funding_installments between 2 and 120);
create index if not exists movements_funding_plan_idx on public.movements (user_id, funding_plan_id) where funding_plan_id is not null;

revoke all on table public.profiles from anon;
revoke all on table public.movements from anon;
revoke all on table public.monthly_closings from anon;

grant select, insert, update, delete on table public.profiles to authenticated;
grant select, insert, update, delete on table public.movements to authenticated;
grant select, insert, update, delete on table public.monthly_closings to authenticated;

create policy "profile_select_own" on public.profiles for select to authenticated using ((select auth.uid()) = id);
create policy "profile_insert_own" on public.profiles for insert to authenticated with check ((select auth.uid()) = id);
create policy "profile_update_own" on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
create policy "profile_delete_own" on public.profiles for delete to authenticated using ((select auth.uid()) = id);

create policy "movements_select_own" on public.movements for select to authenticated using ((select auth.uid()) = user_id);
create policy "movements_insert_own" on public.movements for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "movements_update_own" on public.movements for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "movements_delete_own" on public.movements for delete to authenticated using ((select auth.uid()) = user_id);

create policy "closings_select_own" on public.monthly_closings for select to authenticated using ((select auth.uid()) = user_id);
create policy "closings_insert_own" on public.monthly_closings for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "closings_update_own" on public.monthly_closings for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "closings_delete_own" on public.monthly_closings for delete to authenticated using ((select auth.uid()) = user_id);
