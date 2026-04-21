create table if not exists public.user_timeline_signal_weights_history (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  followed_author_boost double precision not null,
  saved_post_boost double precision not null,
  opened_penalty double precision not null,
  interested_persona_boost double precision not null,
  interested_author_boost double precision not null,
  base_score_weight double precision not null,
  predicted_buzz_weight double precision not null,
  recency_weight double precision not null,
  opened_count integer not null default 0,
  saved_count integer not null default 0,
  followed_count integer not null default 0,
  samples integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists user_timeline_signal_weights_history_user_created_idx
  on public.user_timeline_signal_weights_history (user_id, created_at desc);

alter table public.user_timeline_signal_weights_history enable row level security;

drop policy if exists user_timeline_signal_weights_history_select_own on public.user_timeline_signal_weights_history;
create policy user_timeline_signal_weights_history_select_own
  on public.user_timeline_signal_weights_history
  for select
  using (auth.uid() = user_id);

drop policy if exists user_timeline_signal_weights_history_insert_own on public.user_timeline_signal_weights_history;
create policy user_timeline_signal_weights_history_insert_own
  on public.user_timeline_signal_weights_history
  for insert
  with check (auth.uid() = user_id);
