create table if not exists public.user_lie_score_context_coefficient_history (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  context_key text not null,
  weekday_time_bucket text,
  persona_key text not null default 'global',
  attachment_mix_key text not null default 'none',
  adjustment_bias double precision not null default 0,
  confidence double precision not null default 0,
  samples integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists user_lie_score_context_coefficient_history_user_context_created_idx
  on public.user_lie_score_context_coefficient_history (user_id, context_key, created_at desc);

create index if not exists user_lie_score_context_coefficient_history_bucket_idx
  on public.user_lie_score_context_coefficient_history (user_id, weekday_time_bucket, persona_key, created_at desc);

alter table public.user_lie_score_context_coefficient_history enable row level security;

drop policy if exists "user_lie_score_context_coefficient_history_select_own"
  on public.user_lie_score_context_coefficient_history;
create policy "user_lie_score_context_coefficient_history_select_own"
  on public.user_lie_score_context_coefficient_history
  for select
  using (auth.uid() = user_id);

drop policy if exists "user_lie_score_context_coefficient_history_insert_own"
  on public.user_lie_score_context_coefficient_history;
create policy "user_lie_score_context_coefficient_history_insert_own"
  on public.user_lie_score_context_coefficient_history
  for insert
  with check (auth.uid() = user_id);
