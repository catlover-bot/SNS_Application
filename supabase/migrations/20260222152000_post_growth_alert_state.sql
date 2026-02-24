-- Per-post creator growth alert state (dedupe / threshold progression)

create table if not exists public.user_post_growth_alert_state (
  user_id uuid not null references auth.users(id) on delete cascade,
  post_id uuid not null references public.posts(id) on delete cascade,
  last_notified_at timestamptz null,
  last_save_count integer not null default 0,
  last_reply_count integer not null default 0,
  last_open_count integer not null default 0,
  last_save_rate_bucket integer not null default 0,
  last_reply_rate_bucket integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, post_id)
);

create index if not exists idx_user_post_growth_alert_state_user_updated
  on public.user_post_growth_alert_state (user_id, updated_at desc);

alter table public.user_post_growth_alert_state enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'user_post_growth_alert_state'
      and policyname = 'user_post_growth_alert_state_select_own'
  ) then
    create policy user_post_growth_alert_state_select_own
      on public.user_post_growth_alert_state
      for select
      to authenticated
      using (auth.uid() = user_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'user_post_growth_alert_state'
      and policyname = 'user_post_growth_alert_state_upsert_own'
  ) then
    create policy user_post_growth_alert_state_upsert_own
      on public.user_post_growth_alert_state
      for all
      to authenticated
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end $$;

