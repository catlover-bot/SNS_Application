create table if not exists public.user_timeline_signal_weights (
  user_id uuid primary key references auth.users(id) on delete cascade,
  followed_author_boost double precision not null default 0.28,
  saved_post_boost double precision not null default 0.34,
  opened_penalty double precision not null default 0.16,
  interested_persona_boost double precision not null default 0.17,
  interested_author_boost double precision not null default 0.20,
  base_score_weight double precision not null default 0.38,
  predicted_buzz_weight double precision not null default 0.26,
  recency_weight double precision not null default 0.14,
  opened_count integer not null default 0,
  saved_count integer not null default 0,
  followed_count integer not null default 0,
  samples integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists user_timeline_signal_weights_updated_idx
  on public.user_timeline_signal_weights (updated_at desc);

alter table public.user_timeline_signal_weights enable row level security;

drop policy if exists user_timeline_signal_weights_select_own on public.user_timeline_signal_weights;
create policy user_timeline_signal_weights_select_own
  on public.user_timeline_signal_weights
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists user_timeline_signal_weights_upsert_own on public.user_timeline_signal_weights;
create policy user_timeline_signal_weights_upsert_own
  on public.user_timeline_signal_weights
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
