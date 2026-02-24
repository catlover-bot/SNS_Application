-- Per-user post open/read state for timeline "new/past" persistence.
-- Run in Supabase SQL editor.

create table if not exists public.user_post_open_state (
  user_id uuid not null references auth.users(id) on delete cascade,
  post_id uuid not null,
  source text null,
  opened_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, post_id)
);

create index if not exists idx_user_post_open_state_user_opened
  on public.user_post_open_state (user_id, opened_at desc);

create index if not exists idx_user_post_open_state_updated
  on public.user_post_open_state (user_id, updated_at desc);

alter table public.user_post_open_state enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'user_post_open_state'
      and policyname = 'user_post_open_state_select_own'
  ) then
    create policy user_post_open_state_select_own
      on public.user_post_open_state
      for select
      to authenticated
      using (auth.uid() = user_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'user_post_open_state'
      and policyname = 'user_post_open_state_insert_own'
  ) then
    create policy user_post_open_state_insert_own
      on public.user_post_open_state
      for insert
      to authenticated
      with check (auth.uid() = user_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'user_post_open_state'
      and policyname = 'user_post_open_state_update_own'
  ) then
    create policy user_post_open_state_update_own
      on public.user_post_open_state
      for update
      to authenticated
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'user_post_open_state'
      and policyname = 'user_post_open_state_delete_own'
  ) then
    create policy user_post_open_state_delete_own
      on public.user_post_open_state
      for delete
      to authenticated
      using (auth.uid() = user_id);
  end if;
end $$;
