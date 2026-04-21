create table if not exists public.user_lie_score_context_coefficients (
  user_id uuid not null references auth.users(id) on delete cascade,
  context_key text not null,
  weekday_time_bucket text not null,
  persona_key text not null default 'global',
  attachment_mix_key text not null default 'none',
  adjustment_bias double precision not null default 0,
  confidence double precision not null default 0,
  samples integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, context_key)
);

create index if not exists user_lie_score_context_coefficients_user_updated_idx
  on public.user_lie_score_context_coefficients (user_id, updated_at desc);

create index if not exists user_lie_score_context_coefficients_bucket_idx
  on public.user_lie_score_context_coefficients (user_id, weekday_time_bucket, persona_key);

alter table public.user_lie_score_context_coefficients enable row level security;

drop policy if exists "user_lie_score_context_coefficients_select_own" on public.user_lie_score_context_coefficients;
create policy "user_lie_score_context_coefficients_select_own"
  on public.user_lie_score_context_coefficients
  for select
  using (auth.uid() = user_id);

drop policy if exists "user_lie_score_context_coefficients_insert_own" on public.user_lie_score_context_coefficients;
create policy "user_lie_score_context_coefficients_insert_own"
  on public.user_lie_score_context_coefficients
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "user_lie_score_context_coefficients_update_own" on public.user_lie_score_context_coefficients;
create policy "user_lie_score_context_coefficients_update_own"
  on public.user_lie_score_context_coefficients
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

